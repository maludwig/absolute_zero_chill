import { describe, it, expect } from "vitest";
import {
  EXPLORE_SYSTEMS, EXPLORE_DERIVED, EXPLORE_SYS_BY_NAME, CATEGORY_ORDER,
  systemReserve, PROBE_COST, EXPLORE_DAYS_PER_SEC,
  // re-exported from shared/model.js:
  harvestModel, harvesterStartCost, K_RESERVE,
} from "./explore.js";

describe("frontier data", () => {
  it("has 8 systems, indexed by name", () => {
    expect(EXPLORE_SYSTEMS.length).toBe(8);
    for (const s of EXPLORE_SYSTEMS) expect(EXPLORE_SYS_BY_NAME[s.name]).toBe(s);
  });

  it("constants", () => {
    expect(PROBE_COST).toBe(140);
    expect(EXPLORE_DAYS_PER_SEC).toBe(5);
  });
});

describe("EXPLORE_DERIVED", () => {
  it("present = categories with positive mass, in CATEGORY_ORDER", () => {
    const sirius = EXPLORE_DERIVED["Sirius"];
    // Sirius has moon:0 and planet:0 → excluded
    expect(sirius.present).toEqual(["asteroid", "dust", "star"]);
  });

  it("masses are consistent with the system harvestables", () => {
    for (const sys of EXPLORE_SYSTEMS) {
      const d = EXPLORE_DERIVED[sys.name];
      const expectedTotal = d.present.reduce((s, c) => s + sys.harvestables[c], 0);
      expect(d.totalMass).toBeCloseTo(expectedTotal, 3);
      expect(d.asteroidMass).toBe(sys.harvestables.asteroid);
      const expectedNonStar = d.present.filter((c) => c !== "star").reduce((s, c) => s + sys.harvestables[c], 0);
      expect(d.nonStarMass).toBeCloseTo(expectedNonStar, 3);
      // a model per present category
      for (const c of d.present) expect(d.models[c]).toBeDefined();
    }
  });
});

describe("systemReserve (game variant)", () => {
  it("does NOT charge the start cost for a recycled ('done') harvester", () => {
    const present = ["asteroid", "moon"];
    const asteroidMass = 1000;
    const models = { asteroid: harvestModel(4000), moon: harvestModel(4e6) };
    const cats = {
      asteroid: { phase: "harvested", t: 0, tau: 0 },
      moon: { phase: "done", t: 0, tau: 0 },
    };

    // expected, computed from the same primitives:
    //   asteroid (harvested): mTotal - mineMass, minus its start cost (0, asteroids are free)
    //   moon (done): full mTotal, and the start cost is NOT deducted
    const expected =
      (models.asteroid.mTotal - models.asteroid.mineMass) - harvesterStartCost("asteroid", asteroidMass) +
      models.moon.mTotal;

    const actual = systemReserve(present, cats, models, asteroidMass);
    expect(actual).toBeCloseTo(expected, 3);

    // and prove the exclusion bites: if 'done' were charged like a started phase,
    // the result would be lower by exactly the moon's start cost.
    const moonCost = harvesterStartCost("moon", asteroidMass);
    expect(moonCost).toBeGreaterThan(0);
    expect(actual).toBeCloseTo(expected, 3);
    expect(actual).not.toBeCloseTo(expected - moonCost, 3);
  });
});

describe("re-exports from shared/model.js", () => {
  it("model helpers are importable via explore.js", () => {
    expect(typeof harvestModel).toBe("function");
    expect(typeof harvesterStartCost).toBe("function");
    expect(K_RESERVE).toBe(16);
    expect(CATEGORY_ORDER).toEqual(["asteroid", "dust", "moon", "planet", "star"]);
  });
});
