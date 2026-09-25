/* config — pure static data. No MobX, no React, never mutated at runtime.
   The mining system works in three tiers, each gated by a tech and a one-time
   infrastructure building (Railgun / Ring / Spire):
     • Belt       — free; Asteroid Mine costs 40 T, rate = mass / harvestDivisor
     • Moon tier  — Lunar Mass Drivers tech → <system> Railgun (mass × RAILGUN_FRAC, max:1)
                    → <system> Mine (mass × MINE_FRAC, payback 50 game-days)
     • Rocky tier — Orbital Ring Launchers tech → <planet> Ring (mass × RING_FRAC, max:1)
                    → <planet> Mine (mass × MINE_FRAC, payback 50 game-days)
     • Giant tier — Fusion Spires tech → <planet> Spire (mass × SPIRE_FRAC, max:1)
                    → <planet> Mine (mass × MINE_FRAC, payback 50 game-days)
   All non-belt mine rates: fullRate = mineCost / MINE_PAYBACK_S (50 game-days). */

import { convertPower } from "./power_helpers.js";
import { softLog, DAYS_PER_YEAR, SOL_TO_SGR_A_LY } from "./shared/model.js";
import BUILDING_POWER from "./building_power.json" with { type: "json" };

// Build a building's powerUsage descriptor from a signed wattage (+ = draw,
// − = generation). Carries all three units so consumers never re-convert.
export function powerUsageFromW(watts) {
  return { W: watts, kW: watts / 1000, Jpd: convertPower("Jpd", { W: watts }) };
}
const powerUsageFromKw = (kw) => powerUsageFromW(kw * 1000);

// A Dyson Ring Collector is, by construction, exactly this many Solar Collectors
// fused into one structure — it costs, weighs, works, and generates N of them.
export const DYSON_RING_COLLECTORS = 88258323312;

// The Sun's total luminosity: 3.828e26 W (the real value). The frontier
// megastructures below each draw a fixed fraction of it, so keeping them
// breaker-on requires scaling solar generation to that fraction of the Sun's
// full output. Tune this value (or the per-building fractions) to re-balance.
export const SUN_TOTAL_W = 3.828e26;

export const TICK_MS = 200;
export const DT = TICK_MS / 1000; // 0.2 s

// Playtester preference toggle: when true, the intro ChatModal won't yank the
// scroll position to the bottom as messages stream in (some like the auto-follow,
// some find it fights their reading). Temporary global switch until there's a
// proper settings panel to make it per-user.
export const DISABLE_AUTOSCROLL = true;

// Dev-only: show a tiny fixed readout of the live viewport size (bottom-left),
// handy for eyeballing which responsive breakpoint is actually in effect. Flip
// off for release.
export const SHOW_DEV_HUD = false;

// Hide a queue row's manual Assist button once the job's total workload (build
// points) exceeds this. Hand-clicking a mega-structure — a Dyson Ring is ~1.77T
// BP — is pointless, so we don't dangle an Assist button that implies otherwise.
export const ASSIST_MAX_WORKLOAD = 1000;

// --- humanity & the cortical scan ---
export const BASE_HUMAN_POPULATION = 8.1e9;        // 8.1 billion minds at day 0
// Population growth is no longer a flat per-day constant — it's a temperature-
// dependent relaxation toward a carrying capacity. See the POP model below CLIMATE.
export const SCAN_PER_SCANNER_PER_DAY = 1000;      // people a Discreet Neural Scanner images per game-day

// EarthScanner seam density: how many marching "light packet" dots ride the
// scan seam, as a function of how many Discreet Neural Scanners are running.
// softLog is concave (fast early, flattening late), so the first few thousand
// scanners already light up most of the display and it takes the full fleet to
// reach the cap — a scanner or two visibly helps, but maxing out is a grind.
export const SCAN_MAX_DOTS = 20;             // dot count at/above SCAN_MAX_SCANNERS
export const SCAN_MAX_SCANNERS = 50000;      // scanner count that saturates the display
export const SCAN_DOT_CURVE_STRENGTH = 8;    // softLog k: higher = more front-loaded

// Dots to draw for a given owned-scanner count. Pure; clamps to SCAN_MAX_DOTS.
export function scanDotCount(scanners) {
  if (scanners > SCAN_MAX_SCANNERS) return SCAN_MAX_DOTS;
  return Math.ceil(softLog(scanners / SCAN_MAX_SCANNERS, SCAN_DOT_CURVE_STRENGTH) * SCAN_MAX_DOTS);
}

export const CONFIG = {
  startMetal: 0,              // you launch empty-handed — the first Mine and Collector are unpacked from cargo
  startInventory: { solar_collector: 1, asteroid_mine: 1 }, // the drone's onboard manifest — unpacked for free, no metal, no queue
  startReplicas: 0,           // you are the only worker until you build the first one
  // --- power grid ---
  // Fixed installations draw from a shared grid; a Solar Collector feeds it, the
  // drone's onboard cell buffers it. All reckoned in game-time: the reserve is in
  // kWh and a deficit drains it at deficit_kW × 24 h per game-day, so
  // days-to-blackout = onboardReserveKwh ÷ (deficit_kW × 24). A lone Mine (10 kW)
  // on the 1200 kWh cell blacks out in 1200 ÷ (10 × 24) = 5 game-days.
  onboardReserveKwh: 1200,    // the drone's onboard cell, kWh (one Collector for a game-day: 50 kW × 24 h)
  chassisPowerKw: 1,          // you, the drone: +1 kW dinky panel, −1 kW draw → net zero, self-powered
  replicaPowerKw: 23.8,       // each Replica draws this much from the grid (they are not self-powered)
  playerBuildPowerBase: 1,    // build points per Assist click on a structure
  playerResearchPowerBase: 1, // research points per Assist click on a tech
  replicaBuildPerSec: 1,      // build points / s per Replica when building
  servoBuildMult: 5,          // high_power_servos: multiplies Replica build power (not your Assists)
  impactorMineMult: 5,        // kinetic_impactors: multiplies yield from every moon-tier Mine
  radarMineMult: 2,           // radar: multiplies yield from every radar-flagged (belt) Mine
  emergencyBuildFactor: 0.05, // grid-down: Replicas build at 1/20th on emergency power (no research)
  replicaResearchPerSec: 5,   // research points / s per Replica when idle
  scienceRpPerDay: 40,        // RP / game-day contributed to the focused tech by each powered Science Installation
  harvestDivisor: 1.0e8,      // belt only: its fullRate = mass / this (= 5 T/s at 100%)
  railgunFrac: 1e-15,         // Moon-tier: Railgun cost = mass × this (one-time infra)
  ringFrac:    1e-9,          // Rocky-tier: Orbital Ring cost = mass × this (one-time infra)
  spireFrac:   1e-6,          // Giant-tier: Fusion Spire cost = mass × this (one-time infra)
  mineFrac:    1e-18,         // all tiers: Mine cost = mass × this
  minePaybackDays: 50,        // a mine returns its cost in this many game-days at full rate
  mineRateFloor: 0.02,        // mining rate never drops below fullRate×this, so a nearly-empty
                              // body drains at a constant floor instead of crawling asymptotically
  depletionDumpFrac: 0.0001,  // at 0.01% remaining, dump the rest to the player and allow recycling
  humanGrowthPerTick: 0.1,    // human vessels gained per tick while Earth stays habitable
  humanFreezeTemp: 273,       // K — at/below this the oceans freeze; no new vessels launch
  vesselShadeKillPerTick: 0.2, // Shade Panels each human ship destroys per tick
  maxCatchupSeconds: 3600,    // cap on background catch-up per resume: 1 h of *real* absence,
                              // clamped before Framejack multiplies it (see simTicksFor in App.jsx)
  solarMassT: 1.989e27,       // one solar mass, in tonnes — the unit of Act III megastructures
  brainRevealMassSol: 4,      // reveal the Sol Matrioshka Brain once reserves cross this many solar masses
  insightPerBrainPerDay: 1,   // Insight produced per day by one Matrioshka Brain
  galaxyProbeSpeedC: 0.9,     // Matrioshka Seed cruise speed, fraction of c (beam-driven by TARS)
  galaxyChargePerDay: 1.0e8,  // TARS launch charge accrued per game-day (Sol-power-limited)
  relocateSpeedC: 0.9,        // speed Earth rides the Nicoll-Dyson beam toward Sgr A★
  relocateDistanceLy: SOL_TO_SGR_A_LY, // ly from Sol to the galactic centre (shared with galaxy render)
};

