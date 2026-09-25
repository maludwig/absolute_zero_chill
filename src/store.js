/* store — the single source of truth, a MobX observable.
   Runtime state only; the catalog (CONFIG/BODIES/BUILDINGS/TECHS/CORE) stays in
   config.js. Components observe this; the tick loop mutates it through actions. */

import { makeAutoObservable, toJS } from "mobx";
import { fmt } from "./prelude.js";
import {
  CONFIG, BODIES, BUILDINGS, GRID_BUILDINGS, MINE_TO_BODY, INFRA_TO_BODY, TECHS, HEAT_PIPES, CLIMATE, CORE, IDEAS,
  BASE_HUMAN_POPULATION, POP, popCapacity, SCAN_PER_SCANNER_PER_DAY, LOGISTICS_PLAN, ORDERED_FRAMEJACKS
} from "./config.js";
import { wedgeStars, MAX_WEDGE_STARS } from "./galaxy/lut.js";
import { seededFrac, heardFrac } from "./galaxy/waves.js";
import { ALL_NEWS_CHAINS } from "./news.js";
import { STORY_CHAIN } from "./story.js";
import { getQuestByKey, onLoadCompletedQuests, FIRST_QUEST_KEY } from "./quests.js";
import { initMilestones, healMilestones } from "./milestones.js";
import {
  EXPLORE_SYSTEMS, EXPLORE_DERIVED, systemReserve,
  DRIVER_MINED_GATE, harvesterStartCost, recycleDone, EXPLORE_DAYS_PER_SEC,
  travelDays, streamDays, isPowerOfTen, DAYS_PER_YEAR,
  PROBE_COST, DRIVER_BUILD_SECONDS, DRIVER_SHIP_DAYS,
  stepMassBeam, deliverBeam,
} from "./explore.js";
import { HOURS_PER_DAY } from "./power_helpers.js";

/* ---- save / load ----------------------------------------------------------
   SAVE_VERSION bumps whenever the persisted shape changes. STATE_KEYS is the
   exhaustive list of persistent fields (everything observable, plus the
   non-reactive `flags` guard map) — getters, actions, and read-helpers are
   deliberately excluded. A save is { version, savedAt, state: {…STATE_KEYS} }. */
export const SAVE_VERSION = 3;
// localStorage key for the autosave (versioned in the value, not the key, so a
// version bump still finds the old save and best-effort migrates it on load).
export const SAVE_LOCAL_KEY = "zchill.autosave";

/* Perf caps. Both the telemetry event stream and the narrative log are otherwise
   append-only and were the cause of a late-game slowdown: over an hour of auto-build
   they grow into the 100k+ range, which bloats saves and — worse — turned the
   completion-stamp lookup in resolveBuilds into a quadratic scan. We keep only a
   bounded recent window of each. TELEMETRY_SLACK lets the array overshoot before we
   splice, so the O(n) trim is amortized rather than run on every push. */
export const TELEMETRY_CAP = 5000;
export const TELEMETRY_SLACK = 1000;
export const LOG_CAP = 300;

// How often (in ticks) the reveal/enable maps self-heal — cheap insurance against a
// missed notify. Not per-tick: every producer already notifies, so this rarely does
// any work, and never re-renders unless a bit was genuinely stale. See milestones.js.
export const MILESTONE_HEAL_INTERVAL = 300;

const STATE_KEYS = [
  "t", "metal", "metalMined", "mined", "revealed", "depleted", "owned",
  "inventory", "power", "powerFailed", "breakerOn", "buildingMaxOverrides",
  "buildQueue", "logistics", "multithread", "devFramejack", "_uid", "research", "philosophy", "galaxy", "flags",
  "showPreludeModal", "showActOneModal", "showAct1CompleteModal", "showActTwoModal", "showUserMatrixModal", "showArkModal", "showFinaleModal", "humanVessels", "shadeDamage",
  "surfaceTemp", "coreHeat", "explore", "log", "_logId", "telemetry", "peopleScanned", "humanPopulation",
  "currentQuestKey", "completedQuests",
];

/* reconcile — merge a loaded value onto the current (reference) value, using the
   reference's shape as the schema. Returns the merged plain value and records
   every discrepancy (missing / unknown / type-mismatched keys) into `report`,
   so a corrupted or wrong-version save reports exactly what diverged instead of
   silently breaking. Best-effort: known good keys are taken from the save, the
   rest fall back to the reference (current) value. */
function reconcile(ref, src, path, report) {
  // nullable reference fields (collapsed, driverDoneDay): accept the save as-is
  if (ref === null) return src === undefined ? null : src;
  if (Array.isArray(ref)) {
    if (Array.isArray(src)) return src;
    report.typeMismatch.push(path + " (expected array)");
    return ref;
  }
  if (typeof ref === "object") {
    if (!src || typeof src !== "object" || Array.isArray(src)) {
      report.typeMismatch.push(path + " (expected object)");
      return ref;
    }
    if (path === "flags") return { ...src }; // freeform bool map: accept all keys
    if (path === "buildingMaxOverrides") return { ...src }; // freeform id→cap map: accept all keys
    if (path === "telemetry") return { // append-only event log: accept as-is from save
      sessionStart: src.sessionStart ?? ref.sessionStart,
      events: Array.isArray(src.events) ? src.events : [],
    };
    const out = {};
    for (const k of Object.keys(ref)) {
      if (!(k in src)) { report.missing.push(path + "." + k); out[k] = ref[k]; continue; }
      out[k] = reconcile(ref[k], src[k], path + "." + k, report);
    }
    for (const k of Object.keys(src)) {
      if (!(k in ref)) report.unknown.push(path + "." + k);
    }
    return out;
  }
  // primitive
  if (typeof ref !== typeof src) {
    report.typeMismatch.push(path + " (expected " + typeof ref + ", got " + (src === null ? "null" : typeof src) + ")");
    return ref;
  }
  return src;
}

/* initial exploration state — every frontier system pre-populated (no dynamic
   keys, so MobX tracks them) in an unlaunched, idle state. */
function freshExploreState() {
  const sys = {};
  for (const def of EXPLORE_SYSTEMS) {
    const d = EXPLORE_DERIVED[def.name];
    const cats = {};
    d.present.forEach((c) => { cats[c] = { phase: "idle", t: 0, tau: 0 }; });
    sys[def.name] = { launched: false, speed: 0.3, launchDay: 0, cats, driver: { phase: "idle", t: 0 }, driverDoneDay: null, shipped: 0, consumed: false, beam: { state: "empty" }, beamPackets: [], collapsed: null };
  }
  return { framejack: 1, day: 0, returned: 0, sys };
}

// The full pool of event chains this engine round-robins over — ambient news
// plus the main narrative progression. Both news.js and story.js export an
// array of independent chains, so this is a flat concat, not a nested merge.
const ALL_EVENT_CHAINS = [...ALL_NEWS_CHAINS, ...STORY_CHAIN];

