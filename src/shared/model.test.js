import { describe, it, expect } from "vitest";
import {
  spectralColor, starPx, lerpColor, probeColor, lyPerRealSec,
  M0, T_CYCLE, harvestModel, consumedAt, buildFrac, harvestRemainingFrac,
  fleetRemainingFrac, recycleDone, mineCountAt, softExp, buildVisualFrac,
  recycleVisualFrac, softLog, arrivalLoopSpeed, consumedCategory,
  categoryReserve, harvesterStartCost,
} from "./model.js";

describe("star render helpers", () => {
  it("spectralColor keys on the leading letter, case-insensitively", () => {
    expect(spectralColor("G")).toBe("#ffe08a");
    expect(spectralColor("g")).toBe("#ffe08a");
    expect(spectralColor("M")).toBe("#ff7e5c");
    expect(spectralColor("X")).toBe("#ffe08a"); // unknown → default
    expect(spectralColor()).toBe("#ffe08a");    // undefined → default G
  });

  it("starPx clamps into [2.5, 11] and is monotonic", () => {
    expect(starPx(0)).toBeCloseTo(2.5, 6);
    expect(starPx(1.71)).toBeCloseTo(11, 6);
    expect(starPx(100)).toBeCloseTo(11, 6); // clamped at the top
    expect(starPx(0.5)).toBeGreaterThan(starPx(0.1));
  });

  it("lerpColor interpolates and clamps t", () => {
    expect(lerpColor("#000000", "#ffffff", 0)).toBe("rgb(0,0,0)");
    expect(lerpColor("#000000", "#ffffff", 1)).toBe("rgb(255,255,255)");
    expect(lerpColor("#000000", "#ffffff", 0.5)).toBe("rgb(128,128,128)");
    expect(lerpColor("#000000", "#ffffff", 5)).toBe("rgb(255,255,255)"); // clamp
  });

  it("probeColor maps 0.1c→white, 0.9c→blue", () => {
    expect(probeColor(0.1)).toBe("rgb(223,243,255)"); // #dff3ff
    expect(probeColor(0.9)).toBe("rgb(63,214,255)");  // #3fd6ff
  });

  it("lyPerRealSec scales with speed and framejack", () => {
    expect(lyPerRealSec(0.9, 1)).toBeCloseTo(0.9 * (5 / 365), 9);
    expect(lyPerRealSec(0.9, 10)).toBeCloseTo(9 * (5 / 365), 9);
  });
});

describe("harvest model", () => {
  it("harvestModel derives a consistent build/harvest schedule", () => {
    const m = harvestModel(4000); // mineMass = 40 = M0 → tBuild 0
    expect(m.mineMass).toBe(40);
    expect(m.tBuild).toBeCloseTo(0, 9);
    expect(m.rate).toBe(40 / T_CYCLE);
    expect(m.tHarvestDone).toBeCloseTo((4000 - 40) / m.rate, 6);
  });

  it("consumedAt: M0 at/below 0, then exponential then linear", () => {
    const m = harvestModel(4e6); // tBuild > 0
    expect(consumedAt(0, m)).toBe(M0);
    expect(consumedAt(-5, m)).toBe(M0);
    // at the build/harvest boundary, consumed ≈ mineMass
    expect(consumedAt(m.tBuild, m)).toBeCloseTo(m.mineMass, 3);
    // well past tBuild → linear grind
    expect(consumedAt(m.tBuild + 10, m)).toBeCloseTo(m.mineMass + 10 * m.rate, 6);
  });

  it("fraction helpers stay in range", () => {
    const m = harvestModel(4000);
    expect(buildFrac(0, m)).toBeCloseTo(1, 6); // tBuild 0 → already built
    expect(harvestRemainingFrac(0, m)).toBeLessThanOrEqual(1);
    expect(harvestRemainingFrac(1e9, m)).toBe(0);
    expect(fleetRemainingFrac(0)).toBe(1);
    expect(fleetRemainingFrac(T_CYCLE)).toBeCloseTo(0.5, 9);
  });

  it("recycleDone once the fleet halves below one mine", () => {
    const m = harvestModel(4000); // mineMass 40 = M0
    expect(recycleDone(0, m)).toBe(false);    // 40 < 40 false
    expect(recycleDone(T_CYCLE, m)).toBe(true); // 20 < 40 true
  });

  it("mineCountAt grows by doubling then plateaus", () => {
    const m = harvestModel(4e6);
    expect(mineCountAt(0, m)).toBeCloseTo(1, 6);
    expect(mineCountAt(T_CYCLE, m)).toBeCloseTo(2, 6);
    expect(mineCountAt(m.tBuild + 999, m)).toBeCloseTo(m.mineMass / M0, 6);
  });
});

