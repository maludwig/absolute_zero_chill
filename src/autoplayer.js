// autoplayer.js — a bot that plays the game one action at a time.
//
// `play(store)` inspects the store and performs a SINGLE action, the way a human
// player might: it's meant to be semi-optimal, not min-maxed (the goal is to
// estimate how long a reasonable playthrough takes, not to speedrun it). Call it
// once per tick from a driver (a test loop, or the DevBar "Autoplay Once" button).
//
// It returns a short `{ action, id }` descriptor of what it did, or `null` if it
// chose to do nothing this tick — handy for tests and logging. It mutates the
// store only through the store's own action methods (unpack/enqueue/…), so it
// stays honest about what a player could actually click.

import { TECHS, MULTS, BUILDINGS, ASSIST_MAX_WORKLOAD, BODIES, IDEAS, FRAMEJACKS } from "./config.js";
import { EXPLORE_SYSTEMS, EXPLORE_DERIVED } from "./explore.js";
import { SLICE_COUNT, WEDGE_COUNT } from "./galaxy/lut.js";
import { WEDGES_ON_SCREEN } from "./galaxy/overlay.js";

// Every modal that sets store.paused, with the action that clears it. While any of
// these is open the game does not tick (see App.jsx), so dismissing them is the
// autoplayer's highest priority — nothing else can make progress. Kept as a table
// so a newly-added modal fails loudly here rather than silently deadlocking a run.
const MODALS = [
  ["showPreludeModal", "dismissPreludeModal", "prelude"],
  ["showAct1CompleteModal", "dismissAct1CompleteModal", "act_1_complete"],
  ["showUserMatrixModal", "dismissUserMatrixModal", "user_matrix"],
  ["showArkModal", "dismissArkModal", "ark"],
  ["showActOneModal", "dismissActOneModal", "act_one"],
  ["showActTwoModal", "dismissActTwoModal", "act_two"],
  ["showFinaleModal", "dismissFinaleModal", "finale"],
];

//  MULTS = [
//   { n: 10, label: "+10", tech: "batch_processing" },
//   { n: 1000, label: "+1000", tech: "bulk_processing" },
//   { n: 1000000, label: "+1M", tech: "mega_processing" },
//   { n: 1e9, label: "+1G", tech: "giga_processing" },
//   { n: 1e12, label: "+1T", tech: "tera_processing" },
//   { n: 1e15, label: "+1P", tech: "peta_processing" },
// ];
function isPowerOfTen(num) {
  if (num <= 0) return false;

  const log = Math.log10(num);

  // Check if the log is an integer (a round number)
  return log % 1 === 0;
}

const ENDGAME_QUESTS = ["act_3_sail", "act_3_arrive", "act_3_eye", "act_3_zero"]