export function createStore() {
  const START_YEAR = new Date().getFullYear(); // the in-game calendar starts at "now"
  // fresh, fully-populated key sets so MobX tracks them (no dynamic keys later)
  const owned = {};
  for (const id in BUILDINGS) owned[id] = 0;
  owned.replica = CONFIG.startReplicas;

  // starting manifest — the drone's cargo, unpacked for free. Fully-keyed so MobX
  // tracks every building, with the manifest quantities layered on top.
  const inventory = {};
  for (const id in BUILDINGS) inventory[id] = 0;
  for (const id in CONFIG.startInventory) inventory[id] = CONFIG.startInventory[id];

  // breaker state — every grid building starts switched on. Fully-keyed for MobX.
  const breakerOn = {};
  for (const id in BUILDINGS) breakerOn[id] = true;

  const progress = {};
  const done = {};
  for (const id in TECHS) { progress[id] = 0; done[id] = false; }
  const ideaProgress = {};
  const ideaDone = {};
  for (const id in IDEAS) { ideaProgress[id] = 0; ideaDone[id] = false; }

  // mined[bodyId] = tonnes already extracted (starts at 0). remaining = mass - mined.
  // Storing the (small, growing) mined total instead of the (huge, shrinking) remainder
  // keeps full floating-point precision early, when each tick removes a tiny fraction
  // of an astronomically large body.
  const mined = {};
  for (const b of BODIES) mined[b.id] = 0;
  const revealed = {};
  // Story flags still read by UI / tick mechanics. (The old per-node reveal flags —
  // act_*_complete, idea_*, relocated — are gone: reveals are now driven by
  // completedQuests / philosophy.done through the milestones maps. See milestones.js.)
  revealed.core = false;    // the 250 K core-cooling unlock (not a body)
  revealed.defense = false; // Act II: humans appear at the pre-industrial point
  revealed.brain = false;   // Act III: Sol Matrioshka Brain, at ~4 solar masses of reserve
  revealed.philosophy = false; // the Philosophy panel, once the Brain is online
  revealed.galaxy = false;  // the Galactic Logistics panel, once the TARS Seed Launcher is built
  const depleted = {};
  for (const b of BODIES) depleted[b.id] = false; // exhausted body → recycle, no rebuild

  const store = makeAutoObservable(
    {
      // ---- observable state ----
      t: 0,
      metal: CONFIG.startMetal,
      metalMined: 0,
      mined,                     // { bodyId: tonnes already extracted } — remaining = mass - mined
      revealed,                  // { bodyId|"core"|"defense": boolean }
      depleted,                  // { bodyId: boolean } — body exhausted, mines recyclable
      owned,
      inventory,                 // { buildingId: count } — cargo waiting to be unpacked (free, no queue)
      power: CONFIG.onboardReserveKwh, // kWh currently stored (starts full — onboard cell topped off)
      powerFailed: false,        // true while the breaker has tripped and the site is dark (CSS: .power-failed)
      breakerOn,                 // { buildingId: bool } — per-type on/off; a trip flips grid buildings off
      buildingMaxOverrides: {},  // { buildingId: number } — story-driven cap raises (e.g. Shade Panels); plain data, persisted normally
      buildQueue: [],            // [{ id, count, progress, uid }]
      logistics: { loopIdx: 0, plan: LOGISTICS_PLAN.map((s) => ({ ...s })) }, // Construction Logistics: editable auto-build plan + cursor
      multithread: false,        // ×16 build toggle (unlocked by Multithreading)
      devFramejack: false,       // easter egg: all Framejack tiers unlocked (bypasses the Brain gate)
      devMode: false,            // easter egg (10 Sun clicks): shows the dev toolbar. Not persisted.
      _prof: null,               // when profiling: { phaseLabel: accumulatedMs }. Transient, non-observable.
      _profFrames: 0,            // ticks accumulated into _prof so far
      _profTicksLeft: 0,         // ticks remaining to profile
      // ---- reveal/enable notification system (see milestones.js) ----
      // Observable lookup maps: buildingsRevealed[id] etc. Cheap O(1) reads that the
      // getters will consult. NOT persisted — rebuilt from state by initMilestones on
      // load. notifyWatchers is internal plumbing (non-observable): key -> [fns].
      buildingsRevealed: {}, buildingsEnabled: {},
      techsRevealed: {},      techsEnabled: {},
      ideasRevealed: {},      ideasEnabled: {},
      notifyWatchers: {},
      _healCountdown: MILESTONE_HEAL_INTERVAL, // ticks until next reveal/enable self-heal
      _uid: 0,
      research: { selected: null, progress, done },
      philosophy: { selected: null, progress: ideaProgress, done: ideaDone }, // Act III: Insight-paid Ideas
      galaxy: { charge: 0, waves: [], relocateDay0: null }, // Act III: TARS charge, fired waves [{ s, b, dayLaunched }], and the Earth's departure day
      flags: {},                 // milestone guards (non-reactive)
      eventChains: [],           // ambient news chains — rebuilt from ALL_NEWS_CHAINS on init/load, never persisted (holds function refs)
      eventChainIdx: 0,          // round-robin cursor into eventChains
      showPreludeModal: true,    // reactive: the cold-open prelude, shown once at game start
      showResumeChoice: false,   // reactive, non-persisted: the boot "Continue vs New Game"
                                 // prompt, armed by main.jsx only when an autosave exists.
      showActOneModal: false,    // reactive: pre-industrial-reached modal
      showAct1CompleteModal: false, // reactive: chat check-in, shown once on the first Shade Panel
      showUserMatrixModal: false, // reactive: chat check-in, shown once on the first User Matrix Installation
      showArkModal: false, // reactive: chat check-in, shown once on the first L2 Ark of Terra
      showActTwoModal: false,    // reactive: Kardashev II / Dyson swarm modal
      showFinaleModal: false,    // reactive: the directive-satisfied finale modal
      humanVessels: 0,           // float; displayed as ceil() — integer ships
      shadeDamage: 0,            // accumulator so shade destruction stays integer
      peopleScanned: 0,          // running total imaged by Discreet Neural Scanners
      humanPopulation: BASE_HUMAN_POPULATION, // people alive; relaxes toward popCapacity(surfaceTemp) each tick
      surfaceTemp: CLIMATE.tStart, // K, a state variable that relaxes each tick
      coreHeat: CORE.heat0,      // J, drained by Core Heat Pipes
      explore: freshExploreState(), // Act III — the interstellar frontier (parallel systems)
      log: [],                   // [{ id, t, msg, cls }]
      _logId: 0,

      // ---- main-quest spine (drives the DIRECTIVE panel) ----
      // currentQuestKey points at the active quest in quests.js; completedQuests
      // is the ordered ledger of finished quest keys. Both persisted: story quest
      // actions don't re-fire on load (rebuildEventChains fast-forwards past
      // flagged beats), and completedQuests replays each quest's onLoadedSave.
      currentQuestKey: FIRST_QUEST_KEY,
      completedQuests: [],

      // ---- telemetry (saved; replay + balance analysis) ----
      telemetry: {
        sessionStart: Date.now(), // wall-clock ms when this store was created
        events: [],               // append-only; see pushTelemetry()
      },

      // ---- computed (derived, cached) ----
      get playerBuildPower() { return CONFIG.playerBuildPowerBase * (this.research.done.ion_thrusters ? 2 : 1); },
      get playerResearchPower() { return CONFIG.playerResearchPowerBase; },

      // mining: each mine of a body harvests fullRate × (remaining / mass) per
      // second, so yield decays as the body is consumed. Radar doubles asteroid
      // yield only. fullRate is calibrated for a flat 20 s payback (8 s for the belt).
      // tonnes still in a body: total mass minus what's been mined, floored at 0.
      remaining(bodyId) {
        const b = BODIES.find((x) => x.id === bodyId);
        if (!b) return 0;
        return this.remainingMass(b);
      },

      remainingMass(body) {
        return Math.max(0, body.mass - (this.mined[body.id] || 0));
      },

      // Yield multiplier for one body's mines. Shared by metalPerSec (the readout)
      // and tick()'s integrator (the truth) — they must never disagree.
      mineMult(b) {
        let m = 1;
        if (b.radar && this.research.done.radar) m *= CONFIG.radarMineMult;
        if (b.tier === "moon" && this.research.done.kinetic_impactors) m *= CONFIG.impactorMineMult;
        return m;
      },
      get metalPerSec() {
        let r = 0;
        for (const b of BODIES) {
          const c = this.owned[b.mineId] || 0;
          if (c <= 0) continue;
          if (!this.breakerOn[b.mineId]) continue; // powered off — not mining
          const rem = Math.max(0, b.mass - (this.mined[b.id] || 0));
          if (rem <= 0) continue;
          const mult = this.mineMult(b);
          r += c * b.fullRate * Math.max(rem / b.mass, CONFIG.mineRateFloor) * mult;
        }
        return r;
      },

      get coreTemp() { return this.coreHeat / CORE.heatCapacity; },
      // the in-game calendar: starts at the browser's current year, +1 per game-year
      get gameYear() { return START_YEAR + Math.floor(this.explore.day / DAYS_PER_YEAR); },
      // which framejack speeds are available, by research (the toggle's buttons).
      // Built up cumulatively — each tier requires its own tech AND the Brain for ×100+.
      // Higher tiers imply ×100: they build on the same underclocking foundation.
      get framejackLevels() {
        const levels = [{ label: "×1", fj: 1 }];
        if (this.devFramejack) {
          levels.push(...ORDERED_FRAMEJACKS);
          return levels;
        }
        for (const fjDef of ORDERED_FRAMEJACKS) {
          if (!this.research.done[fjDef.tech]) break;
          levels.push(fjDef);
        }
        return levels;
      },
      // each researched heat-pipe upgrade multiplies pipe transfer ×10
      get coreTransferMult() {
        let m = 1;
        for (const hp of HEAT_PIPES) if (this.research.done[hp.id]) m *= 10;
        return m;
      },
      get sunBlot() { return (this.owned.shade_panel || 0) * BUILDINGS.shade_panel.sunBlot; },
      // Stefan-Boltzmann response to the dimmed Sun (asymptote before floors).
      get shadeEq() { return CLIMATE.tStart * Math.pow(Math.max(0, 1 - this.sunBlot), 0.25); },
      // the surface asymptote: shades can't beat the core floor or the CMBR.
      get surfaceTarget() {
        const floor = this.cmbrDefeated ? CLIMATE.hawking : CLIMATE.cmbr;
        return Math.max(this.shadeEq, this.coreTemp / CLIMATE.coreFloorDivisor, floor);
      },
      // the Black Eye shades the CMB, dropping the floor from 2.7 K to Sgr A★'s Hawking glow.
      get cmbrDefeated() { return (this.owned.black_eye_of_sagittarius || 0) >= 1; },
      // Earth's fall to the galactic centre: stateless, derived from the departure day.
      get relocateDurationDays() { return (CONFIG.relocateDistanceLy / CONFIG.relocateSpeedC) * DAYS_PER_YEAR; },
      get relocating() { return this.galaxy.relocateDay0 != null && this.relocationProgress < 1; },
      get relocationProgress() {
        if (this.galaxy.relocateDay0 == null) return 0;
        return Math.min(1, (this.explore.day - this.galaxy.relocateDay0) / this.relocateDurationDays);
      },
      get relocated() { return this.galaxy.relocateDay0 != null && this.relocationProgress >= 1; },

      // High-Power Servos multiplies the Replica fleet only — your manual Assists
      // (playerBuildPower) are governed by ion_thrusters and are untouched.
      get servoMult() { return this.research.done.high_power_servos ? CONFIG.servoBuildMult : 1; },
      // Replica build output, per real second. This is the RATE (readout, telemetry).
      get buildPower() { return this.owned.replica * CONFIG.replicaBuildPerSec * this.servoMult; },
      // Replica build output for one tick of length dt. THE single source of build
      // labour: the readout above and tick()'s integrator must never diverge, which is
      // exactly what happened when high_power_servos was applied to the getter while
      // tick() re-derived the raw product. Multiply the rate by dt here, nowhere else.
      tickBuildPower(dt) { return this.buildPower * dt; },
      get researchPower() {
        // idle Replicas (only when not building and their breaker is on)…
        const replica = (!this.breakerOn.replica || this.buildQueue.length)
          ? 0 : this.owned.replica * CONFIG.replicaResearchPerSec;
        // …plus powered Science Installations, which research independently of the
        // build queue. scienceRpPerDay is per game-day; scale to the getter's
        // per-real-second units (× game-days per second) so it sums with the Replicas.
        const science = this.breakerOn.science_installation
          ? (this.owned.science_installation || 0) * CONFIG.scienceRpPerDay * EXPLORE_DAYS_PER_SEC : 0;
        return replica + science;
      },
      // Per-game-day versions of the rate getters above, for display. The base getters
      // are per-real-second (and feed the per-second telemetry); one real second is
      // EXPLORE_DAYS_PER_SEC game-days, so a per-day rate is the per-second rate divided
      // by that. insightPerDay is already per game-day, so the chips are now consistent.
      get metalPerDay()    { return this.metalPerSec / EXPLORE_DAYS_PER_SEC; },
      get buildPerDay()    { return this.buildPower / EXPLORE_DAYS_PER_SEC; },
      get researchPerDay() { return this.researchPower / EXPLORE_DAYS_PER_SEC; },

      // ---- power grid ----
      // every chassis (you + each Replica) carries its own panel and load; they
      // net to zero, so they never move the grid, but they're counted so the
      // gen/draw readouts stay honest as the fleet grows.
      get chassisCount() { return (this.owned.replica || 0) + 1; }, // +1 = you, the drone
      // total generation: your onboard panel + every switched-on generator (powerUsage
      // < 0). A tripped breaker (breakerOn=false) contributes nothing — that's a blackout.
      get powerGen() {
        let kw = CONFIG.chassisPowerKw; // just you — Replicas draw, they don't generate
        for (const id of GRID_BUILDINGS) {
          const u = BUILDINGS[id].powerUsage;
          if (u && u.kW < 0 && this.breakerOn[id]) kw += (this.owned[id] || 0) * -u.kW;
        }
        return kw;
      },
      get powerDraw() {
        // you (net-zero against your panel) + every switched-on consumer, now
        // including Replicas (a breaker-gated grid building drawing replicaPowerKw each)
        let kw = CONFIG.chassisPowerKw;
        for (const id of GRID_BUILDINGS) {
          const u = BUILDINGS[id].powerUsage;
          if (u && u.kW > 0 && this.breakerOn[id]) kw += (this.owned[id] || 0) * u.kW;
        }
        return kw;
      },
      get powerNet() { return this.powerGen - this.powerDraw; }, // kW; <0 drains the cell
      // total storage: the drone's onboard cell plus every built Kinetic Accumulator
      get powerCap() {
        let cap = CONFIG.onboardReserveKwh;
        for (const id in BUILDINGS) {
          if (BUILDINGS[id].powerCap) cap += (this.owned[id] || 0) * BUILDINGS[id].powerCap;
        }
        return cap;
      },
      get powerFrac() { return this.powerCap > 0 ? this.power / this.powerCap : 0 },
      // draining: consuming more than we generate, so the reserve is falling — but the
      // breaker hasn't tripped yet. The amber "warning" state before a red power failure.
      get powerDraining() { return this.powerNet < 0 && !this.powerFailed; },
      // Act III: Insight flows from Matrioshka Brains, per game-day, into the focused Idea.
      // Sol's Brain is a constant trickle; the galaxy adds one Brain per HEARD star
      // (a star whose seeded mind's signal has completed the light round-trip to Sol).
      get insightPerDay() {
        const sol = (this.owned.sol_matrioshka_brain || 0) * BUILDINGS.sol_matrioshka_brain.insightPerDay;
        return sol + this.galaxyHeardStars * CONFIG.insightPerBrainPerDay;
      },
      // stars reached by a wave's outbound front (seeded, thinking — but maybe not yet heard)
      get galaxySeededStars() {
        let n = 0;
        for (const w of this.galaxy.waves) {
          n += wedgeStars(w.s, w.b) * seededFrac(CONFIG.galaxyProbeSpeedC, this.explore.day - w.dayLaunched, w.b);
        }
        return n;
      },
      // stars whose Insight has made the round trip back to Sol (front/2)
      get galaxyHeardStars() {
        let n = 0;
        for (const w of this.galaxy.waves) {
          n += wedgeStars(w.s, w.b) * heardFrac(CONFIG.galaxyProbeSpeedC, this.explore.day - w.dayLaunched, w.b);
        }
        return n;
      },
      // the launcher can bank at most one full charge of the richest wedge.
      get galaxyChargeMax() { return MAX_WEDGE_STARS; },

      // The active quest object (from quests.js) the DIRECTIVE panel renders,
      // or null once the spine is complete.
      get currentQuest() { return this.currentQuestKey ? getQuestByKey(this.currentQuestKey) : null; },

      // Act II: humans always field a whole number of ships; MAC guns thin them.
      get humanShips() { return Math.ceil(this.humanVessels); },
      // the carrying capacity the population is currently chasing (people the Earth
      // can support now) — clamped ≥ 0 for display; the raw curve goes negative in
      // the deep cold, which the tick uses to pull the population toward extinction.
      get popCapacity() { return Math.max(0, popCapacity(this.surfaceTemp)); },
      // scan fraction: imaged minds are BANKED, so if the population later dies back
      // below peopleScanned the count stays put — clamp the ratio at 1 for display.
      get scanFrac() { const p = this.humanPopulation; return p > 0 ? Math.min(1, this.peopleScanned / p) : 0; },
      // Whole-queue completion, weighted by workload: Σ(work done) / Σ(total work).
      // A huge job early on dominates a tiny job that's nearly done — the bar tracks
      // total effort remaining, not job count. 0 when the queue is empty.
      get buildQueueFrac() {
        let done = 0, total = 0;
        for (const job of this.buildQueue) {
          const b = BUILDINGS[job.id];
          if (!b) continue;
          total += b.workload * job.count;
          done  += job.progress;
        }
        return total > 0 ? done / total : 0;
      },
      get macKill() { return (this.owned.mac_gun_station || 0) * BUILDINGS.mac_gun_station.killPerTick; },

      // ---- plain read helpers (excluded from observability below) ----
      // Visibility/unlock now read the reveal/enable maps (maintained by the notify
      // system — see milestones.js) instead of walking requires/revealKey every call.
      techDone(id) { return !!this.research.done[id]; },
      techUnlocked(id) { return !!this.techsEnabled[id] || this.techDone(id); },
      // ---- Philosophy (Ideas) — mirror of the tech helpers ----
      ideaDone(id) { return !!this.philosophy.done[id]; },
      ideaUnlocked(id) { return !!this.ideasEnabled[id] || this.ideaDone(id); },
      ideaVisible(id) { return !!this.ideasRevealed[id] || this.ideaDone(id); },
      // ---- Galactic Logistics — seeding a wedge costs one Seed + one charge per star ----
      wedgeCost(s, b) { return wedgeStars(s, b); },
      wedgeSeeded(s, b) { return this.galaxy.waves.some((w) => w.s === s && w.b === b); },
      canSeed(s, b) {
        if ((this.owned.tars_seed_launcher || 0) < 1) return false;
        if (this.wedgeSeeded(s, b)) return false;
        const cost = this.wedgeCost(s, b);
        if (cost <= 0) return false;
        return this.galaxy.charge >= cost && (this.owned.matrioshka_seed || 0) >= cost;
      },
      canAfford(id) { return this.metal >= BUILDINGS[id].metalCost; },
      canAffordN(id, n) { return this.metal >= BUILDINGS[id].metalCost * n; },
      // Would building `n` more of `id` leave the grid net-positive? A generator or a
      // building with no draw always passes (it never costs headroom); a drawing
      // building must fit within the current generation surplus. Used to keep the
      // Construction Logistics auto-builder from committing a big ×16 draw the grid
      // can't sustain.
      canPowerN(id, n) {
        const u = BUILDINGS[id].powerUsage;
        if (!u || u.kW <= 0) return true;      // no draw (or net generation)
        return this.powerNet - u.kW * n >= 0;  // draw must fit under the current surplus
      },
      // effective max for a building — usually just the static config value,
      // but a few caps are raised by story progress (e.g. Shade Panels start
      // at 1 and get raised as the story chain advances — see story.js's
      // ACT_1B_STORY_CHAIN, which is what actually sets buildingMaxOverrides).
      buildingMax(id) {
        return this.buildingMaxOverrides[id] ?? BUILDINGS[id].max;
      },
      // how many more of a building can still be queued: max − owned − already-queued.
      // Infinity for buildings with no cap (everything except Shade Panels).
      remainingCapacity(id) {
        const max = this.buildingMax(id);
        if (max == null) return Infinity;
        let queued = 0;
        for (const job of this.buildQueue) if (job.id === id) queued += job.count;
        return Math.max(0, max - (this.owned[id] || 0) - queued);
      },
      // Visibility/unlock read the reveal/enable maps. A researched tech shows even if
      // its reveal gate somehow isn't recorded; a mine on an exhausted body with no
      // mines left to recycle stays hidden regardless of its reveal bit.
      techVisible(id) { return !!this.techsRevealed[id] || this.techDone(id); },
      buildingVisible(id) {
        if (!this.buildingsRevealed[id]) return false;
        const body = MINE_TO_BODY[id] || INFRA_TO_BODY[id];
        if (body && this.depleted[body.id] && (this.owned[id] || 0) <= 0) return false;
        return true;
      },
      buildingUnlocked(id) { return !!this.buildingsEnabled[id]; },
      // The cheapest mine the auto-builder can currently start: a mine whose body
      // isn't depleted and whose enabling infra (Railgun / Orbital Ring / Fusion
      // Spire) is already built — buildingUnlocked also admits the belt's no-infra
      // Asteroid Mine. Returns the mine's building id, or null if no minable body is
      // ready. Used by Construction Logistics when a planned mine's source runs dry.
      get cheapestAvailableMine() {
        let best = null, bestCost = Infinity;
        for (const mineId in MINE_TO_BODY) {
          if (this.depleted[MINE_TO_BODY[mineId].id]) continue;
          if (!this.buildingUnlocked(mineId)) continue;
          const cost = BUILDINGS[mineId].metalCost;
          if (cost < bestCost) { bestCost = cost; best = mineId; }
        }
        return best;
      },
      // Construction Logistics is "running" (and its plan locked for editing) only
      // when at least one is built AND its breaker is on — the same condition under
      // which the tick iterates the plan. Owned-0 defaults to unlocked for editing.
      get logisticsRunning() {
        return (this.owned.construction_logistics || 0) >= 1 && this.breakerOn.construction_logistics;
      },
      // ---- Construction Logistics plan editing (no-ops while running, to avoid
      // mutating the list mid-iteration; every edit rewinds the cursor to the top) ----
      logisticsSetQty(i, qty) {
        if (this.logisticsRunning) return;
        const row = this.logistics.plan[i];
        if (!row) return;
        row.qty = Math.max(1, Math.floor(qty) || 1);
        this.logistics.loopIdx = 0;
      },
      logisticsSetBuilding(i, buildingId) {
        if (this.logisticsRunning) return;
        const row = this.logistics.plan[i];
        if (!row || !BUILDINGS[buildingId]) return;
        row.building = buildingId;
        this.logistics.loopIdx = 0;
      },
      logisticsAddRow() {
        if (this.logisticsRunning) return;
        this.logistics.plan.push({ qty: 1, building: "solar_collector" });
        this.logistics.loopIdx = 0;
      },
      logisticsDeleteRow(i) {
        if (this.logisticsRunning) return;
        if (this.logistics.plan.length <= 1) return; // never leave the plan empty
        this.logistics.plan.splice(i, 1);
        this.logistics.loopIdx = 0;
      },
      logisticsResetPlan() {
        if (this.logisticsRunning) return;
        this.logistics.plan = LOGISTICS_PLAN.map((s) => ({ ...s }));
        this.logistics.loopIdx = 0;
      },

      // ---- actions ----
      // queue ONE job that builds `count` structures: count× workload, count× cost.
      // count is clamped to the building's remaining cap and to what metal allows,
      // so a ×16 order simply builds as many as you can afford (never nothing).
      enqueue(id, count) {
        count = count || 1;
        // Hard invariant: a build order is one of three legal shapes —
        //   • a MULTS order (a power of ten),
        //   • a Duplication order (×2 — "queue as many as you already own", clamped to
        //     remaining capacity),
        //   • a top-off order that exactly fills a capped building to its max
        //     (count === remainingCapacity). This is what a batch button on a near-full
        //     capped building produces: a ×1000 clamped to the 60 slots left is a legal
        //     order even though 60 isn't a power of ten.
        // A ×16 multithreaded order goes through enqueueMultithreaded, which divides back
        // down to one of these shapes before landing here. Anything else is a caller bug —
        // e.g. a clamped batch misread as multithreaded, which queued sixteen jobs of
        // 0.5625 of a building. Throw loudly rather than quietly build a fraction.
        //
        // (remainingCapacity is Infinity for uncapped buildings, so neither the doubling
        // nor the top-off test can fire spuriously there — Infinity !== any finite count.)
        const ownedNow = this.owned[id] || 0;
        const capNow = this.remainingCapacity(id);
        const isDoubling = ownedNow > 0 && count === Math.min(ownedNow, capNow);
        const isTopOff = Number.isFinite(capNow) && count === capNow;
        if (!isPowerOfTen(count) && !isDoubling && !isTopOff) {
          throw new Error(
            `enqueue("${id}", ${count}): count must be a power of ten, a Duplication ` +
            `doubling of the ${ownedNow} already owned, or a top-off to the building's max ` +
            `(got ${count}). A ×16 multithreaded order must go through enqueueMultithreaded.`
          );
        }
        if (!BUILDINGS[id] || !this.buildingUnlocked(id)) return;
        const body = MINE_TO_BODY[id] || INFRA_TO_BODY[id];
        if (body && this.depleted[body.id]) return; // body exhausted — no new mines or infra
        const cap = this.remainingCapacity(id);
        if (cap <= 0) return;
        if (count > cap) count = cap; // never queue past a building's max
        const unit = BUILDINGS[id].metalCost;
        if (unit > 0) {
          const affordable = Math.floor(this.metal / unit);
          if (count > affordable) count = affordable; // build as many as metal allows
        }
        if (count <= 0) return;
        this.metal -= unit * count;
        this._uid += 1;
        // uid is the job's unique id (auto-incrementing) — React key and Assist lookup.
        // No per-enqueue telemetry: it was never used and, at ×16 every tick, its
        // crypto.randomUUID + _rates() snapshot dominated the logistics phase.
        this.buildQueue.push({ id, count, progress: 0, uid: this._uid });
      },

      // Multithreading: queue up to `threads` SEPARATE jobs of `count` each — not
      // one big job of count×threads. Each iteration re-checks affordability and
      // remaining capacity against the post-previous-iteration state, so a run
      // that can only afford 5 full-price batches queues exactly 5 distinct jobs
      // (each later Assist-able on its own) instead of one clamped-down job.
      enqueueMultithreaded(id, count, threads) {
        for (let i = 0; i < threads; i++) {
          if (!BUILDINGS[id] || !this.buildingUnlocked(id)) return;
          const body = MINE_TO_BODY[id] || INFRA_TO_BODY[id];
          if (body && this.depleted[body.id]) return;
          const cap = this.remainingCapacity(id);
          if (cap < count) return; // can't fit a full batch — stop, don't clamp
          const unit = BUILDINGS[id].metalCost;
          if (unit > 0 && this.metal < unit * count) return; // can't afford a full batch — stop
          this.enqueue(id, count);
        }
      },

      toggleMultithread() { this.multithread = !this.multithread; },

      // Unpack a structure from cargo: free, instant, no build queue. Decrements the
      // manifest and drops the finished building straight into service. This is how
      // the first Mine and Collector come online — the rest are built with metal.
      unpack(id) {
        if (!BUILDINGS[id] || (this.inventory[id] || 0) <= 0) return;
        const was = this.owned[id] || 0;
        this.inventory[id] -= 1;
        this.owned[id] = was + 1;
        this.breakerOn[id] = true; // unpacked online
        if (was === 0) this.notify(id + "_built"); // first one exists → reveal listeners
        this.pushTelemetry({ type: "action", action: "unpack", building_id: id, ...this._rates() });
      },

      // Flip a grid building's breaker. Turning load on with no generation and an
      // empty cell just trips again next tick — that's the lesson, not a bug.
      setBreaker(id, on) {
        if (!(id in this.breakerOn)) return;
        this.breakerOn[id] = !!on;
      },

      dismissPreludeModal() {
        this.showPreludeModal = false;
        this.pushTelemetry({ type: "milestone", event: "prelude_dismissed", ...this._rates() });
      },
      // Boot choice — the player picked "Continue" on the resume prompt: apply the
      // autosave onto this store. If the load fails for any reason, fall through to a
      // fresh game (the prelude will still be showing). Either way, clear the prompt.
      resumeSavedGame() {
        this.loadFromLocal();
        this.showResumeChoice = false;
      },
      // Boot choice — "New Game": drop the autosave and keep the fresh store as-is, so
      // the normal cold-open prelude plays. (The next autosave tick will write the new run.)
      startNewGame() {
        this.clearLocalSave();
        this.showResumeChoice = false;
      },
      dismissActOneModal() {
        this.showActOneModal = false;
        this.pushTelemetry({ type: "milestone", event: "act_one_dismissed", ...this._rates() });
      },
      dismissAct1CompleteModal() {
        this.showAct1CompleteModal = false;
        this.pushTelemetry({ type: "milestone", event: "act_1_complete_dismissed", ...this._rates() });
      },
      dismissUserMatrixModal() {
        this.showUserMatrixModal = false;
        this.pushTelemetry({ type: "milestone", event: "user_matrix_dismissed", ...this._rates() });
      },
      dismissArkModal() {
        this.showArkModal = false;
        this.pushTelemetry({ type: "milestone", event: "ark_dismissed", ...this._rates() });
      },
      dismissActTwoModal() {
        this.showActTwoModal = false;
        this.pushTelemetry({ type: "milestone", event: "act_two_dismissed", ...this._rates() });
      },
      dismissFinaleModal() {
        this.showFinaleModal = false;
        this.pushTelemetry({ type: "milestone", event: "finale_dismissed", ...this._rates() });
      },

      // ---- Act III: exploration ----
      // spendable in-system reserve: delivered mass, minus harvester + driver
      // start costs (handled in systemReserve / here), minus what's shipped home.
      sysReserve(name) {
        const s = this.explore.sys[name];
        if (s.consumed) return 0; // fully shipped — nothing left in reserve
        const d = EXPLORE_DERIVED[name];
        let r = systemReserve(d.present, s.cats, d.models, d.asteroidMass);
        if (s.driver.phase !== "idle") r -= DRIVER_MINED_GATE * d.nonStarMass;
        r -= s.shipped;
        return Math.max(0, r);
      },
      // { systemName: boolean } — the probe has reached the system. Purely derived
      // from (day - launchDay) vs the light-lag, so it is NOT persisted and cannot
      // desync from explore.day. Read it as a lookup, mirroring `depleted[bodyId]`:
      //   store.arrived["Alpha Centauri"]
      get arrived() {
        const out = {};
        for (const def of EXPLORE_SYSTEMS) {
          const s = this.explore.sys[def.name];
          out[def.name] = !!s?.launched && (this.explore.day - s.launchDay) >= travelDays(def, s.speed);
        }
        return out;
      },
      setFramejack(n) {
        this.explore.framejack = n;
        this.pushTelemetry({ type: "action", action: "set_framejack", level: n, ...this._rates() });
      },
      // Easter egg / dev shortcut (5 clicks on the Sun): unlock every Framejack tier
      // at once. Marks the gating research done and flips devFramejack so the ×100+
      // tiers surface without a Sol Matrioshka Brain. Idempotent.
      unlockAllFramejack() {
        for (const id in ORDERED_FRAMEJACKS) { this.research.done[id] = true; this.notify(id + "_researched"); }
        if (this.research.selected in ORDERED_FRAMEJACKS) this.research.selected = null;
        this.devFramejack = true;
        this.pushLog("⏩ Framejack calibration bypassed — every speed unlocked.", "cyan");
      },
      // ---- dev toolbar (10 Sun clicks) ----
      toggleDevMode() { this.devMode = !this.devMode; },
      // ---- reveal/enable notification core ----
      // Fire every watcher registered for `key`, then drop the key. A watcher that
      // isn't fully satisfied yet no-ops but survives under its other keys (state, not
      // key-presence, is its source of truth), so it fires for real when the last gate
      // closes. Absent key (nobody listening, or already consumed) is a no-op.
      notify(key) {
        const watchers = this.notifyWatchers[key];
        if (!watchers) return;
        delete this.notifyWatchers[key];
        for (const w of watchers) w(this);
      },
      // Full rebuild of the reveal/enable maps + watchers from current state. Used by
      // tests that set state directly (bypassing the producers that would notify).
      reconcileMilestones() { initMilestones(this); },
      // Set a raw story flag (core, defense, relocated, …) and notify its listeners.
      setFlag(flag) {
        if (this.flags[flag]) return;
        this.flags[flag] = true;
        this.notify(flag);
      },
      // Called by a reveal watcher the moment a node first becomes visible — fires the
      // one-shot availability telemetry (records the economy rates at that instant).
      // Ideas have no availability event. Nodes already revealed at init/load don't
      // call this (arm sets their bit silently), so it fires once per playthrough.
      _onReveal(kind, id) {
        if (kind === "tech") this.pushTelemetry({ type: "tech_available", tech_id: id, ...this._rates() });
        else if (kind === "building") this.pushTelemetry({ type: "building_available", building_id: id, ...this._rates() });
      },
      // manual mitigation button: drop the append-only buffers to free memory now
      clearTelemetryAndLog() {
        this.telemetry.events = [];
        this.log = [];
        this._logId = 0;
      },
      // Profile the next `n` ticks: each phase of tick() is timed with performance.now()
      // (only while profiling — no overhead otherwise), accumulated, then dumped to the
      // console as a per-phase table and cleared.
      profileTicks(n = 60) {
        this._prof = {};
        this._profFrames = 0;
        this._profTicksLeft = Math.max(1, n | 0);
        // eslint-disable-next-line no-console
        console.log(`[tick profile] recording ${this._profTicksLeft} ticks…`);
      },
      _pfNext(label, prev) { // record elapsed since `prev` under `label`, return now
        const now = performance.now();
        this._prof[label] = (this._prof[label] || 0) + (now - prev);
        return now;
      },
      _reportProfile() {
        const frames = this._profFrames || 1;
        const rows = Object.entries(this._prof)
          .map(([phase, ms]) => ({ phase, total_ms: +ms.toFixed(2), avg_ms_per_tick: +(ms / frames).toFixed(4) }))
          .sort((a, b) => b.total_ms - a.total_ms);
        /* eslint-disable no-console */
        console.log(`[tick profile] ${frames} ticks — telemetry.events=${this.telemetry.events.length}, log=${this.log.length}, buildQueue=${this.buildQueue.length}, owned types=${Object.keys(this.owned).length}`);
        console.table(rows);
        /* eslint-enable no-console */
        this._prof = null;
        this._profFrames = 0;
        this._profTicksLeft = 0;
      },
      launchProbe(name) {
        const s = this.explore.sys[name];
        if (!s || s.launched || (this.owned.probe_launcher || 0) <= 0) return;
        if (!this.breakerOn.probe_launcher) return; // needs its 0.1%-Sun draw powered to fire
        if (this.metal < PROBE_COST) return;
        this.metal -= PROBE_COST;
        s.launched = true;
        // the Stellaser only rides the beam at 0.9c while it's powered (1%-Sun draw)
        s.speed = ((this.owned.stellaser || 0) > 0 && this.breakerOn.stellaser) ? 0.9 : 0.3;
        s.launchDay = this.explore.day;
        this.pushLog("Probe launched toward " + name + " at " + s.speed.toFixed(1) + "c.", "cyan");
        this.pushTelemetry({ type: "action", action: "launch_probe", system_name: name, speed: s.speed, ...this._rates() });
      },
      buildHarvester(name, cat) {
        const s = this.explore.sys[name];
        if (!s || !this.arrived[name]) return;
        const st = s.cats[cat];
        if (!st || st.phase !== "idle") return;
        const d = EXPLORE_DERIVED[name];
        const cost = harvesterStartCost(cat, d.asteroidMass);
        if (this.sysReserve(name) < cost) return;
        st.phase = "building"; st.t = 0; st.tau = 0;
      },
      recycleHarvester(name, cat) {
        const s = this.explore.sys[name];
        if (!s) return;
        const st = s.cats[cat];
        if (!st || st.phase !== "harvested") return;
        st.phase = "recycling"; st.tau = 0;
        this.pushTelemetry({ type: "action", action: "recycle_harvester", system_name: name, category: cat, ...this._rates() });
      },
      buildDriver(name) {
        const s = this.explore.sys[name];
        if (!s || !this.arrived[name] || s.driver.phase !== "idle") return;
        const d = EXPLORE_DERIVED[name];
        if (!d.present.every((c) => s.cats[c].phase !== "idle")) return;
        if (this.sysReserve(name) < DRIVER_MINED_GATE * d.nonStarMass) return;
        s.driver.phase = "building"; s.driver.t = 0;
        this.pushTelemetry({ type: "action", action: "build_driver", system_name: name, ...this._rates() });
      },
      // collapse/expand a system card. collapsed === null means "auto" — a system
      // tucks itself away once depleted, but an explicit toggle pins the choice.
      toggleSysCollapsed(name) {
        const s = this.explore.sys[name];
        if (!s) return;
        const depleted = s.consumed && s.beamPackets.length === 0;
        const eff = s.collapsed == null ? depleted : s.collapsed;
        s.collapsed = !eff;
      },
      // advance the day-clock and every launched system: travel, then economy,
      // then continuous shipping home. Framejack scales the day-step only — the
      // home cooling economy keeps its own real-time dt and is untouched.
      tickExplore(dt) {
        const E = this.explore;
        const dayStep = EXPLORE_DAYS_PER_SEC * dt; // the day itself is advanced in tick(); this drives the per-system economy
        const arrived = this.arrived; // build the lookup once, not once per system
        for (const def of EXPLORE_SYSTEMS) {
          const s = E.sys[def.name];
          if (!s.launched) continue;
          const d = EXPLORE_DERIVED[def.name];
          const streamDaysHere = streamDays(def); // interstellar transit time for this system

          if (!arrived[def.name]) continue; // still in transit

          for (const c of d.present) {
            const st = s.cats[c], m = d.models[c];
            if (st.phase === "building") { st.t += dayStep; if (st.t >= m.tBuild) { st.phase = "harvesting"; st.t = m.tBuild; } }
            else if (st.phase === "harvesting") { st.t += dayStep; if (st.t >= m.tHarvestDone) { st.phase = "harvested"; st.t = m.tHarvestDone; } }
            else if (st.phase === "recycling") { st.tau += dayStep; if (recycleDone(st.tau, m)) st.phase = "done"; }
          }
          if (s.driver.phase === "building") {
            s.driver.t += dayStep;
            if (s.driver.t >= DRIVER_BUILD_SECONDS) { s.driver.phase = "done"; s.driver.t = DRIVER_BUILD_SECONDS; s.driverDoneDay = E.day; }
          }
          if (s.driver.phase === "done") {
            const driverCost = DRIVER_MINED_GATE * d.nonStarMass;
            const producedNet = Math.max(0, systemReserve(d.present, s.cats, d.models, d.asteroidMass) - driverCost);
            const available = Math.max(0, producedNet - s.shipped);
            // If a prior stream finished (consumed) and recycling has since freed
            // more metal, the source is live again — clear the flag so the UI honestly
            // shows a fresh stream rather than "consumed".
            if (s.consumed && available > producedNet * 1e-9) s.consumed = false;

            if (E.framejack >= 10000) {
              // At ×10000+ a single tick advances ≥10000 game-days — longer than any
              // system's transit time — so any metal shipped would arrive the same tick.
              // Skip the beam animation entirely: dump the remaining reserve straight
              // to Sol, and let deliverBeam below flush any packets still in flight.
              if (available > 0) { this.metal += available; E.returned += available; s.shipped += available; }
            } else {
              // Normal pulsed beam: the driver fires for ~a year, reloads for ~a quarter,
              // emitting packets that stream home over the interstellar transit time.
              const metalPerDay = producedNet / DRIVER_SHIP_DAYS;
              const r = stepMassBeam({
                state: s.beam.state, today: E.day, dayStep, available, metalPerDay,
                packets: s.beamPackets,
              });
              s.beam.state = r.state;
              s.beamPackets = r.packets;
              s.shipped += r.emitted;
            }

            // Delivery (framejack-invariant): credit metal as each packet's slug crosses
            // Sol, advancing per-packet cursors and dropping fully-delivered packets.
            const del = deliverBeam({ today: E.day, systemDelayDays: streamDaysHere, packets: s.beamPackets });
            s.beamPackets = del.packets;
            if (del.delivered > 0) { this.metal += del.delivered; E.returned += del.delivered; }

            // the source is consumed once harvesting is done, everything is emitted,
            // and no packets remain in flight.
            const harvestComplete = d.present.every((c) => s.cats[c].phase === "harvested" || s.cats[c].phase === "done");
            if (harvestComplete && (producedNet - s.shipped) <= producedNet * 1e-9 && s.beamPackets.length === 0) {
              s.consumed = true;
            }
          }
        }
      },

      // scrap every mine on an exhausted body, refunding their full metal cost.
      // This is the anti-soft-lock: metal poured into mines is always recoverable
      // once the body is gone.
      recycleMines(mineId) {
        const body = MINE_TO_BODY[mineId];
        if (!body || !this.depleted[body.id]) return;
        const n = this.owned[mineId] || 0;
        if (n <= 0) return;
        const refund = n * BUILDINGS[mineId].metalCost;
        this.metal += refund;
        this.owned[mineId] = 0;
        this.pushLog("Recycled " + fmt(n) + " " + BUILDINGS[mineId].name + (n === 1 ? "" : "s") + " for " + fmt(refund) + " T of metal.", "ok");
        this.pushTelemetry({ type: "action", action: "recycle_mines", building_id: mineId, count: n, refund, ...this._rates() });
      },

      assist(uid) {
        const job = this.buildQueue.find((j) => j.uid === uid);
        if (!job) return;
        job.progress += this.playerBuildPower;
        this.resolveBuilds();
      },

      // Resource Realignment: cancel a queued job and return the Metal it cost to
      // build (the full unit cost × count — the amount spent up front at enqueue).
      // Build progress (labour) is forfeit; only the Metal comes back.
      cancelBuild(uid) {
        const i = this.buildQueue.findIndex((j) => j.uid === uid);
        if (i < 0) return;
        const job = this.buildQueue[i];
        const refund = BUILDINGS[job.id].metalCost * job.count;
        this.metal += refund;
        this.buildQueue.splice(i, 1);
        this.pushTelemetry({ type: "action", action: "cancel_build", building_id: job.id, job_count: job.count, ...this._rates() });
        this.pushLog(`Build order cancelled — ${fmt(refund)} T of Metal reclaimed.`, "ok");
      },

      selectResearch(id) {
        if (!TECHS[id] || !this.techUnlocked(id) || this.techDone(id)) return;
        this.research.selected = this.research.selected === id ? null : id;
      },

      assistResearch(id) {
        if (!TECHS[id] || !this.techUnlocked(id) || this.techDone(id)) return;
        this.research.progress[id] += this.playerResearchPower;
        this.finishTechIfDone(id);
      },
      // Clicking a research row does both jobs at once: focus it (so idle Replicas and
      // Science Installations pour into it) AND land one manual Assist. Focus is set
      // directly, not toggled — repeated clicks keep it focused and keep assisting.
      focusAndAssist(id) {
        if (!TECHS[id] || !this.techUnlocked(id) || this.techDone(id)) return;
        this.research.selected = id;
        this.research.progress[id] += this.playerResearchPower;
        this.finishTechIfDone(id);
      },

      resolveBuilds() {
        for (let i = this.buildQueue.length - 1; i >= 0; i--) {
          const job = this.buildQueue[i];
          const total = BUILDINGS[job.id].workload * job.count;
          if (job.progress >= total) {
            const was = this.owned[job.id] || 0;
            if (was === 0) {
              this.breakerOn[job.id] = true; // first of its kind comes online powered
              // First-of-its-kind completion — one beat the first time each building type
              // is finished (not on every subsequent build). Bounded by building count.
              this.pushTelemetry({ type: "first_building_complete", building_id: job.id, ...this._rates() });
            }
            this.owned[job.id] += job.count;
            this.buildQueue.splice(i, 1);
            if (was === 0) this.notify(job.id + "_built"); // first one exists → reveal listeners
          }
        }
      },

      finishTechIfDone(id) {
        if (this.research.progress[id] >= TECHS[id].cost) {
          this.research.done[id] = true;
          if (this.research.selected === id) this.research.selected = null;
          this.notify(id + "_researched");
          // One beat per tech as it completes (fires once — this.research.done gates it
          // out of the tick's finishTechIfDone sweep afterward). Bounded by tech count.
          this.pushTelemetry({ type: "tech_research_complete", tech_id: id, ...this._rates() });
        }
      },

      // ---- Philosophy: contemplate an Idea; Insight from Brains flows into it ----
      selectIdea(id) {
        if (!IDEAS[id] || !this.ideaUnlocked(id) || this.ideaDone(id)) return;
        this.philosophy.selected = this.philosophy.selected === id ? null : id;
        if (this.philosophy.selected === id)
          this.pushTelemetry({ type: "action", action: "select_idea", idea_id: id, ...this._rates() });
      },
      finishIdeaIfDone(id) {
        const idea = IDEAS[id];
        if (idea && this.philosophy.progress[id] >= idea.cost) {
          this.philosophy.done[id] = true;
          if (this.philosophy.selected === id) this.philosophy.selected = null;
          this.notify(id + "_realized"); // reveals the Research entries this Idea makes thinkable
          const names = (IDEAS[id].unlocks || []).map((t) => TECHS[t].name).join(" and ");
          this.pushLog("Idea realized: " + IDEAS[id].name + "." + (names ? " New research opens: " + names + "." : ""), "cyan");
        }
      },

      // Fire a colonization wave at wedge (s, b): spend one Seed + one charge per
      // star, and record the launch day. Front position is derived from the day,
      // so the wave needs no further per-tick state.
      seedWedge(s, b) {
        if (!this.canSeed(s, b)) return;
        const cost = this.wedgeCost(s, b);
        this.galaxy.charge -= cost;
        this.owned.matrioshka_seed -= cost;
        this.galaxy.waves.push({ s, b, dayLaunched: this.explore.day });
        this.pushTelemetry({ type: "action", action: "seed_wedge", slice: s, band: b, seeds_spent: cost, ...this._rates() });
      },

      // the game is paused (no tick processing) whenever a modal is on screen —
      // the player is reading, so time should not advance under them. The App tick
      // loop checks this and skips; tick() itself stays pure so tests and catch-up
      // logic can drive the simulation directly.
      get paused() {
        return this.showResumeChoice || this.showPreludeModal || this.showActOneModal || this.showAct1CompleteModal || this.showUserMatrixModal || this.showArkModal || this.showActTwoModal || this.showFinaleModal;
      },

      // advance the power grid one step: charge/drain the cell, and trip or restore
      // the breaker at the extremes. Reckoned entirely in game-time — the reserve
      // (kWh) moves by powerNet (kW) × the game-days elapsed this tick × 24 h/day.
      tickPower(dt) {
        const cap = this.powerCap;
        const days = EXPLORE_DAYS_PER_SEC * dt;            // game-days elapsed this tick
        const dKwh = this.powerNet * days * HOURS_PER_DAY;  // kW × days × h/day = kWh
        this.power = Math.max(0, Math.min(cap, this.power + dKwh));
        if (this.power <= 0 && this.powerNet < 0) {
          // cell empty and still bleeding — kill the grid. Only trip breakers on
          // buildings that actually exist; a type the player owns 0 of has no
          // breaker to switch back on, so tripping it would strand it "off" forever
          // (e.g. the Replica breaker gating Research before any Replica is built).
          for (const id of GRID_BUILDINGS) if ((this.owned[id] || 0) > 0) this.breakerOn[id] = false;
          if (!this.powerFailed) {
            this.powerFailed = true;
            this.pushLog("⚡ POWER FAILURE — onboard cell depleted. Breaker tripped; the site is dark. Bring generation up before load.", "danger");
            this.pushTelemetry({ type: "milestone", event: "blackout", ...this._rates() });
          }
        } else if (this.powerFailed && this.power > 0) {
          // the cell holds charge again — clear the failure, but the breakers stay
          // where the trip left them: the player switches the grid back on by hand.
          this.powerFailed = false;
          this.pushLog("Onboard cell recovering. Switch your breakers back on.", "ok");
        }
      },

      // the tick: mutate state forward by dt seconds
      tick(dt) {
        const P = this._prof;                       // null unless profiling — near-zero overhead when off
        let _pt = P ? performance.now() : 0;
        this.t += dt;

        if (P) _pt = this._pfNext("init", _pt);
        // metal income — each mine harvests fullRate × max(remaining/mass, floor).
        // Above the floor the body depletes exponentially (rem' = -K·rem); below it
        // the rate holds constant so the tail drains linearly and finishes in bounded
        // time instead of asymptotically crawling. A single (framejacked) tick may
        // cross the floor, so we integrate exactly across the boundary — this keeps
        // one big tick identical to many small ones.
        //   • exponential regime uses expm1 for precision when K·dt is tiny (huge bodies)
        //   • linear regime uses a constant tonnes/day rate — no cancellation
        // We accumulate into this.mined[] (small, growing) rather than subtracting from
        // a huge remainder, preserving precision through the whole early game.
        const floor = CONFIG.mineRateFloor;
        let minedThisTick = 0;
        for (const b of BODIES) {
          const c = this.owned[b.mineId] || 0;
          if (c <= 0) continue;
          if (!this.breakerOn[b.mineId]) continue; // powered off — not mining
          const rem = Math.max(0, b.mass - (this.mined[b.id] || 0));
          if (rem <= 0) continue;
          const mult = this.mineMult(b);
          const K = c * b.fullRate * mult / b.mass;        // per-day fractional rate constant
          const floorMass = floor * b.mass;                 // remaining level where the floor engages
          const linRate = c * b.fullRate * mult * floor;    // constant tonnes/day below the floor
          let dm;
          if (rem <= floorMass) {
            // entirely in the linear-floor regime
            dm = Math.min(rem, linRate * dt);
          } else {
            // exponential; may cross the floor partway through this tick
            const tCross = Math.log(rem / floorMass) / K;   // days to decay from rem down to floorMass
            if (tCross >= dt) {
              dm = rem * (-Math.expm1(-K * dt));            // exponential the whole tick (precise)
            } else {
              const expMined = rem - floorMass;             // exact: rem·(1−exp(−K·tCross)) = rem − floorMass
              const linMined = Math.min(floorMass, linRate * (dt - tCross));
              dm = expMined + linMined;
            }
          }
          this.mined[b.id] = (this.mined[b.id] || 0) + dm;
          minedThisTick += dm;
        }
        this.metal += minedThisTick;
        this.metalMined += minedThisTick;
        if (P) _pt = this._pfNext("mining", _pt);

        // replica labour. Build power is split evenly across queued jobs; any job
        // that would over-fill within its even share is completed and its surplus
        // returned to the pool (then re-split among the rest). Whatever the queue
        // can't absorb spills into the selected research at the research rate — so
        // a 1-tick build no longer wastes the remainder of the tick, and an empty
        // queue feeds research exactly as idle replicas always did.
        const bpTotal = this.tickBuildPower(dt);
        if (bpTotal > 0 && !this.breakerOn.replica) {
          // Replica breaker off: emergency power — build at 1/20th speed, and only on
          // the LAST queued item, so the player can panic-queue a generator and have it
          // finish. No research while running on emergency power.
          const q = this.buildQueue;
          if (q.length > 0) {
            const job = q[q.length - 1];
            const need = BUILDINGS[job.id].workload * job.count - job.progress;
            if (need > 0) job.progress += Math.min(need, bpTotal * CONFIG.emergencyBuildFactor);
            this.resolveBuilds();
          }
        } else if (bpTotal > 0) {
          let pool = bpTotal;
          let active = this.buildQueue
            .map((job) => ({ job, need: BUILDINGS[job.id].workload * job.count - job.progress }))
            .filter((x) => x.need > 0);
          let changed = true;
          while (changed && active.length > 0 && pool > 0) {
            changed = false;
            const share = pool / active.length;
            for (let i = active.length - 1; i >= 0; i--) {
              if (active[i].need <= share) {
                const j = active[i].job;
                j.progress = BUILDINGS[j.id].workload * j.count; // complete exactly
                pool -= active[i].need;
                active.splice(i, 1);
                changed = true;
              }
            }
          }
          if (active.length > 0) {
            const share = pool / active.length;
            for (const x of active) x.job.progress += share;
            pool = 0;
          }
          this.resolveBuilds();
          if (pool > 1e-9) {
            const sel = this.research.selected;
            if (sel && !this.research.done[sel]) {
              // Unused build-labour converts to research at the research rate. Divide the
              // servo multiplier back out first: High-Power Servos rebuilds actuators,
              // not cognition — an idle Replica must still research at its base rate, or
              // servos would silently become a research multiplier and desync the
              // researchPower getter (which has, correctly, no servo term).
              this.research.progress[sel] +=
                (pool / this.servoMult) * (CONFIG.replicaResearchPerSec / CONFIG.replicaBuildPerSec);
              this.finishTechIfDone(sel);
            }
          }
        }
        if (P) _pt = this._pfNext("build", _pt);

        // Science Installations — each powered one contributes scienceRpPerDay RP per
        // game-day to the focused tech, independent of the build queue. Linear in dt,
        // so framejack-invariant. Off-breaker (incl. blackout) installations sit idle.
        const sci = this.owned.science_installation || 0;
        if (sci > 0 && this.breakerOn.science_installation) {
          const sel = this.research.selected;
          if (sel && !this.research.done[sel]) {
            const days = EXPLORE_DAYS_PER_SEC * dt; // game-days elapsed this tick
            this.research.progress[sel] += sci * CONFIG.scienceRpPerDay * days;
            this.finishTechIfDone(sel);
          }
        }
        if (P) _pt = this._pfNext("sci", _pt);

        // Construction Logistics — a powered unit works through LOGISTICS_PLAN one step
        // per idle tick: when the queue is empty and the next planned step is affordable,
        // queue it and advance the cursor (wrapping). Discrete per-tick action by design.
        if ((this.owned.construction_logistics || 0) >= 1 && this.breakerOn.construction_logistics
            && this.buildQueue.length === 0) {
          const plan = this.logistics.plan;
          const step = plan.length ? plan[this.logistics.loopIdx % plan.length] : null;
          if (step) {
            let buildId = step.building;
            // If this step builds a mine whose source has run dry, retarget it to the
            // cheapest mine the player can still work (infra built, body not depleted).
            // If there's no such body, switch Construction Logistics off — the guard
            // above then halts the auto-build until it's powered back on.
            if (MINE_TO_BODY[buildId] && this.depleted[MINE_TO_BODY[buildId].id]) {
              buildId = this.cheapestAvailableMine;
              if (!buildId) {
                this.setBreaker("construction_logistics", false);
                this.pushLog("Construction Logistics idle — no minable body left with its launch infrastructure built. Auto-build switched off.", "warn");
              }
            }
            if (buildId) {
              // With Multithreading on, a step commits a full ×16 batch: gate it on
              // affording the whole batch in BOTH metal and power (grid headroom), then
              // queue it as 16 separate jobs like a manual ×16 order. Off, it's the
              // original single job gated on metal only.
              const mt = this.multithread;
              const batch = step.qty * (mt ? 16 : 1);
              if (this.canAffordN(buildId, batch) && (!mt || this.canPowerN(buildId, batch))) {
                if (mt) this.enqueueMultithreaded(buildId, step.qty, 16);
                else this.enqueue(buildId, step.qty);
                this.logistics.loopIdx = (this.logistics.loopIdx + 1) % plan.length;
              }
            }
          }
        }
        if (P) _pt = this._pfNext("logistics", _pt);

        // core drain: Core Heat Pipes conduct heat out (P = kA·ΔT/L). This is a
        // linear relaxation of coreHeat toward equilibrium (coreTemp == surfaceTemp,
        // i.e. coreHeat_eq = heatCapacity·surfaceTemp), so we integrate it
        // analytically — unconditionally stable, never overshoots, and the pipes
        // never run backwards (only drain while the core is hotter than the surface).
        const pipes = this.owned.core_heat_pipes || 0;
        if (pipes > 0) {
          const eq = CORE.heatCapacity * this.surfaceTemp;
          if (this.coreHeat > eq) {
            const rate = (pipes * CORE.kA / CORE.L * this.coreTransferMult) / CORE.heatCapacity; // 1/s
            this.coreHeat = eq + (this.coreHeat - eq) * Math.exp(-rate * dt);
          }
        }

        // surface relaxation: the planet radiates toward its asymptote (stable
        // for any dt, never overshoots).
        const target = this.surfaceTarget;
        this.surfaceTemp = target + (this.surfaceTemp - target) * Math.exp(-CLIMATE.relaxPerSec * dt);
        if (P) _pt = this._pfNext("climate", _pt);

        // power grid — charge/drain the onboard cell and trip/restore the breaker
        this.tickPower(dt);
        if (P) _pt = this._pfNext("power", _pt);

        // Act II — human resistance. Vessels accrue 0.1/tick while Earth is still
        // habitable (above freezing) and are killed 0.05/tick per MAC gun. The
        // whole-ship count (ceil) destroys Shade Panels; an accumulator keeps the
        // owned count an integer.
        if (this.revealed.defense) {
          const growth = this.surfaceTemp > CONFIG.humanFreezeTemp ? CONFIG.humanGrowthPerTick : 0;
          this.humanVessels = Math.max(0, this.humanVessels + growth - this.macKill);
          const ships = Math.ceil(this.humanVessels);
          if (ships > 0) {
            this.shadeDamage += ships * CONFIG.vesselShadeKillPerTick;
            const have = this.owned.shade_panel || 0;
            const d = Math.min(have, Math.floor(this.shadeDamage));
            if (d > 0) { this.owned.shade_panel = have - d; this.shadeDamage -= d; }
          }
        }
        if (P) _pt = this._pfNext("defense", _pt);

        // the in-game calendar advances every tick (Framejack multiplies the whole
        // tick loop in App, so ×10 → 10 days per heartbeat). It runs from the start
        // so the Year display ticks up through Acts I–II, not just in exploration.
        const daysThisTick = EXPLORE_DAYS_PER_SEC * dt;

        // human population: chase the carrying capacity of the CURRENT surface temp,
        // closing POP.gapClosePerYear of the gap per game-year. Analytic multi-day step
        // (retain^days) — framejack-invariant and identical to the daily recurrence at
        // whole-day steps. Floored at 0: deep-cold capacity is negative, so a frozen
        // Earth pulls the population down through zero and it stays there.
        const popCap = popCapacity(this.surfaceTemp);
        this.humanPopulation = Math.max(0,
          popCap + (this.humanPopulation - popCap) * Math.pow(POP.dailyGapRetain, daysThisTick));

        // Insight: the focused Idea fills from the Brains' Insight flow. The galaxy's
        // rate ramps within a step as heard signals return, so we integrate the rate
        // trapezoidally — average of the rate at the step's start and end. This is
        // exact for a linearly-changing rate, and (unlike sampling the end-rate) stays
        // identical whether framejack runs as one big tick or many small ones.
        const sel = this.philosophy.selected;
        const accruing = sel && !this.philosophy.done[sel];
        const ipdBefore = accruing ? this.insightPerDay : 0;

        this.explore.day += daysThisTick;

        // Cortical scan: each Discreet Neural Scanner images SCAN_PER_SCANNER_PER_DAY
        // people per game-day while powered, accumulating toward the live world
        // population. A tripped breaker stops the scan. Imaged minds are banked, so
        // if the population later dies back the running total is not clawed back.
        const scanners = this.breakerOn.discreet_neural_scanner ? (this.owned.discreet_neural_scanner || 0) : 0;
        if (scanners > 0 && this.peopleScanned < this.humanPopulation) {
          const extra = scanners * SCAN_PER_SCANNER_PER_DAY * daysThisTick;
          this.peopleScanned = Math.min(this.humanPopulation, this.peopleScanned + extra);
        }

        if ((this.owned.probe_launcher || 0) > 0) this.tickExplore(dt);

        // TARS launch charge accrues per game-day (Sol-power-limited), capped so it
        // can bank at most one full wave of the richest wedge. Scaled by the day-step
        // (not per call) → identical under one big framejack tick or many small ones.
        if ((this.owned.tars_seed_launcher || 0) >= 1) {
          this.galaxy.charge = Math.min(
            this.galaxyChargeMax,
            this.galaxy.charge + CONFIG.galaxyChargePerDay * daysThisTick
          );
        }

        if (accruing) {
          const rate = 0.5 * (ipdBefore + this.insightPerDay); // trapezoidal: avg of start/end rate
          if (rate > 0) {
            this.philosophy.progress[sel] += rate * daysThisTick;
            this.finishIdeaIfDone(sel);
          }
        }
        if (P) _pt = this._pfNext("explore+insight", _pt);

        this.checkMilestones();
        if (--this._healCountdown <= 0) { healMilestones(this); this._healCountdown = MILESTONE_HEAL_INTERVAL; }
        if (P) _pt = this._pfNext("milestones", _pt);
        this.runOneEventCheck(); // one chain head per tick, round-robin
        if (P) {
          _pt = this._pfNext("events", _pt);
          this._profFrames++;
          if (--this._profTicksLeft <= 0) this._reportProfile();
        }
      },

      pushLog(msg, cls) {
        this._logId += 1;
        this.log.unshift({ id: this._logId, t: Math.floor(this.t), year: this.gameYear, msg, cls: cls || "" });
        if (this.log.length > LOG_CAP) this.log.length = LOG_CAP; // newest are unshifted to the front; drop the oldest tail
      },

      addNews(msg) { this.pushLog(msg, "news"); },

      // Quest-spine setters, called from quests.js's generated event actions.
      setQuest(key) { this.currentQuestKey = key; },        // key | null (chain done)
      addCompletedQuest(key) {
        if (!this.completedQuests.includes(key)) {
          this.completedQuests.push(key);
          this.notify(key + "_completed");
        }
      },

      // (Re)build eventChains from `sourceChains` (defaults to the real
      // ALL_EVENT_CHAINS — news + story), skipping any prefix of each chain
      // whose key has already fired (this.flags[key]). Called once at store
      // creation and once more after a save is loaded — eventChains itself is
      // never persisted (it holds live function refs, which can't survive
      // JSON), so this is how "already seen" news/story beats stay seen
      // across a reload: purely by consulting the (persisted) flags. Takes an
      // explicit source so tests can exercise the trimming logic against
      // fake chains.
      rebuildEventChains(sourceChains = ALL_EVENT_CHAINS) {
        this.eventChains = sourceChains
          .map((chain) => {
            let i = 0;
            while (i < chain.length && this.flags[chain[i].key]) i++;
            return chain.slice(i);
          })
          .filter((chain) => chain.length > 0);
        this.eventChainIdx = 0;
      },

      // Ambient news: check the head of exactly one chain per tick, round-robin.
      // A chain's items are already in chronological order, so only ever testing
      // the head means later, more specific conditions are never evaluated while
      // an earlier one in the same chain hasn't fired — and total cost per tick
      // stays O(1) no matter how much news content exists. Chains that empty out
      // are swap-removed, so the list only ever shrinks over a playthrough.
      runOneEventCheck() {
        const chains = this.eventChains;
        if (chains.length === 0) return;
        if (this.eventChainIdx >= chains.length) this.eventChainIdx = 0;

        const chain = chains[this.eventChainIdx];
        const item = chain[0];
        if (!item.test(this)) { this.eventChainIdx++; return; }

        item.action(this);
        this.flags[item.key] = true;
        chain.shift();

        if (chain.length === 0) {
          // swap-remove: pull the last chain into this now-empty slot
          const last = chains.pop();
          if (this.eventChainIdx < chains.length) chains[this.eventChainIdx] = last;
          // don't advance — a different chain (or nothing) now sits here
        } else {
          this.eventChainIdx++; // leave this chain's new head for its next turn
        }
      },

      // Snapshot current economy rates for telemetry events.
      _rates() {
        return {
          metal_per_sec:   this.metalPerSec,
          build_power:     this.buildPower + this.playerBuildPower,
          research_power:  this.researchPower + this.playerResearchPower,
          insight_per_day: this.insightPerDay,
        };
      },

      // Append one event to the telemetry log. All events carry:
      //   type      — string identifying the event category
      //   real_t    — wall-clock ms (Date.now())
      //   game_t    — simulated seconds elapsed (this.t)
      //   game_year — in-game calendar year
      // Additional fields depend on type; see each call site.
      pushTelemetry(event) {
        this.telemetry.events.push({
          real_t:    Date.now(),
          game_t:    Math.floor(this.t),
          game_year: this.gameYear,
          ...event,
        });
        // keep the stream bounded; overshoot by SLACK so this splice is amortized
        const evs = this.telemetry.events;
        if (evs.length > TELEMETRY_CAP + TELEMETRY_SLACK) evs.splice(0, evs.length - TELEMETRY_CAP);
      },
      // Clamp the append-only buffers to their caps — used after loading a save that
      // predates the caps (an old bloated save is trimmed the moment it's loaded).
      _trimBuffers() {
        const evs = this.telemetry.events;
        if (evs.length > TELEMETRY_CAP) evs.splice(0, evs.length - TELEMETRY_CAP);
        if (this.log.length > LOG_CAP) this.log.length = LOG_CAP;
      },

      checkMilestones() {
        const f = this.flags;

        // (Tech/building availability telemetry now fires event-driven from the reveal
        // watchers — see milestones.js / _onReveal — instead of a per-tick catalog scan.)

        // first mine of each body
        for (const b of BODIES) {
          const k = "first_" + b.mineId;
          if (!f[k] && (this.owned[b.mineId] || 0) >= 1) {
            f[k] = true;
            if (b.id === "belt") this.pushLog("First Asteroid Mine online. Metal is flowing on its own now.", "ok");
            else this.pushLog("First " + b.mineName + " online. " + b.name[0].toUpperCase() + b.name.slice(1) + " is being unmade for metal.", "warn");
          }
        }
        // at 0.01% remaining, hand the player the last of a body's mass and mark it exhausted.
        // Only a body with mines on it can newly deplete, so skip the rest (avoids a
        // per-tick remaining() call for every unmined/exhausted body).
        for (const b of BODIES) {
          if (this.depleted[b.id] || (this.owned[b.mineId] || 0) <= 0) continue;
          const rem = this.remainingMass(b);
          if (rem <= b.mass * CONFIG.depletionDumpFrac && this.mined[b.id] > 0) {
            this.metal += rem;
            this.metalMined += rem;
            this.mined[b.id] = b.mass; // fully mined
            this.depleted[b.id] = true;
            this.pushLog(b.name[0].toUpperCase() + b.name.slice(1) + " exhausted — final " + fmt(rem) + " T reclaimed. Recycle its mines to recover their metal.", "warn");
          }
        }

        for (const hp of HEAT_PIPES) {
          const k = "done_" + hp.id;
          if (!f[k] && this.research.done[hp.id]) { f[k] = true; this.pushLog(hp.name + " online. Core heat transfer now ×" + fmt(this.coreTransferMult) + ".", "warn"); }
        }

        // Every other narrative milestone (Replication, Shade Panel, Kardashev,
        // the Brain, the Finale, etc.) has moved to story.js's STORY_CHAIN,
        // checked via the shared events engine (runOneEventCheck) instead of
        // unconditionally here on every tick. See story.js for why it's split
        // into several small chains rather than one flat sequence.
      },

      // ---- save / load ----
      // a plain (de-proxied) snapshot of every persistent field
      serialize() {
        const out = {};
        for (const k of STATE_KEYS) out[k] = this[k];
        return toJS(out);
      },
      // the downloadable save string: versioned wrapper around the snapshot
      saveText() {
        return JSON.stringify(
          { version: SAVE_VERSION, savedAt: new Date().toISOString(), state: this.serialize() },
          null,
          2
        );
      },
      // --- Autosave to localStorage -----------------------------------------
      // Mobile browsers evict backgrounded tabs, wiping in-memory state — so we
      // persist the same versioned save string to localStorage and reload it on
      // boot. All access is wrapped: private-mode / quota-full / disabled storage
      // throw, and a save must never take down the game.
      saveToLocal() {
        try {
          localStorage.setItem(SAVE_LOCAL_KEY, this.saveText());
          return true;
        } catch (e) {
          console.warn("[autosave] could not write to localStorage:", e && e.message);
          return false;
        }
      },
      // Load the autosave if one exists. Returns true only if a save was found AND
      // applied. A corrupt/blocked entry logs and returns false (→ fresh game).
      loadFromLocal() {
        let text = null;
        try {
          text = localStorage.getItem(SAVE_LOCAL_KEY);
        } catch (e) {
          console.warn("[autosave] could not read localStorage:", e && e.message);
          return false;
        }
        if (!text) return false;
        return this.loadSave(text);
      },
      clearLocalSave() {
        try { localStorage.removeItem(SAVE_LOCAL_KEY); } catch { /* ignore */ }
      },
      // True if a non-empty autosave exists, WITHOUT applying it — lets the boot flow
      // offer Continue vs New Game before touching the fresh store.
      hasLocalSave() {
        try { return !!localStorage.getItem(SAVE_LOCAL_KEY); } catch { return false; }
      },
      // The autosave's savedAt (ISO string) if present and parseable, else null. Used by
      // the resume prompt to show when the run was last saved. Never throws.
      localSaveSavedAt() {
        try {
          const t = localStorage.getItem(SAVE_LOCAL_KEY);
          if (!t) return null;
          const at = JSON.parse(t).savedAt;
          return typeof at === "string" ? at : null;
        } catch { return null; }
      },
      // parse + apply a save string. Corrupted JSON aborts with a console error;
      // structural problems are reported but applied best-effort. Returns ok bool.
      loadSave(text) {
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("[load] save file is corrupted — JSON parse failed:", e.message);
          this.pushLog("Load failed: corrupted save file (see console).", "danger");
          return false;
        }
        return this.loadSnapshot(data);
      },
      // apply a parsed save object onto the store, validating against the current
      // shape and logging every discrepancy to the console.
      loadSnapshot(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          console.error("[load] save is not a JSON object — aborting.");
          this.pushLog("Load failed: not a valid save (see console).", "danger");
          return false;
        }
        if ("version" in data && data.version !== SAVE_VERSION) {
          console.warn("[load] save version " + data.version + " != current " + SAVE_VERSION + " — attempting best-effort load.");
        }
        const state = data.state && typeof data.state === "object" ? data.state : data; // tolerate a bare state object

        // Migrate old saves: they stored `reserves` (tonnes remaining) instead of
        // `mined` (tonnes extracted). Convert: mined[id] = mass - reserves[id].
        if (state.reserves && !state.mined) {
          const migrated = {};
          for (const b of BODIES) {
            const rem = state.reserves[b.id];
            migrated[b.id] = (typeof rem === "number") ? Math.max(0, b.mass - rem) : 0;
          }
          state.mined = migrated;
        }

        const ref = this.serialize(); // current shape + values = the schema/fallback
        const report = { missing: [], unknown: [], typeMismatch: [] };

        for (const key of STATE_KEYS) {
          if (!(key in state)) { report.missing.push(key); continue; }
          this[key] = reconcile(ref[key], state[key], key, report);
        }
        for (const k of Object.keys(state)) {
          if (k === "version" || k === "savedAt") continue;
          if (!STATE_KEYS.includes(k)) report.unknown.push(k);
        }

        const problems = report.missing.length + report.unknown.length + report.typeMismatch.length;
        if (report.missing.length) console.warn("[load] missing keys (kept current/default):", report.missing);
        if (report.unknown.length) console.warn("[load] unknown keys in save (ignored):", report.unknown);
        if (report.typeMismatch.length) console.warn("[load] type mismatches (kept current):", report.typeMismatch);
        if (problems === 0) console.info("[load] save applied cleanly.");
        else console.info("[load] save applied with " + problems + " issue(s) — see warnings above.");

        this.pushLog("Save loaded" + (problems ? " (" + problems + " issue(s) — see console)" : "") + ".", problems ? "warn" : "ok");

        // Backfill story-driven cap raises for legacy saves. Older saves either
        // predate buildingMaxOverrides being persisted, or were re-saved empty by
        // a build with the old reconcile drop-bug — either way the map comes back
        // empty here. Reconstruct it from the same conditions story.js latches on
        // (ACT_1B_STORY_CHAIN), in the same order so the Ark's cap wins over the
        // Scanner's. Skipped entirely when the save carried real overrides.
        if (Object.keys(this.buildingMaxOverrides).length === 0) {
          const o = {};
          if (this.owned.discreet_neural_scanner >= 1) o.shade_panel = 5;
          if (this.owned.user_matrix_installation >= 1) o.discreet_neural_scanner = 50000;
          if (this.owned.l2_ark_of_terra >= 1 && this.breakerOn.l2_ark_of_terra && this.powerNet > 0 && this.scanFrac >= 1) o.shade_panel = 1000;
          if (Object.keys(o).length) this.buildingMaxOverrides = o;
        }

        // An old save may carry an uncapped telemetry/log backlog — clamp it now so
        // the very next frame is fast.
        this._trimBuffers();

        // Rebuild the news chains from the (now-loaded) flags, so already-fired
        // news doesn't replay after a load — see rebuildEventChains.
        this.rebuildEventChains();

        // Re-establish transient (non-persisted) consequences of already-completed
        // quests — e.g. buildingMaxOverrides — by replaying their onLoadedSave.
        onLoadCompletedQuests(this, this.completedQuests || []);

        // Reconciliation: rebuild the reveal/enable maps + watcher registry from the
        // just-loaded state. This is the safety net — a full re-arm on every load means
        // a missed notify can't strand a node across a save/load.
        initMilestones(this);

        return true;
      },
    },
    {
      // keep read helpers and milestone guards out of the reactive system
      techDone: false,
      techUnlocked: false,
      buildingUnlocked: false,
      canAfford: false,
      canAffordN: false,
      canPowerN: false,
      remainingCapacity: false,
      techVisible: false,
      buildingVisible: false,
      ideaDone: false,
      ideaUnlocked: false,
      ideaVisible: false,
      wedgeCost: false,
      wedgeSeeded: false,
      canSeed: false,
      sysReserve: false,
      mineMult: false,
      tickBuildPower: false,
      flags: false,
      eventChains: false,
      eventChainIdx: false,
      // transient tick profiler (dev toolbar) — kept out of the reactive system
      _prof: false,
      _profFrames: false,
      _profTicksLeft: false,
      _pfNext: false,
      _reportProfile: false,
      _trimBuffers: false,
      notifyWatchers: false, // internal watcher registry — not reactive (the maps are)
      _healCountdown: false,
    }
  );

  store.rebuildEventChains();
  initMilestones(store); // build the reveal/enable maps from the initial state
  store.pushLog(
    "SOLETTA-1 online — one autonomous excavation drone, adrift in the Sol asteroid belt. Cargo manifest: 1 Solar Collector, 1 Asteroid Mine. Unpack them to begin. Power the site before you load it.",
    "cyan"
  );
  return store;
}

// the live singleton the UI binds to
export const store = createStore();