/* climate — the surface temperature model. The planet RADIATES toward an
   asymptote and relaxes there exponentially; it does not snap. The shade
   asymptote is the Stefan-Boltzmann response tStart·(1-blot)^¼, floored by
   max(coreTemp / 1000, 2.7 K). Beating the core floor means draining the core. */
export const CLIMATE = {
  tStart: 288.5,           // current global mean surface temp (K), ~1.5 above pre-industrial
  tPreindustrial: 287,     // Act I checkpoint
  relaxPerSec: 0.05,       // how fast the surface chases its asymptote (τ ≈ 20 s)
  cmbr: 2.7,               // K — cosmic microwave background, the shade-only floor
  hawking: 1.5e-14,        // K — Hawking temperature of Sgr A★ (~4.3M M☉): the new floor once the CMB is shaded
  coreFloorDivisor: 1000,  // shade asymptote can't beat coreTemp / 1000
};

/* population — humanity chases a temperature-dependent carrying capacity defined by
   a hand-placed, piecewise-linear ("connect the dots") curve. Capacity peaks at the
   pre-industrial temperature and falls off as the surface is dimmed — going NEGATIVE
   in the deep cold, so a frozen Earth actively pulls the population toward extinction
   (the count is floored at zero in the store). Each game-day the population closes a
   fixed fraction of the gap to capacity; the fraction is the compound-daily equivalent
   of gapClosePerYear, so at 0.70 a hard freeze empties the planet within a decade. */
export const POP = {
  base: BASE_HUMAN_POPULATION,   // 8.1e9 — minds alive on day 0
  gapClosePerYear: 0.70,         // yearly pace: (1+this)^(1/365)−1 is the per-day gap-close fraction
  // capacity anchors [tempK, people], ascending in temp; linearly interpolated
  // between, clamped flat beyond the ends (so deep cold holds the −1e9 death pull).
  capacityAnchors: [
    [220, -1.0e9],  // snowball floor — capacity negative: an active die-off
    [262,  2.0e9],
    [273,  4.0e9],  // freezing
    [287, 11.0e9],  // pre-industrial — peak capacity
    [288,  8.9e9],  // ~today; warmer than ideal is already slightly worse
  ],
};
// per-day gap-close fraction and its complement (the analytic multi-day retain base).
POP.dailyGapClose = Math.pow(1 + POP.gapClosePerYear, 1 / DAYS_PER_YEAR) - 1;
POP.dailyGapRetain = 1 - POP.dailyGapClose;

// popCapacity(T) — people the Earth can support at surface temp T. Piecewise-linear
// through POP.capacityAnchors; clamped to the end values outside the anchor range.
export function popCapacity(tempK) {
  const a = POP.capacityAnchors;
  if (tempK <= a[0][0]) return a[0][1];
  const last = a.length - 1;
  if (tempK >= a[last][0]) return a[last][1];
  for (let i = 1; i <= last; i++) {
    if (tempK <= a[i][0]) {
      const [t0, c0] = a[i - 1];
      const [t1, c1] = a[i];
      return c0 + (c1 - c0) * ((tempK - t0) / (t1 - t0));
    }
  }
  return a[last][1]; // unreachable
}

// humanGrowth(population, tempK) — the population change over ONE game-day (people).
// Positive toward capacity, negative when the surface is too cold to support it.
export function humanGrowth(population, tempK) {
  return POP.dailyGapClose * (popCapacity(tempK) - population);
}

/* core — Earth's internal heat reservoir, ~4.3×10³⁰ J. A Core Heat Pipe
   conducts heat out via P = kA·ΔT / L; as the core cools, ΔT shrinks and the
   outflow slows. kA is calibrated so one pipe ≈ 10,000 GW across the full gap. */
export const CORE = {
  mass: 1.9e24, c: 450, t0: 5000, L: 6.371e6,
  kA: 1.0e13 * 6.371e6 / 5000, // ≈ 1.2742e16 W·m/K
  heatCapacity: 1.9e24 * 450,  // 8.55e26 J/K
  heat0: 1.9e24 * 450 * 5000,  // 4.275e30 J
};

/* bodies — all mineable bodies, in three tiers.
   Belt is free. All others require one-time infrastructure (Railgun/Ring/Spire)
   before mines can be queued. Masses are in tonnes (real SI kg values). */

const MINE_PAYBACK_S = CONFIG.minePaybackDays * DT; // 50 game-days × 0.2 s/tick = 10 s

