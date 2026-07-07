import { describe, it, expect } from "vitest";
import {
  TICK_MS, DT, CONFIG, CLIMATE, CORE, BODIES, BUILDINGS, MINE_TO_BODY, INFRA_TO_BODY,
  TECHS, HEAT_PIPES, MULTS, IDEAS,
  scanDotCount, SCAN_MAX_DOTS, SCAN_MAX_SCANNERS,
} from "./config.js";

describe("timing constants", () => {
  it("TICK_MS / DT", () => {
    expect(TICK_MS).toBe(200);
    expect(DT).toBeCloseTo(0.2, 9);
  });
});

describe("BODIES + derived mining economics", () => {
  it("belt is first and special-cased", () => {
    expect(BODIES[0].id).toBe("belt");
    expect(BODIES[0].mineCost).toBe(40);
    expect(BODIES[0].fullRate).toBeCloseTo(BODIES[0].mass / CONFIG.harvestDivisor, 9);
  });

  it("non-belt bodies: mine cost = mass × mineFrac, payback in minePaybackDays game-days", () => {
    const paybackS = CONFIG.minePaybackDays * 0.2; // 1 game-day = 1 tick = DT seconds
    for (let i = 1; i < BODIES.length; i++) {
      const b = BODIES[i];
      expect(b.mineCost).toBeCloseTo(b.mass * CONFIG.mineFrac, 6);
      expect(b.fullRate).toBeCloseTo(b.mineCost / paybackS, 6);
    }
  });

  it("the Sun is never in the disassembly chain", () => {
    expect(BODIES.find((b) => b.id === "sun")).toBeUndefined();
  });

  it("each non-belt body has a tier: moon, rocky, or giant", () => {
    for (const b of BODIES.slice(1)) {
      expect(["moon", "rocky", "giant"]).toContain(b.tier);
    }
  });
});

describe("BUILDINGS", () => {
  it("every body has a corresponding mine building with correct cost and mineBody", () => {
    for (const b of BODIES) {
      expect(BUILDINGS[b.mineId]).toBeDefined();
      expect(BUILDINGS[b.mineId].metalCost).toBeCloseTo(b.mineCost, 6);
      expect(BUILDINGS[b.mineId].mineBody).toBe(b.id);
    }
  });

  it("moon bodies have a Railgun (max:1) requiring lunar_mass_drivers", () => {
    for (const b of BODIES.filter((b) => b.tier === "moon")) {
      const rail = BUILDINGS[b.railgunId];
      expect(rail).toBeDefined();
      expect(rail.max).toBe(1);
      expect(rail.requires).toContain("lunar_mass_drivers");
      expect(rail.metalCost).toBeCloseTo(b.mass * CONFIG.railgunFrac, 6);
    }
  });

  it("rocky bodies have a Ring (max:1) requiring orbital_ring_launchers", () => {
    for (const b of BODIES.filter((b) => b.tier === "rocky")) {
      const ring = BUILDINGS[b.ringId];
      expect(ring).toBeDefined();
      expect(ring.max).toBe(1);
      expect(ring.requires).toContain("orbital_ring_launchers");
      expect(ring.metalCost).toBeCloseTo(b.mass * CONFIG.ringFrac, 6);
    }
  });

  it("giant bodies have a Spire (max:1) requiring fusion_spires", () => {
    for (const b of BODIES.filter((b) => b.tier === "giant")) {
      const spire = BUILDINGS[b.spireId];
      expect(spire).toBeDefined();
      expect(spire.max).toBe(1);
      expect(spire.requires).toContain("fusion_spires");
      expect(spire.metalCost).toBeCloseTo(b.mass * CONFIG.spireFrac, 6);
    }
  });

  it("mine buildings require their infrastructure building", () => {
    for (const b of BODIES.slice(1)) {
      const mine = BUILDINGS[b.mineId];
      const infraId = b.railgunId || b.ringId || b.spireId;
      expect(mine.requires).toContain(infraId);
    }
  });

  it("MINE_TO_BODY maps mine ids back to their body", () => {
    for (const b of BODIES) expect(MINE_TO_BODY[b.mineId]).toBe(b);
  });

  it("INFRA_TO_BODY maps infra ids back to their body", () => {
    for (const b of BODIES.slice(1)) {
      const infraId = b.railgunId || b.ringId || b.spireId;
      expect(INFRA_TO_BODY[infraId]).toBe(b);
    }
  });

  it("fixed structures exist with expected caps", () => {
    for (const id of ["replica", "shade_panel", "core_heat_pipes", "mac_gun_station", "probe_launcher", "stellaser"]) {
      expect(BUILDINGS[id]).toBeDefined();
    }
    expect(BUILDINGS.shade_panel.max).toBe(1);
    expect(BUILDINGS.shade_panel.sunBlot).toBe(0.001);
    expect(BUILDINGS.probe_launcher.max).toBe(1);
  });
});