describe("curve helpers", () => {
  it("softExp pins endpoints and is linear as k→0", () => {
    expect(softExp(0, 8)).toBe(0);
    expect(softExp(1, 8)).toBe(1);
    expect(softExp(0.5, 0)).toBeCloseTo(0.5, 9);
    expect(softExp(2, 8)).toBe(1); // clamps p
  });
  it("softLog pins endpoints", () => {
    expect(softLog(0, 16)).toBe(0);
    expect(softLog(1, 16)).toBe(1);
  });
  it("arrivalLoopSpeed: 1/3 at ×10, 3 at ×1e6", () => {
    expect(arrivalLoopSpeed(10)).toBeCloseTo(1 / 3, 9);
    expect(arrivalLoopSpeed(1e6)).toBeCloseTo(3, 9);
  });
  it("buildVisualFrac / recycleVisualFrac stay 0..1", () => {
    const m = harvestModel(4e6);
    expect(buildVisualFrac(m.tBuild, m, 8)).toBe(1);
    expect(recycleVisualFrac(0, m, 8)).toBeGreaterThan(0);
  });
  it("buildVisualFrac is 0 at t=0 for a model with non-zero tBuild", () => {
    const m = harvestModel(4e6); // tBuild ~80 days
    expect(buildVisualFrac(0, m, 8)).toBe(0);
  });
});

describe("in-system economy", () => {
  it("consumedCategory by phase", () => {
    const m = harvestModel(4000);
    expect(consumedCategory("idle", 0, m)).toBe(0);
    expect(consumedCategory("harvested", 0, m)).toBe(m.mTotal);
  });
  it("categoryReserve by phase", () => {
    const m = harvestModel(4000);
    expect(categoryReserve("idle", 0, 0, m)).toBe(0);
    expect(categoryReserve("building", 5, 0, m)).toBe(0);
    expect(categoryReserve("harvested", 0, 0, m)).toBe(m.mTotal - m.mineMass);
    expect(categoryReserve("done", 0, 0, m)).toBe(m.mTotal);
  });
  it("harvesterStartCost: asteroid free, others 40% of belt", () => {
    expect(harvesterStartCost("asteroid", 1000)).toBe(0);
    expect(harvesterStartCost("dust", 1000)).toBeCloseTo(400, 9);
  });
  it("consumedCategory for recycling phase returns mTotal", () => {
    const m = harvestModel(4000);
    expect(consumedCategory("recycling", 0, m)).toBe(m.mTotal);
  });
  it("categoryReserve for recycling phase accounts for fleet still remaining", () => {
    const m = harvestModel(4000);
    // at tau=0 the full fleet is still present: reserve = mTotal - mineMass * 1
    expect(categoryReserve("recycling", 0, 0, m)).toBeCloseTo(m.mTotal - m.mineMass, 6);
    // at tau=T_CYCLE the fleet has halved: reserve = mTotal - mineMass * 0.5
    expect(categoryReserve("recycling", 0, T_CYCLE, m)).toBeCloseTo(m.mTotal - m.mineMass * 0.5, 6);
  });
  it("harvestRemainingFrac is close to 1 at the start of the build phase", () => {
    const m = harvestModel(4e6);
    // only M0 (40 T) consumed at t=0 out of 4e6 T
    expect(harvestRemainingFrac(0, m)).toBeGreaterThan(0.999);
  });
});