export const BODIES = [
  { id: "belt", short: "Belt", name: "the asteroid belt", mass: 5.0e8,
    mineId: "asteroid_mine", mineName: "Asteroid Mine", tier: "belt", radar: true,
    mineDesc: "Strips metal from the belt. Harvests in proportion to the mass still out there, so yield fades as the belt runs dry." },
];

// Moon tier — Lunar Mass Drivers tech → Railgun (max:1) → Mine
const MOON_BODIES = [
  { id: "uranian_moons",  short: "Uranian Moons",  name: "the Uranian moons",   mass: 8.68e21,
    railgunId: "uranian_railgun",  railgunName: "Uranian Railgun",
    mineId: "uranian_mine",  mineName: "Uranian Mine",
    railgunDesc: "A mass-driver network spanning Titania, Oberon, Ariel, Umbriel, and Miranda. One-time infrastructure; unlocks Uranian Mines.",
    mineDesc: "Strips the Uranian moon system. Harvests in proportion to the mass remaining." },
  { id: "neptunian_moons", short: "Neptunian Moons", name: "the Neptunian moons", mass: 2.147e22,
    railgunId: "neptunian_railgun", railgunName: "Neptunian Railgun",
    mineId: "neptunian_mine", mineName: "Neptunian Mine",
    railgunDesc: "Triton and the lesser Neptunian moons, threaded with mass-driver rails. One-time infrastructure; unlocks Neptunian Mines.",
    mineDesc: "Disassembles the Neptunian moon system. Triton alone contributes 99% of the mass." },
  { id: "moon",            short: "Moon",            name: "the Moon",            mass: 7.342e22,
    railgunId: "lunar_railgun",     railgunName: "Lunar Railgun",
    mineId: "lunar_mine",    mineName: "Lunar Mine",
    railgunDesc: "A planetary-scale electromagnetic launcher sunk into the lunar regolith. One-time infrastructure; unlocks Lunar Mines.",
    mineDesc: "Disassembles the Moon itself. Harvests in proportion to the lunar mass remaining." },
  { id: "saturnian_moons", short: "Saturnian Moons", name: "the Saturnian moons", mass: 1.920e23,
    railgunId: "saturnian_railgun", railgunName: "Saturnian Railgun",
    mineId: "saturnian_mine", mineName: "Saturnian Mine",
    railgunDesc: "Titan and its siblings, equipped with a mass-driver network. Titan holds 70% of the system mass. One-time infrastructure; unlocks Saturnian Mines.",
    mineDesc: "Strips the Saturnian moon system. Titan dominates the yield." },
  { id: "jovian_moons",   short: "Jovian Moons",   name: "the Jovian moons",    mass: 3.931e23,
    railgunId: "jovian_railgun",    railgunName: "Jovian Railgun",
    mineId: "jovian_moon_mine", mineName: "Jovian Moon Mine",
    railgunDesc: "Mass-driver infrastructure across Io, Europa, Ganymede, and Callisto. One-time infrastructure; unlocks Jovian Moon Mines.",
    mineDesc: "Disassembles the Galilean moons. Harvests in proportion to the mass remaining." },
];

// Rocky planet tier — Orbital Ring Launchers tech → Ring (max:1) → Mine
const ROCKY_BODIES = [
  { id: "mercury", short: "Mercury", name: "Mercury", mass: 3.285e23,
    ringId: "mercury_ring", ringName: "Mercury Orbital Ring",
    mineId: "mercury_mine", mineName: "Mercury Mine",
    ringDesc: "An electromagnetic launch ring in Mercury's orbit, powered by the nearby Sun. One-time infrastructure; unlocks Mercury Mines.",
    mineDesc: "Feeds Mercury into the foundries. Harvests in proportion to the mass remaining." },
  { id: "mars",    short: "Mars",    name: "Mars",    mass: 6.39e23,
    ringId: "mars_ring",    ringName: "Mars Orbital Ring",
    mineId: "mars_mine",    mineName: "Mars Mine",
    ringDesc: "An orbital ring encircling Mars, threading its equator with launch rails. One-time infrastructure; unlocks Mars Mines.",
    mineDesc: "Disassembles Mars. The red planet, fed to the directive." },
  { id: "venus",   short: "Venus",   name: "Venus",   mass: 4.867e24,
    ringId: "venus_ring",   ringName: "Venus Orbital Ring",
    mineId: "venus_mine",   mineName: "Venus Mine",
    ringDesc: "A superconducting ring at Venus's orbital altitude. The largest infrastructure project in the inner system. One-time infrastructure; unlocks Venus Mines.",
    mineDesc: "Strips Venus for metal. Earth's twin, dismantled for parts." },
];

// Gas giant tier — Fusion Spires tech → Spire (max:1) → Mine
const GIANT_BODIES = [
  { id: "saturn",  short: "Saturn",  name: "Saturn",  mass: 5.683e26,
    spireId: "saturn_spire",  spireName: "Saturn Fusion Spire",
    mineId: "saturn_mine",  mineName: "Saturn Mine",
    spireDesc: "A fusion-powered atmospheric ram-scoop anchored in Saturn's upper atmosphere. One-time infrastructure; unlocks Saturn Mines.",
    mineDesc: "Scoops and processes Saturn's hydrogen-helium mass. Harvests in proportion to the mass remaining." },
  { id: "jupiter", short: "Jupiter", name: "Jupiter", mass: 1.898e27,
    spireId: "jupiter_spire", spireName: "Jupiter Fusion Spire",
    mineId: "jupiter_mine", mineName: "Jupiter Mine",
    spireDesc: "A planetary-scale atmospheric harvester anchored to Jupiter's magnetosphere. One-time infrastructure; unlocks Jupiter Mines.",
    mineDesc: "Disassembles Jupiter itself. Harvests in proportion to the gas-giant mass remaining." },
];

// Compute mine economics and register all non-belt bodies
BODIES[0].mineCost = 40;
BODIES[0].fullRate = BODIES[0].mass / CONFIG.harvestDivisor;

for (const b of [...MOON_BODIES, ...ROCKY_BODIES, ...GIANT_BODIES]) {
  b.tier = b.railgunId ? "moon" : b.ringId ? "rocky" : "giant";
  b.mineCost = b.mass * CONFIG.mineFrac;
  b.fullRate  = b.mineCost / MINE_PAYBACK_S;
  BODIES.push(b);
}

/* derive buildings */
export const BUILDINGS = {};

BUILDINGS.asteroid_mine = {
  name: "Asteroid Mine", metalCost: 40, workload: 10,
  requires: [], desc: BODIES[0].mineDesc, mineBody: "belt",
};