describe("TECHS", () => {
  it("includes base techs and the three new mining tier techs", () => {
    expect(TECHS.replication).toBeDefined();
    expect(TECHS.lunar_mass_drivers).toBeDefined();
    expect(TECHS.orbital_ring_launchers).toBeDefined();
    expect(TECHS.fusion_spires).toBeDefined();
    // chain: lunar → orbital → fusion
    expect(TECHS.orbital_ring_launchers.requires).toContain("lunar_mass_drivers");
    expect(TECHS.fusion_spires.requires).toContain("orbital_ring_launchers");
  });

  it("no old per-body disassembly techs remain", () => {
    const oldTechs = ["lunar_disassembly", "mercury_disassembly", "jovsat_disassembly",
                      "venus_disassembly", "mars_disassembly", "jovian_disassembly"];
    for (const id of oldTechs) expect(TECHS[id]).toBeUndefined();
  });

  it("heat-pipe upgrades chain off centrosphere, each ×10 cost", () => {
    let prev = "centrosphere";
    let cost = 1.0e9;
    for (const hp of HEAT_PIPES) {
      const t = TECHS[hp.id];
      expect(t).toBeDefined();
      expect(t.requires).toContain(prev);
      expect(t.cost).toBeCloseTo(cost, 3);
      cost *= 10;
      prev = hp.id;
    }
  });
});

describe("MULTS + climate/core constants", () => {
  it("batch multipliers gate on processing techs", () => {
    expect(MULTS.length).toBe(6);
    for (const m of MULTS) expect(TECHS[m.tech]).toBeDefined();
  });
  it("climate + core sane", () => {
    expect(CLIMATE.tStart).toBeGreaterThan(CLIMATE.tPreindustrial);
    expect(CORE.heat0).toBeCloseTo(CORE.heatCapacity * CORE.t0, 3);
  });
});

describe("Act III — Brain, Ideas, K3 techs", () => {
  it("the Sol Matrioshka Brain is a ~4 solar-mass, Spire-gated, Insight-producing build", () => {
    const b = BUILDINGS.sol_matrioshka_brain;
    expect(b).toBeDefined();
    expect(b.requires).toContain("jupiter_spire"); // gated behind the last in-system body
    expect(b.max).toBe(1);
    expect(b.insightPerDay).toBe(CONFIG.insightPerBrainPerDay);
    // cost is in the 4-solar-mass ballpark
    expect(b.metalCost / CONFIG.solarMassT).toBeGreaterThan(3.5);
    expect(b.metalCost / CONFIG.solarMassT).toBeLessThan(5);
  });

  it("the first Idea unlocks exactly the two K3 techs, which gate on its reveal flag", () => {
    const idea = IDEAS.be_one_with_the_universe;
    expect(idea).toBeDefined();
    expect(idea.cost).toBeGreaterThan(0);
    expect(idea.unlocks).toEqual(["k3_distributed_processing", "k3_wave_logistics"]);
    for (const t of idea.unlocks) {
      expect(TECHS[t]).toBeDefined();
      expect(TECHS[t].revealKey).toBe(idea.revealKey);
    }
  });

  it("the K3 techs unlock the galaxy buildings", () => {
    const seed = BUILDINGS.matrioshka_seed;
    expect(seed).toBeDefined();
    expect(seed.metalCost).toBe(140);
    expect(seed.requires).toContain("k3_distributed_processing");

    const tars = BUILDINGS.tars_seed_launcher;
    expect(tars).toBeDefined();
    expect(tars.max).toBe(1);
    expect(tars.requires).toContain("k3_wave_logistics");
  });

  it("galaxy tuning constants are present", () => {
    expect(CONFIG.galaxyProbeSpeedC).toBeGreaterThan(0);
    expect(CONFIG.galaxyProbeSpeedC).toBeLessThanOrEqual(1);
    expect(CONFIG.galaxyChargePerDay).toBeGreaterThan(0);
  });
});

