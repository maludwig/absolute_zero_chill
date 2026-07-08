import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "./store.js";
import { autoplayer } from "./autoplayer.js";
import { BUILDINGS, MULTS } from "./config.js";
import { isPowerOfTen } from "./shared/model.js";

describe("autoplayer.play", () => {
  let store;
  beforeEach(() => {
    store = createStore();
    store.dismissPreludeModal(); // play() clears open modals first — nothing else runs while paused
  });

  it("unpacks cargo while the current quest is act_1a_unpack", () => {
    store.currentQuestKey = "act_1a_unpack";
    const totalCargo = Object.values(store.inventory).reduce((a, b) => a + b, 0);
    expect(totalCargo).toBeGreaterThan(0);

    // Each call unpacks exactly one item; owned count goes up, inventory goes down.
    const first = autoplayer.play(store);
    expect(first.action).toBe("unpack");
    expect(store.owned[first.id]).toBe(1);
    expect(store.inventory[first.id]).toBe(0);

    // Drain the rest of the manifest.
    let guard = 20;
    while (Object.values(store.inventory).some((n) => n > 0) && guard-- > 0) {
      expect(autoplayer.play(store).action).toBe("unpack");
    }
    expect(Object.values(store.inventory).every((n) => n === 0)).toBe(true);

    // Empty manifest → no-op (still on the unpack quest).
    expect(autoplayer.play(store)).toBeNull();
  });

  it("buys a single Solar Collector when not on a handled quest", () => {
    store.currentQuestKey = "act_1a_shade"; // falls through to the default
    store.research.selected = "replication"; // else play()'s "pick a tech" guard preempts
    store.metal = 1e9; // plenty to afford it
    const before = store.buildQueue.length;

    const res = autoplayer.play(store);
    expect(res).toEqual({ action: "enqueue", id: "solar_collector" });
    expect(store.buildQueue.length).toBe(before + 1);
    expect(store.buildQueue.at(-1).id).toBe("solar_collector");
  });
});

describe("autoplayer.play — act_1a_grow", () => {
  let store;
  beforeEach(() => {
    store = createStore();
    store.dismissPreludeModal(); // play() clears open modals first — nothing else runs while paused
    store.currentQuestKey = "act_1a_grow";
    // play() short-circuits to focus_assist on the cheapest visible tech whenever
    // nothing is selected. That's a one-shot on a fresh store; pre-select so these
    // cases exercise the act_1a_grow ladder itself.
    store.research.selected = "replication";
  });

  it("assists the head of the build queue when one exists", () => {
    store.metal = 1e9;
    store.enqueue("asteroid_mine", 1);
    const job = store.buildQueue[0];
    const before = job.progress;

    const res = autoplayer.play(store);
    expect(res).toEqual({ action: "assist", id: "asteroid_mine" });
    // Either progress advanced, or the job finished and left the queue.
    const still = store.buildQueue.find((j) => j.uid === job.uid);
    expect(still ? still.progress > before : store.owned.asteroid_mine >= 1).toBe(true);
  });

  it("enqueues an Asteroid Mine when the queue is empty and it's affordable", () => {
    store.buildQueue = [];
    store.metal = 1e9;

    const res = autoplayer.play(store);
    expect(res).toEqual({ action: "enqueue", id: "asteroid_mine" });
    expect(store.buildQueue.at(-1).id).toBe("asteroid_mine");
  });

  it("focuses and assists Replication when broke with an empty queue", () => {
    store.buildQueue = [];
    store.metal = 0;

    const res = autoplayer.play(store);
    expect(res).toEqual({ action: "focus_assist", id: "replication" });
    expect(store.research.selected).toBe("replication");
    expect(store.research.progress.replication).toBeGreaterThan(0);
  });
});