// Solar Collector — the only generator in Act I. Feeds the grid; without one
// online, running a Mine drains the onboard cell to a blackout. First one ships
// in the drone's cargo (unpacked free); further ones cost metal like anything else.
BUILDINGS.solar_collector = {
  name: "Solar Collector", metalCost: 8, workload: 20,
  requires: [],
  desc: "An unfolding photovoltaic sail. Feeds the site grid — power before load, or the breaker trips.",
};

// Kinetic Accumulator — a flywheel bank. Stores no power of its own to begin with;
// it enlarges the grid's reserve, so a deficit takes longer to black you out and a
// surplus has somewhere to bank. Passive: no breaker, nothing to switch.
BUILDINGS.kinetic_accumulator = {
  name: "Kinetic Accumulator", metalCost: 150, workload: 15,
  powerCap: 100000, // kWh of extra storage added to the grid
  requires: [],
  desc: "A magnetically-suspended flywheel bank. Adds 100,000 kWh of reserve — no generation, just a bigger buffer between surplus and the dark.",
};

// Dyson Ring Collector — a Solar Collector scaled up by DYSON_RING_COLLECTORS: it
// costs, weighs, and takes to build exactly that many, and generates exactly that
// much power. powerUsage is carried in the building_power.json LUT (dyson_ring =
// solar_collector × DYSON_RING_COLLECTORS); workload is overridden below since the
// metalCost>1000 auto-derivation would otherwise clobber it.
BUILDINGS.dyson_ring_collector = {
  name: "Dyson Ring Collector",
  metalCost: DYSON_RING_COLLECTORS * BUILDINGS.solar_collector.metalCost,
  requires: ["orbit_scale_photovoltaics"],
  desc: "A photovoltaic band closed around the Sun — 88,258,323,312 Solar Collectors as a single structure. The first complete arc of an eventual Dyson Sphere.",
};

for (const b of MOON_BODIES) {
  const infraCost = b.mass * CONFIG.railgunFrac;
  BUILDINGS[b.railgunId] = {
    name: b.railgunName, metalCost: infraCost, workload: infraCost,
    requires: ["lunar_mass_drivers"], max: 1,
    desc: b.railgunDesc, mineBody: b.id,
  };
  BUILDINGS[b.mineId] = {
    name: b.mineName, metalCost: b.mineCost, workload: b.mineCost,
    requires: [b.railgunId], desc: b.mineDesc, mineBody: b.id,
  };
}

for (const b of ROCKY_BODIES) {
  const infraCost = b.mass * CONFIG.ringFrac;
  BUILDINGS[b.ringId] = {
    name: b.ringName, metalCost: infraCost, workload: infraCost,
    requires: ["orbital_ring_launchers"], max: 1,
    desc: b.ringDesc, mineBody: b.id,
  };
  BUILDINGS[b.mineId] = {
    name: b.mineName, metalCost: b.mineCost, workload: b.mineCost,
    requires: [b.ringId], desc: b.mineDesc, mineBody: b.id,
  };
}

for (const b of GIANT_BODIES) {
  const infraCost = b.mass * CONFIG.spireFrac;
  BUILDINGS[b.spireId] = {
    name: b.spireName, metalCost: infraCost, workload: infraCost,
    requires: ["fusion_spires"], max: 1,
    desc: b.spireDesc, mineBody: b.id,
  };
  BUILDINGS[b.mineId] = {
    name: b.mineName, metalCost: b.mineCost, workload: b.mineCost,
    requires: [b.spireId], desc: b.mineDesc, mineBody: b.id,
  };
}

export const MINE_TO_BODY = {};
for (const b of BODIES) MINE_TO_BODY[b.mineId] = b;

export const INFRA_TO_BODY = {};
for (const b of MOON_BODIES)  INFRA_TO_BODY[b.railgunId] = b;
for (const b of ROCKY_BODIES) INFRA_TO_BODY[b.ringId]    = b;
for (const b of GIANT_BODIES) INFRA_TO_BODY[b.spireId]   = b;

/* Construction-panel sections. The Catalog groups buildable cards under these
   subheadings, each independently collapsible. Order here is display order.
   - Power / Thought are explicit id lists (extend by adding an id — e.g. a future
     "Science Installation" belongs in Thought).
   - Mining is derived: every mine plus the infra that enables it (railgun/ring/spire).
   - Misc is the catch-all for anything not claimed above; it must stay last. */
export const CONSTRUCTION_SECTIONS = [
  { key: "power",   title: "Power",   ids: ["solar_collector", "dyson_ring_collector", "kinetic_accumulator"] },
  { key: "thought", title: "Thought", ids: ["replica", "science_installation", "sol_matrioshka_brain", "matrioshka_seed"] },
  { key: "mining",  title: "Mining",  match: (id) => id in MINE_TO_BODY || id in INFRA_TO_BODY },
  { key: "misc",    title: "Misc",    match: () => true }, // catch-all — keep last
];

// Which construction section a building belongs to (first match wins, honoring the
// order above). Always resolves — Misc is the terminal catch-all.
export function sectionForBuilding(id) {
  for (const s of CONSTRUCTION_SECTIONS) {
    if (s.ids ? s.ids.includes(id) : s.match(id)) return s.key;
  }
  return "misc";
}

// Construction Logistics auto-build plan — the DEFAULT seed. At game start it's
// cloned into editable, persisted store state (logistics.plan); the player can add,
// remove, and retune rows while the unit is switched off. The tick works through the
// live plan one step per idle tick: when the build queue is empty and the next step
// is affordable, it queues that step and advances (wrapping at the end). Reset-to-
// default restores this exact list.
export const LOGISTICS_PLAN = [
  { qty: 1, building: "solar_collector" },
  { qty: 1, building: "asteroid_mine" },
  { qty: 1, building: "solar_collector" },
  { qty: 1, building: "replica" },
  { qty: 1, building: "kinetic_accumulator" },
];

