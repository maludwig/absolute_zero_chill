import { describe, it, expect } from "vitest";
import { frontLy, bandFrac, seededFrac, heardFrac, returnWindowDays } from "./waves.js";
import { BIN_LY } from "./lut.js";
import { DAYS_PER_YEAR } from "../shared/model.js";

describe("frontLy", () => {
  it("is 0 at or before launch and scales with speed×time (c = 1 ly/yr)", () => {
    expect(frontLy(0.1, 0)).toBe(0);
    expect(frontLy(0.1, -10)).toBe(0);
    expect(frontLy(0.1, DAYS_PER_YEAR)).toBeCloseTo(0.1, 9); // one year at 0.1c → 0.1 ly
    expect(frontLy(0.9, DAYS_PER_YEAR)).toBeCloseTo(0.9, 9);
  });
  it("works at speedC=1 (full c): one year → 1 ly", () => {
    expect(frontLy(1, DAYS_PER_YEAR)).toBeCloseTo(1, 9);
  });
});

describe("bandFrac", () => {
  it("ramps 0→1 across a ring's radial band, clamped", () => {
    expect(bandFrac(0, 0)).toBe(0);
    expect(bandFrac(BIN_LY / 2, 0)).toBeCloseTo(0.5, 9);
    expect(bandFrac(BIN_LY, 0)).toBe(1);
    expect(bandFrac(BIN_LY * 5, 0)).toBe(1); // clamp high
    // ring 2 spans [20000, 30000]; a front at 25000 is halfway
    expect(bandFrac(2.5 * BIN_LY, 2)).toBeCloseTo(0.5, 9);
    expect(bandFrac(BIN_LY, 2)).toBe(0); // hasn't reached ring 2 yet
  });
  it("is exactly 0 at the near edge and exactly 1 at the far edge without drift", () => {
    expect(bandFrac(0 * BIN_LY, 0)).toBe(0);       // front exactly at near edge of ring 0
    expect(bandFrac(1 * BIN_LY, 0)).toBe(1);       // front exactly at far edge of ring 0
    expect(bandFrac(2 * BIN_LY, 2)).toBe(0);       // front exactly at near edge of ring 2
    expect(bandFrac(3 * BIN_LY, 2)).toBe(1);       // front exactly at far edge of ring 2
  });
});

describe("seeded vs heard fraction", () => {
  it("heard front is frontLy/(1+speedC), not frontLy/2", () => {
    // days for the outbound front to exactly cross ring 0 at 0.1c
    const days = (BIN_LY / 0.1) * DAYS_PER_YEAR;
    expect(seededFrac(0.1, days, 0)).toBeCloseTo(1, 9);          // fully seeded
    expect(heardFrac(0.1, days, 0)).toBeCloseTo(1 / 1.1, 9);     // signal home much faster than the crawl out
    // at v→c the two coincide with the old /2 approximation
    expect(heardFrac(0.999, (BIN_LY / 0.999) * DAYS_PER_YEAR, 0)).toBeCloseTo(1 / 1.999, 6);
  });

  it("ramps from 0 to 1 exactly across the return window", () => {
    const speedC = 0.1, b = 1;
    const [tFirst, tLast] = returnWindowDays(speedC, b);
    expect(heardFrac(speedC, tFirst, b)).toBeCloseTo(0, 9); // first signals just arriving
    expect(heardFrac(speedC, tLast, b)).toBeCloseTo(1, 9);  // last signals arrived
    expect(heardFrac(speedC, (tFirst + tLast) / 2, b)).toBeCloseTo(0.5, 9); // linear midpoint
  });

  it("heard never exceeds seeded", () => {
    for (const t of [1e6, 5e7, 2e8, 1e9]) {
      for (let b = 0; b < 4; b++) {
        expect(heardFrac(0.1, t, b)).toBeLessThanOrEqual(seededFrac(0.1, t, b) + 1e-12);
      }
    }
  });
  it("returnWindowDays at b=0: window starts when the first signals return", () => {
    const speedC = 0.1;
    const [tFirst, tLast] = returnWindowDays(speedC, 0);
    // near edge is 0 ly, so tFirst should be 0
    expect(tFirst).toBe(0);
    // far edge of ring 0 is BIN_LY: round-trip time = BIN_LY/v + BIN_LY/c (in years) → days
    const expected = (BIN_LY / speedC + BIN_LY) * DAYS_PER_YEAR;
    expect(tLast).toBeCloseTo(expected, 3);
  });
});
