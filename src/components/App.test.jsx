import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { App, simTicksFor } from "./App.jsx";
import { CONFIG, DT } from "../config.js";
import { FRAMEJACKS } from "../config.js";

describe("App", () => {
  it("composes the whole screen (SSR: no game loop side effects)", () => {
    const html = renderToString(<App />);
    for (const s of ["ABSOLUTE", "Construction", "Research", "Telemetry", "build", "Save", "Load"]) {
      expect(html).toContain(s);
    }
  });
});

describe("simTicksFor — the catch-up cap must not throttle Framejack", () => {
  const maxTicks = Math.floor(CONFIG.maxCatchupSeconds / DT); // 18,000

  it("a steady 200ms heartbeat runs exactly framejack ticks, at every tier", () => {
    // The regression: clamping baseTicks*framejack capped every tier at maxTicks,
    // so ×100M (1e8) collapsed to 18,000 — a mere 1.8× over ×10k.
    for (const { fj } of Object.values(FRAMEJACKS)) {
      expect(simTicksFor(1, fj, maxTicks)).toBe(fj);
    }
    expect(simTicksFor(1, 1e8, maxTicks)).toBe(1e8);
    expect(simTicksFor(1, 1, maxTicks)).toBe(1);
  });

  it("each tier is faster than the one below it by exactly its advertised ratio", () => {
    // Monotonicity alone is too weak to catch the old bug: under the clamp ×10k gave
    // 10,000 and ×100M gave 18,000, which is still increasing — just 1.8× instead of
    // 10,000×. Assert the ratio the label promises.
    const tiers = Object.values(FRAMEJACKS).map(({ fj }) => fj).sort((a, b) => a - b);
    for (let i = 1; i < tiers.length; i++) {
      const ratio = simTicksFor(1, tiers[i], maxTicks) / simTicksFor(1, tiers[i - 1], maxTicks);
      expect(ratio).toBeCloseTo(tiers[i] / tiers[i - 1], 6);
    }
  });

  it("scales with real time owed: a late heartbeat is not silently dropped", () => {
    // A skipped 200ms interval owes 2 DT-ticks. Previously ×10k asked for 20,000,
    // got 18,000, and the 2,000 overflow was destroyed (carry is already decremented).
    expect(simTicksFor(2, 10000, maxTicks)).toBe(20000);
    // Backgrounded tab: setInterval throttles to ~1s, so 5 DT-ticks are owed.
    expect(simTicksFor(5, 10000, maxTicks)).toBe(50000);
  });

  it("still caps a long real absence, which is what maxCatchupSeconds is for", () => {
    const away = 24 * 3600 / DT;                 // a day away, in DT-ticks
    expect(simTicksFor(away, 1, maxTicks)).toBe(maxTicks);
    // ...and the cap bounds the *absence*, so framejack still multiplies it.
    expect(simTicksFor(away, 10, maxTicks)).toBe(maxTicks * 10);
  });

  it("treats a missing/zero framejack as ×1", () => {
    expect(simTicksFor(3, 0, maxTicks)).toBe(3);
    expect(simTicksFor(3, undefined, maxTicks)).toBe(3);
  });
});