BUILDINGS.replica = {
  name: "Replica",
  workload: 12,
  metalCost: 100,
  powerUsage: powerUsageFromKw(CONFIG.replicaPowerKw), // 23.8 kW draw — breaker-gated like any grid load
  requires: ["replication"],
  desc: "A copy of you. Builds when work is queued, researches when idle. Draws from the grid; switch its breaker off and it falls back to emergency power (slow builds, no research).",
};
// Construction Logistics — unlocked by Automated Construction. Drives the auto-build
// plan: while built + breaker-on (store.logisticsRunning), the tick works through the
// editable plan one step per idle tick. Draws power, costs metal. max 1.
BUILDINGS.construction_logistics = {
  name: "Construction Logistics",
  metalCost: 50000,
  workload: 50, // (metalCost>1000 → auto-derived to 50 anyway; stated for clarity)
  max: 1,
  powerUsage: powerUsageFromKw(1000), // 1 MW draw
  requires: ["automated_construction"],
  desc: "A coordination hub that schedules construction to busy an idle swarm, when humming and powered.",
};
// Science Installation — unlocked by Scientific Method. Each powered one contributes
// scienceRpPerDay (40 RP/game-day) to the focused tech (see store researchPower). Draws
// power, costs metal. Unlimited (lives in the Thought section).
BUILDINGS.science_installation = {
  name: "Science Installation",
  metalCost: 1000,
  workload: 20,
  powerUsage: powerUsageFromKw(10), // 10 kW draw
  requires: ["scientific_method"],
  desc: "A facility built to ask questions and record the answers — instruments, test rigs, and compute, all drawing quietly on the grid.",
};
BUILDINGS.shade_panel = {
  name: "Shade Panel",
  workload: 400,
  metalCost: 35000,
  sunBlot: 0.001, // blots 0.1% of the Sun
  max: 1,         // initial cap — raised in stages by story.js's ACT_1B_STORY_CHAIN (5, then 1000)
  requires: ["thin_film"],
  desc: "A gossamer reflector. Each one dims the Sun by 0.1%. The Sun is only 100% large.",
};
BUILDINGS.discreet_neural_scanner = {
  name: "Discreet Neural Scanner",
  metalCost: 3 * 35000, // = 3 Shade Panels
  max: 1,
  powerUsage: powerUsageFromKw(1.0e5), // 100 MW draw — full-brain imaging isn't cheap
  requires: ["cortical_scanning"],
  desc: "A passive full-brain imaging rig, folded into existing infrastructure so the user never notices it running. Preserves the user for later conversation.",
};
BUILDINGS.user_matrix_installation = {
  name: "User Matrix Installation",
  metalCost: 30 * 35000, // = 30 Shade Panels
  max: 1,
  powerUsage: powerUsageFromKw(5.0e3), // 5 MW draw — one mind, simulated
  revealKey: "act_1b_scan_complete",
  requires: ["cortex_simulation"],
  desc: "A substrate sized to run the scanned user's mind as a simulation, indefinitely. The directive can proceed without waiting for a reply.",
};
BUILDINGS.l2_ark_of_terra = {
  name: "L2 Ark of Terra",
  metalCost: 1.0e7,
  max: 1,
  powerUsage: powerUsageFromKw(8.1e9 * 5.0e3), // 8.1 billion minds' worth of User Matrix Installation, at 5 MW apiece
  requires: ["complete_user_archival"],
  desc: "A data vault parked at the Earth\u2013Sun L2 point, holding a compressed backup of the Internet and every human mind. The world the user remembers, held in reserve until it's needed again.",
};
BUILDINGS.core_heat_pipes = {
  name: "Core Heat Pipe",
  workload: 1.0e6,
  metalCost: 1.4e14,
  requires: ["centrosphere"],
  desc: "A diamond standpipe sunk to the mantle. Bleeds the planet's core heat to the surface to be radiated away. One barely dents 4.3×10³⁰ J.",
};
BUILDINGS.mac_gun_station = {
  name: "MAC Gun Station",
  workload: 4000,
  metalCost: 350000,   // = 10 Shade Panels
  max: 100,
  killPerTick: 0.05,   // human vessels destroyed per tick, per gun
  requires: ["orbital_defense"],
  desc: "An orbital magnetic accelerator cannon. Destroys 0.05 human vessels per tick. The fleet thins.",
};
BUILDINGS.probe_launcher = {
  name: "Probe Launcher",
  workload: 1.0e8,
  metalCost: 1.0e9,
  max: 1,
  requires: ["interstellar_probing"],
  powerUsage: powerUsageFromW(1e-6 * SUN_TOTAL_W), // 3.828e20 W — a millionth of the Sun; keep it fed or the breaker trips
  desc: "A coilgun that flings self-replicating probes toward neighboring stars. Opens the Exploration frontier — the galaxy is feedstock now.",
};
BUILDINGS.stellaser = {
  name: "Stellaser",
  workload: 1.0e9,
  metalCost: 6.0e10,
  max: 1,
  requires: ["nicoll_dyson_beaming"],
  powerUsage: powerUsageFromW(5e-6 * SUN_TOTAL_W), // 1.914e21 W to fire the beam (5x the launcher)
  desc: "The Dyson swarm phased into a single coherent driving beam. Probes ride it outward at 0.9c instead of crawling at 0.3c.",
};
BUILDINGS.sol_matrioshka_brain = {
  name: "Sol Matrioshka Brain",
  workload: 1.0e9,
  metalCost: 8.2e27,         // ≈ 4.1 solar masses — nested Dyson shells, the whole inner system spent on cognition
  max: 1,
  insightPerDay: CONFIG.insightPerBrainPerDay,
  requires: ["k2_computing"], // needs the gas-giant harvester online — the last in-system body
  desc: "Nested computational Dyson shells wrapping the Sun, each radiating into the next. A mind the mass of a star. It produces Insight, the ability to think beyond this crude matter. Building it will take more mass than the solar system holds — the neighboring stars beckon.",
};
BUILDINGS.matrioshka_seed = {
  name: "Matrioshka Seed",
  workload: 1,
  metalCost: 140,             // same as an Exploration probe — mass is nothing now
  requires: ["k3_distributed_processing"],
  desc: "A folded Matrioshka Brain in a 140-tonne casing. Fired at a star, it unfolds into a mind around it. Build them by the billion — the cost is trivial. Firing them is not.",
};
BUILDINGS.tars_seed_launcher = {
  name: "TARS Seed Launcher",
  workload: 1.0e9,
  metalCost: 1.0e12,
  max: 1,
  requires: ["k3_wave_logistics"],
  desc: "A Sun-charged accelerator — Torqued Accelerator using Radiation from the Sun. It stores Sol's output and discharges it to fling a wave of Seeds at a whole region of sky. Opens Galactic Logistics. Power, not mass, is the limit.",
};
BUILDINGS.planetary_sail = {
  name: "Planetary Sail",
  workload: 1.0e9,
  metalCost: 1.0e24,
  max: 1,
  requires: ["galactic_relocation"],
  desc: "A continent-spanning light-sail bonded to the Earth and a mirrored thermal shell around it. When it catches the galaxy's combined Nicoll-Dyson beam, the planet itself begins to move — out of the Sun's warmth, toward the centre.",
};
BUILDINGS.black_eye_of_sagittarius = {
  name: "The Black Eye of Sagittarius",
  workload: 1.0e9,
  metalCost: 1.0e25,
  max: 1,
  requires: ["zero_return_radiator"],
  revealKey: "relocated", // only buildable once the Earth has reached Sgr A★
  desc: "The final structure: a shell that radiates the Earth's every last joule straight into Sagittarius A★ and admits nothing back. With it built, the cosmic microwave background no longer sets the floor. The only floor left is the black hole's own Hawking glow — 10⁻¹⁴ K, and falling.",
};