describe("autoplayer power headroom (never oversubscribe the grid)", () => {
  it("queuedDraw counts load that is queued but not yet built", () => {
    const store = createStore();
    store.dismissPreludeModal();
    store.metal = 1e9;
    store.research.done.replication = true; // Replicas are locked until this is researched
    store.reconcileMilestones();
    expect(autoplayer.queuedDraw(store)).toBe(0);
    store.enqueue("replica", 10);
    const kW = BUILDINGS.replica.powerUsage.kW;
    expect(autoplayer.queuedDraw(store)).toBeCloseTo(kW * 10, 6);
    expect(autoplayer.powerHeadroom(store)).toBeCloseTo(store.powerNet - kW * 10, 6);
  });

  it("generators in the queue are not counted as headroom (they aren't built either)", () => {
    const store = createStore();
    store.dismissPreludeModal();
    store.metal = 1e9;
    store.enqueue("solar_collector", 10); // kW < 0
    expect(autoplayer.queuedDraw(store)).toBe(0);
  });

  it("refuses a batch that fits powerNet but not the uncommitted headroom", () => {
    // The exact shape of the act_1b_ark blackout: three replica jobs, each of which
    // passes store.canPowerN on its own, together drawing 3x the surplus.
    const store = createStore();
    store.dismissPreludeModal();
    store.metal = 1e12;
    store.research.done.replication = true;
    store.reconcileMilestones();

    const N = 1000;                                   // a legal ×1000 MULTS order
    const kW = BUILDINGS.replica.powerUsage.kW;
    const scKW = -BUILDINGS.solar_collector.powerUsage.kW;
    // Generation enough for exactly one such batch, not two.
    store.owned.solar_collector = Math.ceil((1.5 * N * kW) / scKW);
    expect(store.powerNet).toBeGreaterThanOrEqual(N * kW);
    expect(store.powerNet).toBeLessThan(2 * N * kW);

    expect(store.canPowerN("replica", N)).toBe(true);
    expect(autoplayer.canPowerBatch(store, "replica", N)).toBe(true);

    store.enqueue("replica", N); // promise it all away
    expect(store.canPowerN("replica", N)).toBe(true);          // store: still "fits" — queue-blind
    expect(autoplayer.canPowerBatch(store, "replica", N)).toBe(false); // bot: no headroom left
  });

  it("drives a long run without ever browning out the grid", () => {
    // Regression for the blackout the queue-blind check used to cause around t=6425.
    // A blackout is unrecoverable without manual breaker flips (see store.test.js),
    // so the bot must never create one rather than dig itself back out.
    const store = createStore();
    for (let i = 0; i <= 7000; i++) {
      autoplayer.play(store);
      if (!store.paused) store.tick(0.2 * (store.explore.framejack || 1));
      if (store.powerFailed) break;
    }
    expect(store.powerFailed).toBe(false);
    expect(store.completedQuests).toContain("act_1b_ark");
  });
});

describe("autoplayer.clampLegal", () => {
  const mk = ({ mults = [], mt = false } = {}) => {
    const store = createStore();
    store.dismissPreludeModal();
    for (const t of mults) store.research.done[t] = true;
    store.research.done.multithreading = mt;
    store.reconcileMilestones();
    return store;
  };

  it("with no processing techs, the only legal batch is 1", () => {
    const store = mk();
    expect(autoplayer.legalMults(store)).toEqual([1]);
    expect(autoplayer.clampLegal(store, 49499)).toBe(1);
    expect(autoplayer.clampLegal(store, 1)).toBe(1);
  });

  it("returns 0 below 1, so callers can bail rather than queue nothing", () => {
    expect(autoplayer.clampLegal(mk(), 0)).toBe(0);
    expect(autoplayer.clampLegal(mk(), 0.5625)).toBe(0);
  });

  it("never exceeds the desired amount", () => {
    const store = mk({ mults: ["batch_processing", "bulk_processing"], mt: true });
    for (const d of [1, 5, 9, 16, 17, 159, 160, 999, 1000, 16000, 49499, 1e7]) {
      expect(autoplayer.clampLegal(store, d)).toBeLessThanOrEqual(d);
    }
  });

  it("picks the largest legal rung under the target", () => {
    const store = mk({ mults: ["batch_processing", "bulk_processing"], mt: true });
    // legal ladder here: 1, 10, 1000, 16, 160, 16000
    expect(autoplayer.clampLegal(store, 9)).toBe(1);
    expect(autoplayer.clampLegal(store, 15)).toBe(10);
    expect(autoplayer.clampLegal(store, 16)).toBe(16);
    expect(autoplayer.clampLegal(store, 159)).toBe(16);
    expect(autoplayer.clampLegal(store, 999)).toBe(160);
    expect(autoplayer.clampLegal(store, 15999)).toBe(1000);
    expect(autoplayer.clampLegal(store, 49499)).toBe(16000); // the scanner rung
  });

  it("honours the Multithreading tech gate", () => {
    const noMt = mk({ mults: ["batch_processing"] });
    expect(autoplayer.legalMults(noMt)).toEqual([1, 10]);
    expect(autoplayer.clampLegal(noMt, 999)).toBe(10); // not 160

    const withMt = mk({ mults: ["batch_processing"], mt: true });
    expect(autoplayer.clampLegal(withMt, 999)).toBe(160);
  });

  it("honours the MULTS tech gates", () => {
    const store = mk({ mults: ["batch_processing"] }); // ×10 only, no ×1000
    expect(autoplayer.clampLegal(store, 1e6)).toBe(10);
  });

  it("every output is dispatchable: 10^k (plain) or 16·10^k (multithreaded), never both", () => {
    // This is the property that makes enqueueBuilding's isPowerOfTen dispatch sound.
    const store = mk({ mults: MULTS.map((m) => m.tech), mt: true });
    for (let d = 1; d <= 40000; d = Math.ceil(d * 1.37)) {
      const n = autoplayer.clampLegal(store, d);
      const plain = isPowerOfTen(n);
      const threaded = Number.isInteger(n / 16) && isPowerOfTen(n / 16);
      expect(plain || threaded, `clampLegal(${d}) = ${n} is not dispatchable`).toBe(true);
      expect(plain && threaded, `clampLegal(${d}) = ${n} is ambiguous`).toBe(false);
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});
