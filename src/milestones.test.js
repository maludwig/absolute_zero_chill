import { describe, it, expect } from "vitest";
import { isReady, notifyKeys } from "./milestones.js";

// minimal fake store — isReady only reads these five slices
const store = () => ({
  owned: { discreet_neural_scanner: 1, replica: 0 },
  research: { done: { cortical_scanning: true } },
  philosophy: { done: { be_one: true } },
  completedQuests: ["act_1b_ark"],
  flags: { core: true },
});

describe("notifyKeys", () => {
  it("suffixes each typed bucket and leaves flags raw", () => {
    expect(notifyKeys({ built: ["discreet_neural_scanner"] })).toEqual(["discreet_neural_scanner_built"]);
    expect(notifyKeys({
      built: ["a"], researched: ["b"], realized: ["c"], completed: ["d"], flags: ["e"],
    })).toEqual(["a_built", "b_researched", "c_realized", "d_completed", "e"]);
  });
  it("returns [] for an empty or absent predicate", () => {
    expect(notifyKeys(undefined)).toEqual([]);
    expect(notifyKeys({})).toEqual([]);
  });
  it("dedupes repeated keys", () => {
    expect(notifyKeys({ researched: ["x", "x"], flags: ["x_researched"] }))
      .toEqual(["x_researched"]);
  });
});

describe("isReady", () => {
  it("an empty or absent predicate is trivially ready", () => {
    expect(isReady(store(), undefined)).toBe(true);
    expect(isReady(store(), {})).toBe(true);
  });
  it("checks each bucket against the right store slice", () => {
    const s = store();
    expect(isReady(s, { built: ["discreet_neural_scanner"] })).toBe(true);
    expect(isReady(s, { built: ["replica"] })).toBe(false);          // owned 0
    expect(isReady(s, { researched: ["cortical_scanning"] })).toBe(true);
    expect(isReady(s, { researched: ["cortex_simulation"] })).toBe(false);
    expect(isReady(s, { realized: ["be_one"] })).toBe(true);
    expect(isReady(s, { realized: ["center"] })).toBe(false);
    expect(isReady(s, { completed: ["act_1b_ark"] })).toBe(true);
    expect(isReady(s, { completed: ["act_2b_brain"] })).toBe(false);
    expect(isReady(s, { flags: ["core"] })).toBe(true);
    expect(isReady(s, { flags: ["defense"] })).toBe(false);
  });
  it("is satisfied only when EVERY bucket is satisfied (conjunction)", () => {
    const s = store();
    expect(isReady(s, { built: ["discreet_neural_scanner"], researched: ["cortical_scanning"] })).toBe(true);
    // last gate open → whole predicate false
    expect(isReady(s, { built: ["discreet_neural_scanner"], flags: ["defense"] })).toBe(false);
  });
});