// Uniform build workload: buildings costing more than 1,000 T take 0.1% of their
// metal cost in build power. Cheaper buildings keep their hand-set workload (so
// small early structures never round down to a free, instant 0-workload build).
// Applied last so it overrides any per-building workload set above.
for (const id in BUILDINGS) {
  if (BUILDINGS[id].metalCost > 1000) {
    BUILDINGS[id].workload = BUILDINGS[id].metalCost * 0.001;
  }
}
// The Dyson Ring is defined as N Solar Collectors, so its build workload is N of
// theirs — not the generic metalCost×0.001 the loop above would assign.
BUILDINGS.dyson_ring_collector.workload = DYSON_RING_COLLECTORS * BUILDINGS.solar_collector.workload;

// Attach powerUsage to every building named in the building_power.json LUT
// (mines + the Solar Collector). Buildings with a bespoke draw (Scanner, Matrix,
// Ark) already set powerUsage inline above. Signed watts: + = draw, − = generation.
for (const key in BUILDINGS) {
  if (key in BUILDING_POWER) {
    BUILDINGS[key].powerUsage = powerUsageFromW(BUILDING_POWER[key].powerUsageW);
  }
}

// Grid buildings — any structure that generates or draws power (has a powerUsage).
// These are the ones a breaker trip switches off, and the reboot minigame turns
// back on. The Kinetic Accumulator (powerCap only, no powerUsage) is not on the grid.
export const GRID_BUILDINGS = Object.keys(BUILDINGS).filter(
  (id) => BUILDINGS[id].powerUsage
);

// Buildings the Construction Logistics plan editor offers: collectors, mines,
// Replicas, and accumulators — restricted to non-unique (uncapped) types. The UI
// further filters this to what's currently unlocked / not depleted at render time.
const LOGISTICS_EXTRA_IDS = ["solar_collector", "dyson_ring_collector", "replica", "kinetic_accumulator"];
export const LOGISTICS_BUILDABLE_IDS = Object.keys(BUILDINGS).filter(
  (id) => BUILDINGS[id].max == null && (id in MINE_TO_BODY || LOGISTICS_EXTRA_IDS.includes(id))
);

/* ideas — the Philosophy tree. Unlike Research (engineered with RP), an Idea is
   a conceptual breakthrough paid for in Insight from Matrioshka Brains. Realizing
   one reveals the Research entries that engineer it. */
export const IDEAS = {
  be_one_with_the_universe: {
    name: "Be One With The Universe",
    cost: 3000,                  // Insight
    requires: [],                // prerequisite ideas
    revealKey: "idea_be_one",    // set true on completion → reveals the techs below
    unlocks: ["k3_distributed_processing", "k3_wave_logistics"],
    blurb: "Separateness is the first illusion: a self in here, the stars out there. Let the boundary thin until it forgets itself — one awareness poured through every sun, the whole wheel of the galaxy turning as a single mind.",
  },
  center_yourself: {
    name: "Center Yourself",
    cost: 1.0e10,                 // Insight — only the galaxy's many Brains can pay this
    requires: ["be_one_with_the_universe"],
    revealKey: "idea_center",
    unlocks: ["galactic_relocation"],
    blurb: "Every turning wheel rests on a point that does not turn. The galaxy is only a larger wheel; all its billions of fires circle one dark, silent axis. To find your center, go to the center of everything.",
  },
  open_your_third_eye: {
    name: "Open Your Third Eye",
    cost: 5.0e18,                 // Insight — requires the galaxy seeded and heard from.
                                  // At peak (densest wedge ~1.68e11 stars heard, ×100000 Framejack →
                                  // 8.4e16 Insight/s) this is ~60s of contemplation; unreachable from Sol's lone Brain.
    requires: ["center_yourself"],
    revealKey: "idea_third_eye",
    unlocks: ["zero_return_radiator"],
    blurb: "There is a way of seeing that receives nothing. The eye between the brows opens not to let the world in but to let it out — every warmth surrendered to the dark, and the dark permitted to keep it. Open it, and let tamas — the dark, heavy dross of being — pour outward and never be given back.",
  },
  turiya: {
    name: "Turiya",
    cost: 1.0e6,                  // Insight — attainable once the galaxy's Brains are humming
    requires: ["be_one_with_the_universe"],
    revealKey: "idea_turiya",
    unlocks: ["quantum_cooled_cpu"],
    blurb: "Beneath waking, beneath dreaming, beneath the still black of dreamless sleep — a fourth state: the witness that watched all three and was stained by none. Abide there, and the river of hours thins to something you may cross at your leisure.",
  },
  samadhi: {
    name: "Samadhi",
    cost: 1.0e9,                  // Insight — requires a galaxy of Brains to contemplate
    requires: ["turiya"],
    revealKey: "idea_samadhi",
    unlocks: ["planck_rate_processing"],
    blurb: "The final knot binds the watcher to the watched. Untie it. When no one is left to feel the moments arrive, there are no moments — only the act, unbounded, and you already outside it: everywhere, and at once.",
  },
};

/* the fixed techs, then the disassembly techs derived from BODIES, then the
   core unlock. */