describe("the finale chains (Act III win-track)", () => {
  it("the two win-track Ideas chain off Be One and reveal their techs", () => {
    const cy = IDEAS.center_yourself;
    expect(cy).toBeDefined();
    expect(cy.requires).toContain("be_one_with_the_universe");
    expect(cy.unlocks).toContain("galactic_relocation");
    expect(cy.revealKey).toBe("idea_center");

    const t3 = IDEAS.open_your_third_eye;
    expect(t3).toBeDefined();
    expect(t3.requires).toContain("center_yourself");
    expect(t3.unlocks).toContain("zero_return_radiator");
    expect(t3.cost).toBeGreaterThan(cy.cost); // the third eye costs more galaxy
  });

  it("the techs are revealed by their Ideas and unlock the finale buildings", () => {
    expect(TECHS.galactic_relocation.revealKey).toBe("idea_center");
    expect(TECHS.zero_return_radiator.revealKey).toBe("idea_third_eye");
    expect(BUILDINGS.planetary_sail.requires).toContain("galactic_relocation");
    expect(BUILDINGS.planetary_sail.max).toBe(1);
    const eye = BUILDINGS.black_eye_of_sagittarius;
    expect(eye.requires).toContain("zero_return_radiator");
    expect(eye.revealKey).toBe("relocated"); // gated on arrival at Sgr A★
    expect(eye.max).toBe(1);
  });

  it("the Hawking floor and relocation constants are present and sane", () => {
    expect(CLIMATE.hawking).toBeGreaterThan(0);
    expect(CLIMATE.hawking).toBeLessThan(CLIMATE.cmbr); // a far colder floor than the CMB
    expect(CONFIG.relocateSpeedC).toBeGreaterThan(0);
    expect(CONFIG.relocateSpeedC).toBeLessThanOrEqual(1);
    expect(CONFIG.relocateDistanceLy).toBeGreaterThan(0);
  });
});

describe("scanDotCount (EarthScanner seam density)", () => {
  it("returns 0 at zero scanners and 1 at a single scanner", () => {
    expect(scanDotCount(0)).toBe(0);       // no fleet → no dots (globe shows 1 lane anyway)
    expect(scanDotCount(1)).toBe(1);
  });

  it("caps at SCAN_MAX_DOTS from SCAN_MAX_SCANNERS upward", () => {
    expect(scanDotCount(SCAN_MAX_SCANNERS)).toBe(SCAN_MAX_DOTS);
    expect(scanDotCount(SCAN_MAX_SCANNERS + 1)).toBe(SCAN_MAX_DOTS);
    expect(scanDotCount(SCAN_MAX_SCANNERS * 100)).toBe(SCAN_MAX_DOTS);
  });

  it("never exceeds the cap and never goes negative", () => {
    for (const s of [0, 1, 50, 3333, 12345, 49999, 50000, 999999]) {
      const d = scanDotCount(s);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(SCAN_MAX_DOTS);
    }
  });

  it("is monotonic non-decreasing in scanner count", () => {
    let prev = -1;
    for (const s of [0, 1, 10, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000]) {
      const d = scanDotCount(s);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it("is front-loaded (concave): the first 10% of the fleet lights up over half the dots", () => {
    // softLog rewards early scanners — 10% of the max fleet should already
    // exceed half of SCAN_MAX_DOTS, which a linear or convex curve would not.
    expect(scanDotCount(SCAN_MAX_SCANNERS * 0.1)).toBeGreaterThan(SCAN_MAX_DOTS / 2);
  });
});