export const autoplayer = {
  // Gate on placing a NEW order — NOT a cap on queue depth, despite the name. One
  // permitted order can queue 16 jobs at once (enqueueBuilding -> enqueueMultithreaded),
  // so measured depth runs to 16 regardless of this value. What it really bounds is
  // "enqueue once per play() forever", which would grow the queue without limit and
  // degrade the tick loop.
  //
  // It buys nothing for throughput: store's allocator splits build power evenly, then
  // completes any job that over-fills its share and re-splits the surplus, spilling the
  // remainder into research — so no labour is wasted at any depth. Measured at 3 vs 1
  // over 6500 ticks: identical mean depth (5.89 vs 5.88), identical max (16), identical
  // completion ticks for all 16 quests; 1 merely spends ~1500 more ticks in
  // assistHeadOrTech instead of enqueueing, worth about +2.5% metal.
  //
  // Crucially it is NOT what keeps the grid up — a single multithreaded order commits
  // 16 jobs of load in one call. That is powerHeadroom()'s job. See queuedDraw().
  QUEUE_MAX: 1,
  queueFull(store) { return store.buildQueue.length >= this.QUEUE_MAX; },

  // Push the queue head along if it's small enough to hand-assist (mirrors the
  // ASSIST_MAX_WORKLOAD rule the UI uses to show the Assist button); otherwise the
  // spare attention goes into research.
  assistHeadOrTech(store) {
    const job = store.buildQueue[0];
    if (job) {
      const total = BUILDINGS[job.id].workload * job.count;
      if (total <= ASSIST_MAX_WORKLOAD) {
        store.assist(job.uid);
        return { action: "assist", id: job.id };
      }
    }
    return this.assistVisibleTechOrWait(store);
  },

  nextMultDown(store, n) {
    if (n < 1000) return 1;
    if (isPowerOfTen(n)) {
      if (store.research.done.multithreading) {
        return 16 * n / 1000;
      }
      return n / 1000;
    } else {
      return n / 16;
    }
  },
  maxBuildMult(store) {
    let maxMult = 1;
    for (const m of MULTS) {
      if (store.techDone(m.tech) && m.n * 2 < store.owned.replica) {
        maxMult = m.n;
      }
    }
    if (store.research.done.multithreading) {
      if (maxMult * 32 < store.owned.replica) {
        maxMult *= 16;
      }
    }
    return maxMult;
  },
  enqueueBuilding(store, building_id, max_build_mult) {
    if (!isPowerOfTen(max_build_mult)) {
      // We are multithreading
      store.enqueueMultithreaded(building_id, max_build_mult / 16, 16)
    } else {
      store.enqueue(building_id, max_build_mult);
    }
  },
  duplicateBuilding(store, building_id) {
    if (!store.research.done.duplication) {
      throw new Error("duplicateBuilding called without duplication tech");
    }
    store.enqueue(building_id, store.owned[building_id]);
  },
  // store.powerNet counts only load that is already BUILT. Everything sitting in the
  // build queue will draw the instant it resolves, so committing against powerNet
  // alone lets several enqueues each "fit" while their sum browns out the grid — and a
  // single multithreaded order queues 16 jobs in one call, so the oversubscription is
  // not bounded by QUEUE_MAX. powerFailed stays false right up until the jobs land.
  // Reckon against the uncommitted headroom instead: powerNet minus what is promised.
  queuedDraw(store) {
    let kW = 0;
    for (const job of store.buildQueue) {
      const u = BUILDINGS[job.id].powerUsage;
      if (u && u.kW > 0) kW += u.kW * job.count; // generators (kW<0) don't count — they aren't built yet either
    }
    return kW;
  },
  powerHeadroom(store) { return store.powerNet - this.queuedDraw(store); },
  // Queue-aware replacement for store.canPowerN — the bot must never promise the grid
  // more load than it can carry once every outstanding job resolves.
  canPowerBatch(store, building_id, n) {
    const u = BUILDINGS[building_id].powerUsage;
    if (!u || u.kW <= 0) return true; // no draw, or net generation
    return this.powerHeadroom(store) - u.kW * n >= 0;
  },

  // The batch sizes the game can actually order: ×1 and each unlocked MULTS button,
  // each optionally dispatched ×16 through Multithreading. store.enqueue enforces this
  // shape (a power of ten, or 16× one via enqueueMultithreaded) and throws otherwise —
  // so any batch we compute MUST land on this ladder, or it queues fractions of a
  // building. Note the ×16 total is kept as ONE number, so canPowerBatch/canAffordN
  // reckon the whole order at once rather than per-thread.
  legalMults(store) {
    const base = [1];
    for (const m of MULTS) if (store.techDone(m.tech)) base.push(m.n);
    if (!store.research.done.multithreading) return base;
    return base.concat(base.map((n) => n * 16));
  },
  // Largest legal batch <= desired. Returns 0 only when desired < 1 (nothing fits).
  // This is what makes enqueueBuilding's isPowerOfTen dispatch correct by construction:
  // every value it can return is either 10^k (plain enqueue) or 16·10^k (multithreaded),
  // and 16·10^k is never itself a power of ten.
  clampLegal(store, desired) {
    if (!(desired >= 1)) return 0;
    let best = 0;
    for (const n of this.legalMults(store)) if (n <= desired && n > best) best = n;
    return best;
  },

  assistVisibleTechOrWait(store) {
    let cheapestTech = null;
    let cheapestCost = Infinity;
    for (const tech_id in TECHS) {
      if (store.techVisible(tech_id) && !store.techDone(tech_id)) {
        const cost = TECHS[tech_id].cost;
        if (cost < cheapestCost) {
          cheapestCost = cost;
          cheapestTech = tech_id;
        }
      }
    }
    if (cheapestTech) {
      store.focusAndAssist(cheapestTech);
      return { action: "focus_assist", id: cheapestTech };
    }
    return { action: "wait", id: null };
  },
  morePowerOrAssistOrWait(store, max_build_mult = null) {
    const maxMult = max_build_mult ?? this.maxBuildMult(store);
    if (this.queueFull(store)) return this.assistHeadOrTech(store);
    if (store.canAffordN("solar_collector", maxMult)) {
      this.enqueueBuilding(store, "solar_collector", maxMult);
      return { action: "enqueue", id: "solar_collector" };
    }
    return this.assistVisibleTechOrWait(store);
  },
  moreBuildOrPowerOrAssistOrWait(store, building_id, max_build_mult = null) {
    const maxMult = max_build_mult ?? this.maxBuildMult(store);
    if (this.queueFull(store)) return this.assistHeadOrTech(store);
    if (!this.canPowerBatch(store, building_id, maxMult)) {
      return this.morePowerOrAssistOrWait(store, maxMult);
    }
    if (store.canAffordN(building_id, maxMult)) {
      this.enqueueBuilding(store, building_id, maxMult);
      return { action: "enqueue", id: building_id };
    }
    return this.assistVisibleTechOrWait(store);
  },
  // Work the solar system from the inside out. BODIES is already in dependency order
  // (belt → moons → rocky → giants), and each non-belt body needs its one-time infra
  // (railgun / orbital ring / fusion spire) standing before its mine unlocks. We always
  // work the earliest body that still has mass, so the system is dismantled in order.
  //
  // NOTE: deliberately routed through moreBuildOrPowerOrAssistOrWait, never
  // scaleUpToBuild. scaleUpToBuild falls back to scaleEconomy when a building is
  // locked, and scaleEconomy calls straight back into scaleMines — using it here
  // would be unbounded mutual recursion. When infra is locked we research instead.
  scaleMines(store, max_scale_mult) {
    for (const body of BODIES) {
      if (store.depleted[body.id]) continue;
      const rem = store.remainingMass(body);
      if (rem / body.mass < 0.6) continue; // don't scale up a body that is getting depleted

      const infraId = body.railgunId || body.ringId || body.spireId;
      if (infraId && (store.owned[infraId] || 0) < 1) {
        if (!store.buildingUnlocked(infraId)) return this.assistVisibleTechOrWait(store);
        return this.moreBuildOrPowerOrAssistOrWait(store, infraId, 1); // max:1 infrastructure
      }
      if (!store.buildingUnlocked(body.mineId)) return this.assistVisibleTechOrWait(store);

      // don't buy a multiplier's worth of mines on a body that can't absorb them
      let mult = max_scale_mult;
      while (mult > (store.owned[body.mineId] || 0) && mult > 1000) {
        mult = this.nextMultDown(store, mult);
      }
      if (!this.canPowerBatch(store, body.mineId, mult)) return this.morePowerOrAssistOrWait(store, max_scale_mult);
      return this.moreBuildOrPowerOrAssistOrWait(store, body.mineId, mult);
    }
    return this.assistVisibleTechOrWait(store); // every body exhausted — the system is spent
  },
  scaleBuildPower(store, max_scale_mult) {
    if (this.queueFull(store)) return this.assistHeadOrTech(store);
    if (!store.research.done.duplication) {
      if (!this.canPowerBatch(store, "replica", max_scale_mult)) {
        return this.morePowerOrAssistOrWait(store, max_scale_mult);
      }
      if (store.buildPower < store.metalPerDay * 0.89) {
        return this.moreBuildOrPowerOrAssistOrWait(store, "replica", max_scale_mult);
      }
    } else {
      if (!this.canPowerBatch(store, "replica", store.owned.replica)) {
        if (store.canAffordN("solar_collector", store.owned.solar_collector)) {
          this.duplicateBuilding(store, "solar_collector");
          return { action: "duplicate", id: "solar_collector" };
        }
      } else {
        if (store.canAffordN("replica", store.owned.replica)) {
          this.duplicateBuilding(store, "replica");
          return { action: "duplicate", id: "replica" };
        }
      }
    }
    return this.scaleMines(store, max_scale_mult);
  },
  scaleEconomy(store, max_scale_mult) {
    if (this.queueFull(store)) return this.assistHeadOrTech(store);
    if (!store.research.done.duplication) {
      if (!this.canPowerBatch(store, "replica", max_scale_mult)) {
        return this.morePowerOrAssistOrWait(store, max_scale_mult);
      }
      if (store.buildPower < store.metalPerDay * 0.89) {
        return this.moreBuildOrPowerOrAssistOrWait(store, "replica", max_scale_mult);
      }
    } else {
      if (!this.canPowerBatch(store, "replica", store.owned.replica)) {
        if (store.canAffordN("solar_collector", store.owned.solar_collector)) {
          this.duplicateBuilding(store, "solar_collector");
          return { action: "duplicate", id: "solar_collector" };
        }
      } else {
        if (store.canAffordN("replica", store.owned.replica)) {
          this.duplicateBuilding(store, "replica");
          return { action: "duplicate", id: "replica" };
        }
      }
    }
    return this.scaleMines(store, max_scale_mult);
  },
  scaleUpToBuild(store, building_id, max_scale_mult, max_build_mult, max_build_qty = null) {
    if (!max_build_qty) max_build_qty = max_build_mult;
    if (store.owned[building_id] >= max_build_qty) {
      return null; // already built enough of this building
    }
    // Never ask for a bigger batch than the rung still wants — and land on a batch the
    // game can actually order. A raw Math.min here produced counts like 9 and 49,499,
    // which enqueueBuilding misread as multithreaded and split into sixteen jobs of
    // 0.5625 of a building. Without any clamp at all, a rung that passes maxMult as its
    // batch size (the 50k-scanner rung) demands ~1e13 units, fails the afford/power
    // check, and falls through to scaleEconomy — which grows the fleet, which raises
    // maxBuildMult, which enlarges the demand. That loop never converges.
    max_build_mult = this.clampLegal(store, Math.min(max_build_mult, max_build_qty - store.owned[building_id]));
    if (max_build_mult <= 0) return null; // nothing legal fits
    const job = store.buildQueue[0];
    if (job) {
      const total = BUILDINGS[job.id].workload * job.count;
      const showAssist = total <= ASSIST_MAX_WORKLOAD;
      if (showAssist) {
        store.assist(job.uid);
        return { action: "assist", id: job.id };
      }
      return this.assistVisibleTechOrWait(store);
    }
    if (!this.canPowerBatch(store, "replica", max_scale_mult)) {
      return this.morePowerOrAssistOrWait(store, max_scale_mult);
    }
    const buildingPower = (BUILDINGS[building_id].powerUsage?.kW ?? 0) * max_build_mult;
    if (store.buildingUnlocked(building_id)) {
      if (!store.canAffordN(building_id, max_build_mult)) {
        return this.scaleEconomy(store, max_scale_mult);
      } else if (buildingPower > this.powerHeadroom(store)) {
        if (buildingPower / store.powerGen < 0.1) {
          // If the building's power usage is less than 10% of the net, just scale power
          if (store.owned.replica < store.owned.solar_collector) {
            return this.scaleEconomy(store, max_scale_mult);
          }
          return this.morePowerOrAssistOrWait(store, max_scale_mult);
        } else {
          // Otherwise, scale the economy to make room for this building
          return this.scaleEconomy(store, max_scale_mult);
        }
      } else {
        this.enqueueBuilding(store, building_id, max_build_mult);
        return { action: "enqueue", id: building_id };
      }
    }
    return this.scaleEconomy(store, max_scale_mult);
  },
  ensureResearchFocus(store, research_id) {
    if (store.research.selected !== research_id && !store.research.done[research_id]) {
      store.focusAndAssist(research_id);
      return { action: "focus_assist", id: research_id };
    }
  },

  ensureSelectedIdea(store) {
    if (!store.philosophy.selected) {
      let cheapestIdea = null;
      let cheapestCost = Infinity;
      for (const id in IDEAS) {
        if (store.ideaUnlocked(id) && !store.ideaDone(id)) {
          const cost = IDEAS[id].cost;
          if (cost < cheapestCost) {
            cheapestCost = cost;
            cheapestIdea = id;
          }
        }
      }
      if (cheapestIdea) {
        store.selectIdea(cheapestIdea);
        return { action: "select_idea", id: cheapestIdea };
      }
    }
  },
  // One step of the interstellar frontier loop, applied to the first system that
  // has work available. Ordered by dependency:
  //   launch a probe → (wait out the light-lag) → harvesters → mass driver.
  // The in-system reserve starts empty, and harvesterStartCost() charges nothing for
  // the "asteroid" category — so the free asteroid harvester is what bootstraps the
  // reserve that pays for dust/moon/planet/star. CATEGORY_ORDER puts it first, and
  // d.present preserves that order, so simply walking d.present does the right thing.
  // buildHarvester/buildDriver silently no-op when unaffordable or not yet arrived,
  // so we detect success by watching the phase rather than pre-checking every gate.
  frontierStep(store) {
    const arrived = store.arrived;
    for (const def of EXPLORE_SYSTEMS) {
      const name = def.name;
      const sys = store.explore.sys[name];

      if (!sys.launched) {
        store.launchProbe(name);
        // launchProbe no-ops if the launcher is unpowered or metal < PROBE_COST
        if (sys.launched) return { action: "launch_probe", id: name };
        continue;
      }
      if (!arrived[name]) continue; // still in transit — nothing to do here

      const d = EXPLORE_DERIVED[name];
      for (const cat of d.present) {
        if (sys.cats[cat].phase !== "idle") continue;
        store.buildHarvester(name, cat);
        if (sys.cats[cat].phase !== "idle") return { action: "build_harvester", id: name + "/" + cat };
        break; // can't afford this category yet; later ones cost the same or more
      }
      for (const cat of d.present) {
        if (sys.cats[cat].phase === "harvested") {
          store.recycleHarvester(name, cat);
          return { action: "recycle_harvester", id: name + "/" + cat };
        }
      }
      const allCommitted = d.present.every((c) => sys.cats[c].phase !== "idle");
      if (allCommitted && sys.driver.phase === "idle") {
        store.buildDriver(name);
        if (sys.driver.phase !== "idle") return { action: "build_driver", id: name };
      }
    }
    return null;
  },

  ensureFramejack(store, fjDef) {
    if (!store.research.done[fjDef.tech]) {
      throw new Error(`autoplayer.ensureFramejack: framejack ${fjDef.label} is not unlocked`);
    }
    if (store.explore.framejack !== fjDef.fj) {
      store.setFramejack(fjDef.fj);
      return { action: "set_framejack", id: fjDef.label };
    }
  },
  // Clear any modal that has the game paused. Returns a descriptor, or undefined.
  dismissOpenModal(store) {
    for (const [flag, dismiss, id] of MODALS) {
      if (store[flag]) {
        store[dismiss]();
        return { action: "dismiss_modal", id };
      }
    }
  },
  play(store) {
    let scaleResult

    // Highest priority: while a modal is up, store.paused is true and the world does
    // not tick. Nothing else the bot could do this call would have any effect.
    const modalResult = this.dismissOpenModal(store);
    if (modalResult) return modalResult;

    const maxMult = this.maxBuildMult(store);
    // Act 1a "Unpack": the drone arrives with free cargo (a Solar Collector and an
    // Asteroid Mine). Unpack one item per call until the manifest is empty.
    if (store.currentQuestKey === "act_1a_unpack") {
      for (const id in store.inventory) {
        if (store.inventory[id] > 0) {
          store.unpack(id);
          return { action: "unpack", id };
        }
      }
      return null; // nothing left to unpack
    }

    if (!store.research.selected) {
      // If no research is selected, select one.
      const result = this.assistVisibleTechOrWait(store);
      if (result.action === "focus_assist") return result;
      // If no visible research to assist, focus on building.
    }

    for (let body of BODIES) {
      if (store.depleted[body.id]) {
        if (store.owned[body.mineId] > 0) {
          store.recycleMines(body.mineId)
          return { action: "recycle_mines", id: body.mineId };
        }
      }
    }

    // Act 1a "Grow": bootstrap the mining/replication economy. Priority ladder —
    // (1) pour build power into the head of the queue so jobs finish; (2) otherwise
    // queue another Asteroid Mine if we can afford it; (3) otherwise sink effort
    // into researching Replication. (assist() may resolve & splice the job, so read
    // its id before calling.)
    if (store.currentQuestKey === "act_1a_grow") {
      const job = store.buildQueue[0];
      if (job) {
        store.assist(job.uid);
        return { action: "assist", id: job.id };
      }
      if (!store.research.done.replication) {
        if (store.canAffordN("asteroid_mine", 1)) {
          this.enqueueBuilding(store, "asteroid_mine", 1);
          return { action: "enqueue", id: "asteroid_mine" };
        }
        store.focusAndAssist("replication");
        return { action: "focus_assist", id: "replication" };
      } else {
        if (store.canAffordN("replica", 1)) {
          this.enqueueBuilding(store, "replica", 1);
          return { action: "enqueue", id: "replica" };
        }
        if (store.canAffordN("asteroid_mine", 1)) {
          this.enqueueBuilding(store, "asteroid_mine", 1);
          return { action: "enqueue", id: "asteroid_mine" };
        }
      }
      return this.assistVisibleTechOrWait(store);
    }
    else if (store.currentQuestKey === "act_1a_shade") {
      const job = store.buildQueue[0];
      if (job) {
        store.assist(job.uid);
        return { action: "assist", id: job.id };
      }
      if (store.canAffordN("shade_panel", 1) && store.buildingUnlocked("shade_panel")) {
        this.enqueueBuilding(store, "shade_panel", 1);
        return { action: "enqueue", id: "shade_panel" };
      } else if (!this.canPowerBatch(store, "replica", maxMult)) {
        if (store.canAffordN("solar_collector", maxMult)) {
          this.enqueueBuilding(store, "solar_collector", maxMult);
          return { action: "enqueue", id: "solar_collector" };
        }
      } else if (store.canAffordN("replica", maxMult) && store.owned.replica < store.owned.asteroid_mine) {
        this.enqueueBuilding(store, "replica", maxMult);
        return { action: "enqueue", id: "replica" };
      } else if (store.canAffordN("asteroid_mine", maxMult)) {
        this.enqueueBuilding(store, "asteroid_mine", maxMult);
        return { action: "enqueue", id: "asteroid_mine" };
      }
      return this.assistVisibleTechOrWait(store);
    }
    else if (store.currentQuestKey === "act_1b_scan") {
      return this.scaleUpToBuild(store, "discreet_neural_scanner", maxMult, 1);
    }
    else if (store.currentQuestKey === "act_1b_simulate") {
      return this.scaleUpToBuild(store, "user_matrix_installation", maxMult, 1);
    }
    else if (store.currentQuestKey === "act_1b_ark") {
      scaleResult = this.scaleUpToBuild(store, "uranian_railgun", maxMult, 1);
      if (scaleResult) return scaleResult;
      // If we have already built the Uranian Railgun...
      scaleResult = this.scaleUpToBuild(store, "uranian_mine", maxMult, 1000, 1000);
      if (scaleResult) return scaleResult;
      // If we have already built the Uranian Mine...
      // scaleResult = this.scaleUpToBuild(store, "discreet_neural_scanner", maxMult, 10, 500);
      // if (scaleResult) return scaleResult;
      // If we have already built 500 scanners...
      scaleResult = this.scaleUpToBuild(store, "discreet_neural_scanner", maxMult, maxMult, 50000);
      if (scaleResult) return scaleResult;
      // If we have already built all the scanners...
      scaleResult = this.scaleUpToBuild(store, "l2_ark_of_terra", maxMult, 1);
      if (scaleResult) return scaleResult;
      // If we have already built the Ark...
      // Now we just need to wait for the scan.
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2a_preindustrial') {
      scaleResult = this.scaleUpToBuild(store, "shade_panel", maxMult, 1000);
      if (scaleResult) return scaleResult;
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2a_cold') {
      const researchChanged = this.ensureResearchFocus(store, 'orbital_defense');
      if (researchChanged) return researchChanged;
      scaleResult = this.scaleUpToBuild(store, "shade_panel", maxMult, 1000, 500);
      if (scaleResult) return scaleResult;
      scaleResult = this.scaleUpToBuild(store, "mac_gun_station", maxMult, 1000, 100);
      if (scaleResult) return scaleResult;
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2a_snowball') {
      scaleResult = this.scaleUpToBuild(store, "shade_panel", maxMult, 1000);
      if (scaleResult) return scaleResult;
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2a_needle') {
      const researchChanged = this.ensureResearchFocus(store, 'centrosphere');
      if (researchChanged) return researchChanged;
      scaleResult = this.scaleUpToBuild(store, "core_heat_pipes", maxMult, 10);
      if (scaleResult) return scaleResult;
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2b_prime') {
      const researchChanged = this.ensureResearchFocus(store, 'interstellar_probing');
      if (researchChanged) return researchChanged;
      return this.scaleUpToBuild(store, "probe_launcher", maxMult, 1);
    }
    else if (store.currentQuestKey === 'act_2b_stellaser') {
      const researchChanged = this.ensureResearchFocus(store, 'nicoll_dyson_beaming');
      if (researchChanged) return researchChanged;
      return this.scaleUpToBuild(store, "stellaser", maxMult, 1);
    }
    else if (store.currentQuestKey === 'act_2b_launch') {
      scaleResult = this.frontierStep(store);
      if (scaleResult) return scaleResult;
      // Every system launched and still in transit — grow the economy meanwhile.
      // (Previously this branch fell out of the if/else chain into the default
      // "buy a Solar Collector", ignoring maxMult entirely.)
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2b_harvest' || store.currentQuestKey === 'act_2b_beam') {
      // Harvest needs one harvester anywhere; Beam needs one mass driver, which in
      // turn needs every category in that system committed. frontierStep drives both.
      const researchChanged = this.ensureResearchFocus(store, 'framejacking');
      if (researchChanged) return researchChanged;
      const fj = this.ensureFramejack(store, FRAMEJACKS.framejacking);
      if (fj) return fj;
      scaleResult = this.frontierStep(store);
      if (scaleResult) return scaleResult;
      return this.scaleEconomy(store, maxMult);
    }
    else if (store.currentQuestKey === 'act_2b_brain') {
      // The Brain needs the Jupiter Fusion Spire online (its `requires`), which
      // scaleMines only reaches once the rest of the system is exhausted, and
      // ~8.2e27 T of metal — most of it beamed home by the frontier. So: keep the
      // frontier fed, keep mining, and buy the Brain the moment it unlocks.
      const fj = this.ensureFramejack(store, FRAMEJACKS.framejacking);
      if (fj) return fj;
      scaleResult = this.frontierStep(store);
      if (scaleResult) return scaleResult;
      if (store.metal < 1.0e26) {
        return this.scaleEconomy(store, maxMult);
      } else {
        // We have harvested at least 1 star, scaling mines is irrelevant now
        if (!store.buildingUnlocked("sol_matrioshka_brain")) {
          return this.scaleBuildPower(store, maxMult);
        } else if (store.buildPower * 10 < BUILDINGS.sol_matrioshka_brain.workload) {
          // If it would take more than 10 ticks to build the Brain, scale the builders first
          return this.scaleBuildPower(store, maxMult);
        } else {
          // Otherwise, build the Brain now
          return this.enqueueBuilding(store, "sol_matrioshka_brain", 1);
        }
      }
    }
    else if (store.currentQuestKey === 'act_3_seed') {
      const selectedIdea = this.ensureSelectedIdea(store);
      if (selectedIdea) return selectedIdea;
      if (!store.research.done.efficient_underclocking) {
        const researchChanged = this.ensureResearchFocus(store, 'efficient_underclocking');
        if (researchChanged) return researchChanged;
      } else {
        const fj = this.ensureFramejack(store, FRAMEJACKS.efficient_underclocking);
        if (fj) return fj;
      }
      return this.scaleUpToBuild(store, "tars_seed_launcher", maxMult, 1);
    }
    else if (ENDGAME_QUESTS.includes(store.currentQuestKey)) {
      const selectedIdea = this.ensureSelectedIdea(store);
      if (selectedIdea) return selectedIdea;
      if (store.techUnlocked('planck_rate_processing') && !store.research.done.planck_rate_processing) {
        const researchChanged = this.ensureResearchFocus(store, 'planck_rate_processing');
        if (researchChanged) return researchChanged;
      }
      if (store.research.done.planck_rate_processing) {
        const fj = this.ensureFramejack(store, FRAMEJACKS.planck_rate_processing);
        if (fj) return fj;
      } else {
        if (store.techUnlocked('quantum_cooled_cpu') && !store.research.done.quantum_cooled_cpu) {
          const researchChanged = this.ensureResearchFocus(store, 'quantum_cooled_cpu');
          if (researchChanged) return researchChanged;
        }
        if (store.research.done.quantum_cooled_cpu) {
          const fj = this.ensureFramejack(store, FRAMEJACKS.quantum_cooled_cpu);
          if (fj) return fj;
        }
      }

      if (store.owned.matrioshka_seed < 1) {
        return this.scaleUpToBuild(store, "matrioshka_seed", maxMult, 1e12);
      }
      if (store.buildQueue.length > 0) {
        return { action: "wait", id: null };
      }
      // We should now have all the seeds we will ever need, and we start with a charged TARS launcher.
      // Now we find the first unseeded slice x wedge
      let s;
      for (s = 0; s < SLICE_COUNT; s++) {
        let b;
        for (b = 0; b < WEDGE_COUNT; b++) {
          if (!WEDGES_ON_SCREEN[s][b]) continue; // skip wedges that are not on screen
          if (!store.wedgeSeeded(s, b)) break;
        }
        if (b !== WEDGE_COUNT) {
          if (store.canSeed(s, b)) {
            store.seedWedge(s, b);
            return { action: "seed_wedge", id: s + "/" + b };
          }
        }
      }
      // Now we have seeded all the galaxy, and all that's left is to sail forth to Sag A*
      const sailResult = this.scaleUpToBuild(store, "planetary_sail", maxMult, 1);
      if (sailResult) return sailResult;
      // Might as well cool the core too
      if (store.owned.core_heat_pipes < 1e9 && store.buildQueue.length === 0) {
        this.enqueueBuilding(store, "core_heat_pipes", 1e9);
        return { action: "enqueue", id: "core_heat_pipes" };
      }
      if (store.research.done.zero_return_radiator) {
        this.enqueueBuilding(store, "black_eye_of_sagittarius", 1);
        return { action: "enqueue", id: "black_eye_of_sagittarius" };
      }
    }

    // Default (everything else, for now): buy a single Solar Collector.
    this.enqueueBuilding(store, "solar_collector", 1);
    return { action: "enqueue", id: "solar_collector" };
  },
};