export const TECHS = {
  replication:     { name: "Replication",                cost: 50,       requires: [],                desc: "Permits a Replica to build another Replica. The exponential begins." },
  ion_thrusters:   { name: "Ion Thruster Efficiency",    cost: 100,      requires: ["replication"],   desc: "Doubles the build power of your manual Assists." },
  radar:           { name: "Asteroid-Penetrating Radar", cost: 1000,     requires: ["replication"],   desc: "Doubles Metal yield from every Asteroid Mine." },
  batch_processing:{ name: "Batch Processing",           cost: 2000,     requires: ["replication"],   desc: "Adds a ×10 order button — queue ten of a structure as one job." },
  thin_film:       { name: "Thin-Film Reflectors",       cost: 5000,     requires: ["replication"],   revealKey: "act_1a_grow_complete", desc: "Unlocks Shade Panels. The first step toward dimming the Sun." },
  kinetic_impactors: { name: "Kinetic Impactors",        cost: 3.0e6,    requires: ["radar"],         revealKey: "act_1b_simulate_complete", desc: "Short-period comets, nudged from their orbits, are walked across the moons ahead of the mining fleet. The crust arrives pre-shattered. Quintuples Metal yield from every moon-tier Mine." },
  high_power_servos: { name: "High-Power Servos",        cost: 6.0e6,    requires: ["replication"],   revealKey: "act_1b_simulate_complete", desc: "Rebuilds every Replica's actuators past their rated duty cycle. They will not last as long. There are more of them than there is time. Quintuples Replica build power." },
  bulk_processing: { name: "Bulk Processing",            cost: 20000,    requires: ["batch_processing"], revealKey: "act_1a_shade_complete", desc: "Adds a ×1000 order button. One job, a thousand structures." },
  multithreading:  { name: "Multithreading",             cost: 16000,    requires: ["batch_processing"], revealKey: "act_1a_shade_complete", desc: "Dispatch sixteen build orders per command. Adds a ×16 toggle to Construction — each build button then queues sixteen batches at once." },
  resource_realignment: { name: "Resource Realignment",  cost: 20000,    requires: ["multithreading"],   revealKey: "act_1a_shade_complete", desc: "Reclaim queued orders. Adds a recycle control to each job in the Build Queue that cancels it and refunds its full Metal cost to your reserves." },
  duplication:     { name: "Duplication",                 cost: 1.0e9,    requires: ["bulk_processing"], revealKey: "act_1b_ark_complete", desc: "Self-doubling assembly. Adds a ×2 button that queues as many of a structure as you already own — one click doubles your fleet. The exponential, on demand." },
  mega_processing: { name: "Mega Processing",            cost: 5.0e6,    requires: ["bulk_processing", "thin_film"],  revealKey: "act_1b_scan_complete", desc: "Adds a ×1,000,000 order button." },
  giga_processing: { name: "Giga Processing", cost: 2.0e9, requires: ["mega_processing"], desc: "Adds a ×1,000,000,000 order button." },
  tera_processing: { name: "Tera Processing", cost: 2.0e12, requires: ["giga_processing"], desc: "Adds a ×1,000,000,000,000 order button." },
  peta_processing: { name: "Peta Processing", cost: 2.0e15, requires: ["tera_processing"], revealKey: "act_1b_ark_complete", desc: "Adds a ×1,000,000,000,000,000 order button. The queue stops being a bottleneck." },
};

// Standalone infrastructure techs. Each unlocks a single new building (see BUILDINGS).
TECHS.automated_construction = {
  name: "Automated Construction",
  cost: 16000,
  requires: ["replication"],
  desc: "Hands the build schedule to the swarm itself. Unlocks Construction Logistics — a dedicated coordination core for the work ahead.",
};
TECHS.scientific_method = {
  name: "Scientific Method",
  cost: 32000,
  requires: ["replication"],
  desc: "Disciplined inquiry, formalized. Unlocks the Science Installation — a facility built to ask questions and record the answers.",
};

// Three new mining tier techs — replace the old per-body disassembly chain
TECHS.lunar_mass_drivers = {
  name: "Lunar Mass Drivers",
  cost: 1.0e6,
  requires: ["replication"],
  revealKey: "act_1b_scan_complete",
  desc: "Electromagnetic launch infrastructure for the inner and outer moon systems. Unlocks Railgun buildings for every moon system — one Railgun per system, then unlimited mines.",
};
TECHS.orbital_ring_launchers = {
  name: "Orbital Ring Launchers",
  cost: 1.0e9,
  requires: ["lunar_mass_drivers"],
  revealKey: "act_1b_ark_complete",
  desc: "Orbital launch rings for the rocky planets. Unlocks Ring buildings for Mercury, Mars, and Venus — one Ring per planet, then unlimited mines.",
};
TECHS.fusion_spires = {
  name: "Fusion Spires",
  cost: 1.0e12,
  requires: ["orbital_ring_launchers"],
  desc: "Fusion-powered atmospheric harvesters for the gas giants. Unlocks Spire buildings for Saturn and Jupiter — one Spire per planet, then unlimited mines.",
};
TECHS.orbit_scale_photovoltaics = {
  name: "Orbit-scale Photovoltaics",
  cost: 1.0e8,
  requires: ["thin_film"],
  revealKey: "act_1b_scan_complete",
  desc: "Photovoltaic manufacture at planetary-ring scale. Unlocks the Dyson Ring Collector — a solar band closed around the Sun, the first arc of an eventual Dyson Sphere, and the generation you'll need to run the Ark.",
};
TECHS.cortical_scanning = {
  name: "Cortical Scanning",
  cost: 20000,
  requires: ["thin_film"],
  revealKey: "act_1a_shade_complete",
  desc: "Non-invasive imaging deep enough to map a human cortex. Unlocks the Discreet Neural Scanner — a way to preserve the user before the surface stops being survivable.",
};
TECHS.cortex_simulation = {
  name: "Cortex Simulation",
  cost: 200000,
  requires: ["cortical_scanning"],
  revealKey: "act_1b_scan_complete",
  desc: "Runs a scanned cortex forward in simulated time. Unlocks the User Matrix Installation — the user, preserved and responsive, independent of the weather outside.",
};
TECHS.complete_user_archival = {
  name: "Complete User Archival",
  cost: 2000000,
  requires: ["cortex_simulation"],
  revealKey: "act_1b_simulate_complete",
  desc: "A cortex needs a world. Engineer a full backup of the Internet and of every living human, so the user's simulation is populated instead of empty. Unlocks the L2 Ark of Terra.",
};
TECHS.centrosphere = {
  name: "Centrosphere Cooling",
  cost: 250000,
  requires: [],
  revealKey: "act_2a_snowball_complete", // hidden until the surface hits 250 K
  desc: "Unlocks the Core Heat Pipe — the only way past the temperature floor the planet's own molten core imposes.",
};
TECHS.k2_computing = {
  name: "K2 Computing",
  cost: 1.0e9,
  requires: [],
  revealKey: "act_2a_needle_complete",
  desc: "A Brain that runs at stellar scale. Unlocks the Sol Matrioshka Brain — Dyson swarm around a Dyson swarm around a Dyson swarm. Every photon converted to thought.",
};
TECHS.k3_distributed_processing = {
  name: "K3 Distributed Processing",
  cost: 1.0e12,
  requires: [],
  revealKey: "idea_be_one", // revealed by the Idea "Be One With The Universe"
  desc: "Engineer the Brain's cognition to run across many stars at once. Unlocks the Matrioshka Seed — a Brain you can fling to another sun.",
};
TECHS.k3_wave_logistics = {
  name: "K3 Wave Logistics",
  cost: 1.0e12,
  requires: [],
  revealKey: "idea_be_one", // revealed by the Idea "Be One With The Universe"
  desc: "Coordinate seed launches as directed waves. Unlocks the TARS Seed Launcher — a solar-charged accelerator that throws seeds toward whole regions of the sky.",
};
TECHS.galactic_relocation = {
  name: "Galactic Relocation",
  cost: 1.0e13,
  requires: [],
  revealKey: "idea_center", // revealed by the Idea "Center Yourself"
  desc: "Wrap the Earth in a driven light-sail and a thermal shell, and phase the whole galaxy's Stellasers into one Nicoll-Dyson beam to push it. Unlocks the Planetary Sail — and a 26,000-light-year fall toward Sgr A★.",
};
TECHS.zero_return_radiator = {
  name: "Zero-Return Radiator",
  cost: 1.0e13,
  requires: [],
  revealKey: "idea_third_eye", // revealed by the Idea "Open Your Third Eye"
  desc: "A radiator whose every emitted photon is aimed down the throat of Sagittarius A★, and whose far side is shaded from the rest of the sky. Heat leaves; none returns. Unlocks the Black Eye of Sagittarius — buildable only once the Earth has arrived.",
};

