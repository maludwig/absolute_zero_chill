import { describe, it, expect } from "vitest";
import {
  LUT, SLICE_COUNT, WEDGE_COUNT, PIE_RADIUS_LY, BIN_LY,
  wedgeStars, wedgeBand, MAX_WEDGE_STARS, TOTAL_STARS,
} from "./lut.js";

describe("galaxy LUT", () => {
  it("is a 12×8 table of positive star counts", () => {
    expect(SLICE_COUNT).toBe(12);
    expect(WEDGE_COUNT).toBe(8);
    expect(LUT.length).toBe(12);
    for (const row of LUT) {
      expect(row.length).toBe(8);
      for (const v of row) expect(v).toBeGreaterThan(0);
    }
  });

  it("rings are 10,000 ly wide across an 80k-ly frontier", () => {
    expect(PIE_RADIUS_LY).toBe(80000);
    expect(BIN_LY).toBe(10000);
    expect(wedgeBand(0)).toEqual([0, 10000]);
    expect(wedgeBand(2)).toEqual([20000, 30000]);
  });

  it("wedgeStars reads cells and is 0 out of range", () => {
    expect(wedgeStars(0, 2)).toBe(LUT[0][2]);
    expect(wedgeStars(99, 0)).toBe(0);
    expect(wedgeStars(0, 99)).toBe(0);
  });

  it("the densest wedge faces Sgr A★ (slice 0)", () => {
    expect(MAX_WEDGE_STARS).toBe(LUT[0][2]);
    // every other cell is no greater
    for (const row of LUT) for (const v of row) expect(v).toBeLessThanOrEqual(MAX_WEDGE_STARS);
  });

  it("totals a galaxy's worth of stars (~3e11)", () => {
    const manual = LUT.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
    expect(TOTAL_STARS).toBeCloseTo(manual, 0);
    expect(TOTAL_STARS).toBeGreaterThan(1e11);
    expect(TOTAL_STARS).toBeLessThan(1e12);
  });

  it("wedgeBand covers the full frontier at the last ring", () => {
    expect(wedgeBand(WEDGE_COUNT - 1)[1]).toBe(PIE_RADIUS_LY);
  });

  it("adjacent rings are contiguous with no gaps", () => {
    for (let b = 0; b < WEDGE_COUNT - 1; b++) {
      expect(wedgeBand(b)[1]).toBe(wedgeBand(b + 1)[0]);
    }
  });
});
