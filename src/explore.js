/* explore — Act III static data + the game's exploration model. The pure helper
   functions live in shared/model.js; this module re-exports them so game code
   can keep importing everything exploration-related from one place, and adds the
   game-specific data tables plus the systemReserve calculation. */

import { harvestModel, categoryReserve, harvesterStartCost, DAYS_PER_YEAR } from './shared/model.js';

// re-export the shared helpers so `import { ... } from './explore.js'` keeps working
export * from './shared/model.js';

export const EXPLORE_DAYS_PER_SEC = 5; // exploration days per real second (×1 framejack); at dt=0.2 → 1 day/tick
export const PROBE_COST = 140;          // home metal (T) to launch one probe — a mine plus a replica
export const STREAM_SPEED_C = 0.9;      // mass-driver beam speed, dest → Sol

/* Interstellar transit times, in game-days. `travelDays` is the outbound probe leg
   (speed varies: 0.3c, or 0.9c with a powered Stellaser); `streamDays` is the
   inbound mass-driver beam, always STREAM_SPEED_C. Both take the system def from
   EXPLORE_SYSTEMS / EXPLORE_SYS_BY_NAME. */
export const travelDays = (def, speed) => (def.distance / speed) * DAYS_PER_YEAR;
export const streamDays = (def) => (def.distance / STREAM_SPEED_C) * DAYS_PER_YEAR;

/* total Metal reserve a system has produced, GAME variant: the 40% start cost is
   a deposit held only while the fleet is deployed — once recycled ("done") the
   deposit is refunded, so stop subtracting it. */
export function systemReserve(present, cats, models, asteroidMass) {
  let r = 0;
  present.forEach((c) => {
    const s = cats[c];
    r += categoryReserve(s.phase, s.t, s.tau, models[c]);
    if (s.phase !== "idle" && s.phase !== "done") r -= harvesterStartCost(c, asteroidMass);
  });
  return r;
}

/* ---- the frontier: real systems within ~10 ly (Sol excluded) ---- */
export const SOL_STAR = { radius: 1.0, type: "G" };
export const EXPLORE_SYSTEMS = [
  { name: "Alpha Centauri", distance: 4.37,
    stars: [{ radius: 1.22, type: "G" }, { radius: 0.86, type: "K" }, { radius: 0.15, type: "M" }],
    harvestables: { dust: 5.9722e19, asteroid: 2.9861e19, moon: 1e19, planet: 5.9722e22, star: 4.2360815e27 } },
  { name: "Barnard's Star", distance: 5.96,
    stars: [{ radius: 0.19, type: "M" }],
    harvestables: { dust: 5.9722e16, asteroid: 5.9722e18, moon: 5e17, planet: 8.9583e21, star: 2.7830452e26 } },
  { name: "Luhman 16", distance: 6.50,
    stars: [{ radius: 0.10, type: "L" }, { radius: 0.10, type: "T" }],
    harvestables: { dust: 2.9861e21, asteroid: 2.9861e20, moon: 1.164579e22, planet: 2.9861e20, star: 1.1932456e26 } },
  { name: "WISE 0855−0714", distance: 7.43,
    stars: [{ radius: 0.08, type: "Y" }],
    harvestables: { dust: 5.9722e18, asteroid: 5.9722e18, moon: 5.912478e20, planet: 0.0, star: 9.943713e24 } },
  { name: "Wolf 359", distance: 7.86,
    stars: [{ radius: 0.16, type: "M" }],
    harvestables: { dust: 5.9722e16, asteroid: 1.19444e19, moon: 2e19, planet: 8.9583e22, star: 1.7898683e26 } },
  { name: "Lalande 21185", distance: 8.31,
    stars: [{ radius: 0.39, type: "M" }],
    harvestables: { dust: 2.9861e20, asteroid: 2.9861e21, moon: 5e20, planet: 1.79166e23, star: 7.7560961e26 } },
  { name: "Sirius", distance: 8.60,
    stars: [{ radius: 1.71, type: "A" }, { radius: 0.008, type: "D" }],
    harvestables: { dust: 2.9861e22, asteroid: 2.9861e21, moon: 0.0, planet: 0.0, star: 6.1244911e27 } },
  { name: "Luyten 726-8", distance: 8.79,
    stars: [{ radius: 0.14, type: "M" }, { radius: 0.14, type: "M" }],
    harvestables: { dust: 5.9722e16, asteroid: 5.9722e18, moon: 1e17, planet: 2.9861e21, star: 3.9774852e26 } },
];

export const CATEGORY_ORDER = ["asteroid", "dust", "moon", "planet", "star"];
export const CATEGORY_META = {
  asteroid: { label: "Asteroid Mining Fleet" },
  dust:     { label: "Dust Collector" },
  moon:     { label: "Lunar Disassembler" },
  planet:   { label: "Planetary Disassembler" },
  star:     { label: "Starlifter Array" },
};

/* per-system derived constants, computed once (present categories, harvest
   models, asteroid/non-star/total masses). Keyed by system name. */
export const EXPLORE_SYS_BY_NAME = {};
export const EXPLORE_DERIVED = {};
for (const sys of EXPLORE_SYSTEMS) {
  EXPLORE_SYS_BY_NAME[sys.name] = sys;
  const present = CATEGORY_ORDER.filter((c) => sys.harvestables[c] > 0);
  const models = {};
  present.forEach((c) => { models[c] = harvestModel(sys.harvestables[c]); });
  const asteroidMass = sys.harvestables.asteroid;
  const nonStarMass = present.filter((c) => c !== "star").reduce((s, c) => s + sys.harvestables[c], 0);
  const totalMass = present.reduce((s, c) => s + sys.harvestables[c], 0);
  EXPLORE_DERIVED[sys.name] = { present, models, asteroidMass, nonStarMass, totalMass };
}