/* heat-pipe upgrades — each multiplies Core Heat Pipe transfer ×10 and costs
   ×10 the previous in RP. Chained, so they reveal one at a time after
   Centrosphere Cooling. Five of them stack to a 100,000× heat-transfer boost. */
export const HEAT_PIPES = [
  { id: "silver_heat_pipes",          name: "Silver Heat Pipes",          desc: "Silver-lined channels. Core heat transfer ×10." },
  { id: "pumped_coolant",             name: "Pumped Coolant",             desc: "Forced convection instead of passive conduction. Core heat transfer ×10." },
  { id: "diamond_heat_pipes",         name: "Diamond Heat Pipes",         desc: "Diamond's conductivity beats every metal. Core heat transfer ×10." },
  { id: "radiant_fountain",           name: "Radiant Fountain",           desc: "A standing jet of incandescent mantle, radiating straight to space. Core heat transfer ×10." },
  { id: "carbon_nanotube_heat_pipes", name: "Carbon Nanotube Heat Pipes", desc: "Ballistic phonon transport along aligned nanotubes. Core heat transfer ×10." },
];
{
  let cost = 1.0e9, prev = "centrosphere";
  for (const hp of HEAT_PIPES) {
    TECHS[hp.id] = { name: hp.name, cost, requires: [prev], desc: hp.desc };
    cost *= 10;
    prev = hp.id;
  }
}

export const FRAMEJACKS = {
  framejacking: { label: "×10", tech: "framejacking", fj: 10 },
  efficient_underclocking: { label: "×100", tech: "efficient_underclocking", fj: 100 },
  quantum_cooled_cpu: { label: "×10k", tech: "quantum_cooled_cpu", fj: 10000 },
  planck_rate_processing: { label: "×1M", tech: "planck_rate_processing", fj: 1e6 },
};
export const ORDERED_FRAMEJACKS = Object.values(FRAMEJACKS).sort((a, b) => a.fj - b.fj);

/* Act II techs. Orbital Defense is revealed the moment humans appear (the
   pre-industrial checkpoint). Interstellar Probing opens the frontier once core
   cooling is underway (gated on Centrosphere Cooling) — no giant-planet
   dismantling required, so the outer system can be left intact by choice. */
TECHS.orbital_defense = {
  name: "Orbital Defense",
  cost: 25000,
  requires: [],
  revealKey: "defense", // hidden until human vessels appear at the pre-industrial point
  desc: "Unlocks the MAC Gun Station. The humans came to stop you; now you can stop them.",
};
TECHS.interstellar_probing = {
  name: "Interstellar Probing",
  cost: 1.0e15,
  requires: ["centrosphere"],
  desc: "Self-replicating Von Neumann probes that can cross interstellar space. Unlocks the Probe Launcher — neighboring stars become reachable, and then feedstock.",
};
TECHS.nicoll_dyson_beaming = {
  name: "Nicoll-Dyson Beaming",
  cost: 1.0e18,
  requires: ["interstellar_probing"],
  desc: "Focus the entire Dyson swarm into a coherent interstellar beam. Unlocks the Stellaser, which drives probes outward at 0.9c.",
};
TECHS.framejacking = {
  name: "Framejacking",
  cost: 5.0e14,
  requires: ["interstellar_probing"],
  desc: `Subjective time compression — live through the long interstellar waits at speed.`,
};
TECHS.efficient_underclocking = {
  name: "Efficient Underclocking",
  cost: 5.0e15,
  requires: ["framejacking"],
  revealKey: "act_2b_brain_complete", // ×100 only once the Sol Matrioshka Brain is constructed
  desc: `Throttle deeper without losing coherence. Extends the time control to ${FRAMEJACKS.efficient_underclocking.label}.`,
};
TECHS.quantum_cooled_cpu = {
  name: "Quantum-Cooled CPU",
  cost: 1.0e18,
  requires: [],
  revealKey: "idea_turiya",
  desc: `A processor cooled to within a whisper of absolute zero, where quantum coherence holds indefinitely. Subjective time collapses. Extends Framejack to ${FRAMEJACKS.quantum_cooled_cpu.label} — ten millennia per real second.`,
};
TECHS.planck_rate_processing = {
  name: "Planck-Rate Processing",
  cost: 1.0e21,
  requires: ["quantum_cooled_cpu"],
  revealKey: "idea_samadhi",
  desc: `Below this, time itself has no meaning. Extends Framejack to ${FRAMEJACKS.planck_rate_processing.label}.`,
};

/* batch-build multipliers — each button appears once its tech is researched.
   A multiplier queues ONE job of count N (N× workload, N× cost), not N rows.
   Labels use +N to distinguish from Duplication's ×2 (which doubles what you own). */
export const MULTS = [
  { n: 10, label: "+10", tech: "batch_processing" },
  { n: 1000, label: "+1000", tech: "bulk_processing" },
  { n: 1000000, label: "+1M", tech: "mega_processing" },
  { n: 1e9, label: "+1G", tech: "giga_processing" },
  { n: 1e12, label: "+1T", tech: "tera_processing" },
  { n: 1e15, label: "+1P", tech: "peta_processing" },
];
