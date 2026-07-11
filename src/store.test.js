import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStore, SAVE_VERSION, TELEMETRY_CAP, TELEMETRY_SLACK, LOG_CAP } from "./store.js";
import { CONFIG, CLIMATE, POP, popCapacity, BODIES, BUILDINGS, TECHS, IDEAS, MULTS, sectionForBuilding, LOGISTICS_PLAN, ORDERED_FRAMEJACKS } from "./config.js";
import { isPowerOfTen } from "./shared/model.js";
import { LUT, MAX_WEDGE_STARS, BIN_LY } from "./galaxy/lut.js";
import { EXPLORE_DAYS_PER_SEC, EXPLORE_DERIVED, EXPLORE_SYS_BY_NAME, EXPLORE_SYSTEMS, systemReserve, DRIVER_MINED_GATE } from "./explore.js";
import { STORY_CHAIN } from "./story.js";
import { FIRST_QUEST_KEY, getQuestByKey, MAIN_STORY_CHAIN } from "./quests.js";
// Drains every currently-satisfiable head across the shared events engine.
// Story milestones (Replication, the Brain, the Finale, etc.) now live in
// story.js's STORY_CHAIN, checked via runOneEventCheck() instead of
// unconditionally in checkMilestones() — tests that used to rely on a single
// checkMilestones() call now call this instead.
function runEvents(s, n = 500) {
  for (let i = 0; i < n; i++) s.runOneEventCheck();
}

// Mark a story milestone (and everything before it in its chain) as already
// fired, then rebuild eventChains — the same trimming rebuildEventChains
// already does after a real save load. Lets a test jump straight to the
// milestone it actually wants to exercise without re-deriving every
// prerequisite building/tech from scratch.
function skipStoryFlags(s, keys) {
  for (const k of keys) s.flags[k] = true;
  s.rebuildEventChains();
}

// Fast-forward the MAIN spine so `questKey` is the live head: mark every earlier
// MAIN beat as already-fired (rebuildEventChains then skips them without running
// their actions). The target quest still fires normally once its own todo passes.
function reachMainQuest(s, questKey) {
  const keys = MAIN_STORY_CHAIN.map((e) => e.key);
  const i = keys.indexOf(questKey);
  skipStoryFlags(s, keys.slice(0, i));
}

describe("createStore initial state", () => {
  it("starts empty-handed with a cargo manifest and a boot log", () => {
    const s = createStore();
    expect(s.metal).toBe(0);                        // you launch with no metal — first structures are unpacked
    expect(s.inventory.asteroid_mine).toBe(1);      // cargo: one Mine
    expect(s.inventory.solar_collector).toBe(1);    // cargo: one Collector
    expect(s.owned.replica).toBe(0);
    expect(s.log.length).toBe(1);
    expect(Object.keys(s.explore.sys).length).toBe(8);
  });

  it("unpacks a structure from cargo for free, no queue", () => {
    const s = createStore();
    s.unpack("asteroid_mine");
    expect(s.owned.asteroid_mine).toBe(1);
    expect(s.inventory.asteroid_mine).toBe(0);
    expect(s.buildQueue.length).toBe(0);            // unpack bypasses the queue entirely
    expect(s.metal).toBe(0);                        // and costs nothing
  });
});

describe("main quest", () => {
  it("starts on the first quest with an empty completed ledger", () => {
    const s = createStore();
    expect(s.currentQuestKey).toBe(FIRST_QUEST_KEY);
    expect(s.completedQuests).toEqual([]);
    expect(s.currentQuest.key).toBe(FIRST_QUEST_KEY);
  });

  it("setQuest points at a key; addCompletedQuest appends without duplicates", () => {
    const s = createStore();
    s.setQuest("act_1a_unpack");
    expect(s.currentQuestKey).toBe("act_1a_unpack");
    expect(s.currentQuest.key).toBe("act_1a_unpack");
    s.addCompletedQuest("act_1a_initialize");
    s.addCompletedQuest("act_1a_initialize"); // dup ignored
    expect(s.completedQuests).toEqual(["act_1a_initialize"]);
  });

  it("setQuest(null) clears the active quest once the spine is done", () => {
    const s = createStore();
    s.setQuest(null);
    expect(s.currentQuestKey).toBe(null);
    expect(s.currentQuest).toBe(null);
  });

  it("advances off the first quest and records it once its beat fires", () => {
    const s = createStore();
    // act_1a_initialize's only todo ("Click Start") is always-true, so the first
    // time the events engine reaches the MAIN chain head it completes + advances.
    runEvents(s);
    expect(s.completedQuests).toContain(FIRST_QUEST_KEY);
    expect(s.currentQuestKey).not.toBe(FIRST_QUEST_KEY);
  });

  it("persists the quest pointer + ledger across a save/load round-trip", () => {
    const s = createStore();
    s.setQuest("act_2a_cold");
    s.addCompletedQuest("act_1a_initialize");
    s.addCompletedQuest("act_1a_unpack");
    const loaded = createStore();
    loaded.loadSave(s.saveText());
    expect(loaded.currentQuestKey).toBe("act_2a_cold");
    expect(loaded.completedQuests).toEqual(["act_1a_initialize", "act_1a_unpack"]);
  });
});

describe("build queue + assist", () => {
  it("enqueue clamps to what metal allows", () => {
    const s = createStore();
    s.metal = 40; // exactly one Asteroid Mine
    s.enqueue("asteroid_mine", 10); // a ×10 order, but can only afford 1
    expect(s.buildQueue.length).toBe(1);
    expect(s.buildQueue[0].count).toBe(1);
    expect(s.metal).toBe(0);
  });

  it("assist drives a job to completion", () => {
    const s = createStore();
    s.metal = 40;
    s.enqueue("asteroid_mine", 1);
    let guard = 0;
    while (s.buildQueue.length && guard++ < 100) s.assist(s.buildQueue[0].uid);
    expect(s.owned.asteroid_mine).toBe(1);
    expect(s.buildQueue.length).toBe(0);
  });

  it("cancelBuild refunds the job's full Metal cost and removes it from the queue", () => {
    const s = createStore();
    const unit = BUILDINGS.asteroid_mine.metalCost;
    s.metal = unit * 10;
    s.enqueue("asteroid_mine", 10);       // spends all the metal, one job of 10
    expect(s.metal).toBe(0);
    expect(s.buildQueue.length).toBe(1);
    s.cancelBuild(s.buildQueue[0].uid);
    expect(s.metal).toBe(unit * 10);      // full cost returned
    expect(s.buildQueue.length).toBe(0);  // job gone
  });

  it("cancelBuild refunds even a partially-built job in full (labour is forfeit, Metal is not)", () => {
    const s = createStore();
    const unit = BUILDINGS.asteroid_mine.metalCost;
    s.metal = unit;
    s.enqueue("asteroid_mine", 1);
    s.buildQueue[0].progress = BUILDINGS.asteroid_mine.workload / 2; // half-built
    s.cancelBuild(s.buildQueue[0].uid);
    expect(s.metal).toBe(unit);           // still the full refund
    expect(s.owned.asteroid_mine || 0).toBe(0); // no structure was produced
  });

  it("cancelBuild is a no-op for an unknown uid", () => {
    const s = createStore();
    s.metal = 100;
    s.cancelBuild(123456);
    expect(s.metal).toBe(100);
  });
});

describe("power grid", () => {
  it("you are self-powered; each Replica draws replicaPowerKw from the grid", () => {
    const s = createStore();
    expect(s.powerNet).toBe(0); // just you, net-zero
    s.owned.replica = 10;
    expect(s.powerNet).toBeCloseTo(-10 * CONFIG.replicaPowerKw, 6); // −238 kW at 23.8 each
    expect(CONFIG.replicaPowerKw).toBe(23.8);
  });

  it("powerDraining is true on a deficit, false when balanced, charging, or already failed", () => {
    const s = createStore();
    expect(s.powerDraining).toBe(false);          // net-zero at start
    s.owned.replica = 10;                         // draw with no generation → deficit
    expect(s.powerNet).toBeLessThan(0);
    expect(s.powerDraining).toBe(true);
    s.powerFailed = true;                         // once blacked out, it's failure, not draining
    expect(s.powerDraining).toBe(false);
    s.powerFailed = false;
    s.owned.solar_collector = 50; s.breakerOn.solar_collector = true; // ample generation
    expect(s.powerNet).toBeGreaterThan(0);
    expect(s.powerDraining).toBe(false);          // charging, not draining
  });

  it("nets generation against draw; a lone Collector runs a Mine with margin", () => {
    const s = createStore();
    s.unpack("solar_collector"); // generates 100× a Mine's draw
    s.unpack("asteroid_mine");   // draws its LUT wattage
    // chassis (you) is +1/−1 net-zero. Collector gen is 100× the Mine draw, so
    // net = 100·draw − draw = 99·draw.
    const mineKw = BUILDINGS.asteroid_mine.powerUsage.kW;
    expect(s.powerNet).toBeCloseTo(99 * mineKw, 6);
    expect(s.powerNet).toBeGreaterThan(0);
  });

  it("drains the cell and trips the breaker when a Mine runs with no generation", () => {
    const s = createStore();
    s.unpack("asteroid_mine"); // draws its LUT wattage, no Collector
    expect(s.powerNet).toBeCloseTo(-BUILDINGS.asteroid_mine.powerUsage.kW, 6);
    expect(s.powerFailed).toBe(false);
    // run enough sim time to drain the onboard reserve
    let guard = 0;
    while (!s.powerFailed && guard++ < 500) s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.power).toBe(0);
    // the trip flips owned grid breakers off...
    expect(s.breakerOn.asteroid_mine).toBe(false);
    // ...but leaves un-owned buildings alone: a type you own 0 of has no breaker to
    // switch back on, so tripping it would strand it "off" forever (e.g. the Replica
    // breaker that gates Research before any Replica exists).
    expect(s.owned.solar_collector).toBe(0);
    expect(s.breakerOn.solar_collector).toBe(true);
    expect(s.owned.replica).toBe(0);
    expect(s.breakerOn.replica).toBe(true);
  });

  it("reboots only when generation comes up before load", () => {
    const s = createStore();
    s.unpack("solar_collector");
    s.unpack("asteroid_mine");
    // force a blackout
    s.power = 0; s.breakerOn.asteroid_mine = true; s.breakerOn.solar_collector = false;
    s.tick(0.2);
    expect(s.powerFailed).toBe(true);

    // wrong order: switch the Mine on first — still no generation, so it re-trips
    s.setBreaker("asteroid_mine", true);
    s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.breakerOn.asteroid_mine).toBe(false); // tripped straight back off

    // right order: Collector first — the cell recharges and the grid restores
    s.setBreaker("solar_collector", true);
    let guard = 0;
    while (s.powerFailed && guard++ < 100) s.tick(0.2);
    expect(s.powerFailed).toBe(false);
    expect(s.power).toBeGreaterThan(0);
  });
  it("stays recoverable when the Collector is still in cargo at blackout", () => {
    const s = createStore();
    s.unpack("asteroid_mine"); // mine first, Collector never unpacked
    let g = 0;
    while (!s.powerFailed && g++ < 500) s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.owned.solar_collector).toBe(0);   // never deployed
    expect(s.inventory.solar_collector).toBe(1); // still crated — reachable via its live in-card Unpack
    // unpacking it from the emergency panel brings generation online and recovers
    s.unpack("solar_collector");
    let g2 = 0;
    while (s.powerFailed && g2++ < 100) s.tick(0.2);
    expect(s.powerFailed).toBe(false);
    expect(s.power).toBeGreaterThan(0);
  });
  it("early blackout then Collector recovery leaves Research online (Replica breaker untouched)", () => {
    // The exact opening-move trap: unpack the Mine but not the Collector, black out,
    // then unpack the Collector to recover. Research must NOT be stuck offline, since
    // no Replica exists to have a breaker the player could switch back on.
    const s = createStore();
    s.unpack("asteroid_mine"); // Collector still crated
    let g = 0;
    while (!s.powerFailed && g++ < 500) s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.owned.replica).toBe(0);
    expect(s.breakerOn.replica).toBe(true); // never tripped — no Replica exists
    // recover by unpacking the Collector
    s.unpack("solar_collector");
    let g2 = 0;
    while (s.powerFailed && g2++ < 100) s.tick(0.2);
    expect(s.powerFailed).toBe(false);
    expect(s.breakerOn.replica).toBe(true); // Research still available, not "offline"
  });
  it("Kinetic Accumulators enlarge the storage cap without generating power", () => {
    const s = createStore();
    const base = s.powerCap; // onboard reserve only
    s.owned.kinetic_accumulator = 2;
    expect(s.powerCap).toBe(base + 2 * BUILDINGS.kinetic_accumulator.powerCap); // +powerCap kWh each
    expect(s.powerNet).toBe(0);               // storage adds no generation or draw
    // a bigger buffer means a given deficit takes proportionally longer to black out
    s.unpack("asteroid_mine"); // −10 kW, on top of the 2 accumulators (cap = base + 4000)
    s.power = s.powerCap;
    let bigTicks = 0;
    while (!s.powerFailed && bigTicks++ < 10000) s.tick(0.2);

    const s2 = createStore();
    s2.unpack("asteroid_mine");
    s2.power = s2.powerCap; // smaller cap — onboard reserve only
    let smallTicks = 0;
    while (!s2.powerFailed && smallTicks++ < 10000) s2.tick(0.2);

    expect(s.powerFailed).toBe(true);
    expect(s2.powerFailed).toBe(true);
    expect(bigTicks).toBeGreaterThan(smallTicks);
  });
});

describe("news chains", () => {
  it("fires the head of a chain once its test passes, and not the second item until then", () => {
    const s = createStore();
    let secondFired = false;
    s.eventChains = [[
      { key: "t1", test: (s) => s.metal >= 100, action: (s) => s.addNews("first") },
      { key: "t2", test: () => { secondFired = true; return true; }, action: (s) => s.addNews("second") },
    ]];
    s.eventChainIdx = 0;

    s.runOneEventCheck(); // metal is 0 — head test fails, nothing fires
    expect(secondFired).toBe(false);
    expect(s.log.length).toBe(1); // just the boot line

    s.metal = 100;
    s.runOneEventCheck(); // head test now passes — fires "first", never touches "second"
    expect(secondFired).toBe(false); // second item's test was never even called
    expect(s.log[0].msg).toBe("first");
    expect(s.log[0].cls).toBe("news");
    expect(s.flags.t1).toBe(true);
    expect(s.eventChains[0][0].key).toBe("t2"); // chain advanced, still has one item left
  });

  it("removes a chain once its last item fires (self-pruning)", () => {
    const s = createStore();
    s.eventChains = [[{ key: "only", test: () => true, action: (s) => s.addNews("done") }]];
    s.eventChainIdx = 0;
    s.runOneEventCheck();
    expect(s.eventChains.length).toBe(0);
  });

  it("round-robins across chains, checking one head per call", () => {
    const s = createStore();
    const calls = [];
    s.eventChains = [
      [{ key: "a", test: () => { calls.push("a"); return false; }, action: () => {} }],
      [{ key: "b", test: () => { calls.push("b"); return false; }, action: () => {} }],
    ];
    s.eventChainIdx = 0;
    s.runOneEventCheck();
    s.runOneEventCheck();
    expect(calls).toEqual(["a", "b"]); // one chain's head tested per call, not both at once
  });

  it("rebuildEventChains skips a chain's already-fired prefix (reload correctness)", () => {
    const s = createStore();
    s.flags.already_fired = true; // simulate: this key fired in a prior session
    s.rebuildEventChains([[
      { key: "already_fired", test: () => true, action: () => {} },
      { key: "not_yet", test: () => false, action: () => {} },
    ]]);
    expect(s.eventChains.length).toBe(1);
    expect(s.eventChains[0][0].key).toBe("not_yet"); // the fired item was trimmed off the front
  });

  it("ALL_NEWS_CHAINS are wired into a fresh store and fire through tick()", () => {
    const s = createStore();
    // find the probe chain by its known first key rather than importing it directly,
    // so this test exercises the same path a real game session does
    s.explore.day = 10; // past "news_probe_launched"'s day > 5
    let guard = 0;
    while (!s.flags.news_probe_launched && guard++ < 1000) s.tick(0.2);
    expect(s.flags.news_probe_launched).toBe(true);
    expect(s.log.some((e) => e.cls === "news")).toBe(true);
  });

  it("does not replay already-fired news after a real save/load round-trip", () => {
    const s = createStore();
    s.explore.day = 10;
    let guard = 0;
    while (!s.flags.news_probe_launched && guard++ < 1000) s.tick(0.2);
    expect(s.flags.news_probe_launched).toBe(true);

    const text = s.saveText();
    const loaded = createStore();
    loaded.loadSave(text);

    // the fired item should be trimmed off the probe chain, not sitting at its head
    const probeChain = loaded.eventChains.find((c) => c[0]?.key === "news_probe_trouble_1");
    expect(probeChain).toBeTruthy(); // next unfired item is now the head, chain wasn't reset to its start
  });
});

describe("emergency power (grid-down recovery)", () => {
  it("Replicas draw nothing and research is offline while the grid is down", () => {
    const s = createStore();
    s.metal = 1e6;
    s.owned.solar_collector = 1; // 154 kW
    s.owned.replica = 8;         // ~190 kW draw → overloads it → blackout
    let g = 0;
    while (!s.powerFailed && g++ < 2000) s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.powerDraw).toBeCloseTo(CONFIG.chassisPowerKw, 6); // just you; Replicas on emergency power
    expect(s.researchPower).toBe(0);
  });

  it("emergency build advances only the last queue item, at 1/20th", () => {
    const s = createStore();
    s.metal = 1e12;
    s.owned.replica = 100;
    s.breakerOn.replica = false; // Replicas on emergency power
    s.enqueue("asteroid_mine", 1);   // front of queue
    s.enqueue("solar_collector", 1); // last — gets the emergency labour
    s.tick(0.2);
    const mineJob = s.buildQueue.find((j) => j.id === "asteroid_mine");
    const collJob = s.buildQueue.find((j) => j.id === "solar_collector");
    expect(mineJob.progress).toBe(0);           // front untouched
    expect(collJob.progress).toBeCloseTo(1, 6);  // 100 × 1 × 0.2 × 0.05 = 1 BP into the last item
  });

  it("recovers by hand: panic-build a Collector, then switch breakers back on", () => {
    const s = createStore();
    s.metal = 1e6;
    s.owned.solar_collector = 1;
    s.owned.replica = 8;
    let g = 0;
    while (!s.powerFailed && g++ < 2000) s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.breakerOn.replica).toBe(false); // the trip took the Replica breaker with it
    s.enqueue("solar_collector", 1); // panic build (last item), builds on emergency power
    g = 0;
    while (s.buildQueue.length && g++ < 20000) s.tick(0.2);
    expect(s.owned.solar_collector).toBe(2);
    expect(s.powerFailed).toBe(true); // still dark — nothing auto-restores
    s.setBreaker("solar_collector", true); // switch generation back on by hand
    s.tick(0.2);
    expect(s.powerFailed).toBe(false); // cell recovering
    s.setBreaker("replica", true); // bring the workforce back
    s.tick(0.2);
    expect(s.powerNet).toBeGreaterThan(0); // two Collectors now out-generate the Replicas
  });
});

describe("infrastructure buildings (Construction Logistics, Science Installation)", () => {
  it("defines both techs at the stated cost, gated on Replication", () => {
    expect(TECHS.automated_construction.cost).toBe(16000);
    expect(TECHS.scientific_method.cost).toBe(32000);
    expect(TECHS.automated_construction.requires).toContain("replication");
    expect(TECHS.scientific_method.requires).toContain("replication");
  });
  it("defines both buildings with the stated cost, cap, and power draw", () => {
    expect(BUILDINGS.construction_logistics.metalCost).toBe(50000);
    expect(BUILDINGS.construction_logistics.max).toBe(1);
    expect(BUILDINGS.construction_logistics.powerUsage.kW).toBe(1000); // 1 MW
    expect(BUILDINGS.science_installation.metalCost).toBe(1000);
    expect(BUILDINGS.science_installation.max).toBeUndefined();        // unlimited
    expect(BUILDINGS.science_installation.powerUsage.kW).toBe(10);     // 10 kW
  });
  it("locks each building until its tech is researched", () => {
    const s = createStore();
    expect(s.buildingUnlocked("construction_logistics")).toBe(false);
    expect(s.buildingUnlocked("science_installation")).toBe(false);
    s.research.done.automated_construction = true;
    s.research.done.scientific_method = true;
    s.reconcileMilestones(); // tests set research.done directly, bypassing the notify producers
    expect(s.buildingUnlocked("construction_logistics")).toBe(true);
    expect(s.buildingUnlocked("science_installation")).toBe(true);
  });
  it("draws power off the grid once built and switched on", () => {
    const s = createStore();
    const base = s.powerDraw;
    s.owned.construction_logistics = 1;
    s.owned.science_installation = 2;
    s.breakerOn.construction_logistics = true;
    s.breakerOn.science_installation = true;
    expect(s.powerDraw).toBeCloseTo(base + 1000 + 2 * 10, 6); // 1 MW + 2×10 kW
  });
  it("files Science Installation under Thought and Construction Logistics under Misc", () => {
    expect(sectionForBuilding("science_installation")).toBe("thought");
    expect(sectionForBuilding("construction_logistics")).toBe("misc");
  });
});

describe("Science Installation research", () => {
  // give the grid enough generation that a single tick never blacks out
  const powered = (s) => { s.owned.solar_collector = 5; s.breakerOn.solar_collector = true; s.power = s.powerCap; };
  it("a powered installation adds scienceRpPerDay RP/game-day to the focused tech", () => {
    const s = createStore();
    powered(s);
    s.owned.science_installation = 1;
    s.breakerOn.science_installation = true;
    s.research.selected = "radar"; // cost 1000 — won't finish this tick
    const before = s.research.progress.radar || 0;
    s.tick(0.2); // 0.2s × EXPLORE_DAYS_PER_SEC(5) = 1 game-day
    expect(s.research.progress.radar - before).toBeCloseTo(CONFIG.scienceRpPerDay, 6);
  });
  it("scales linearly — 9 installations → 9× the per-installation rate", () => {
    const s = createStore();
    powered(s);
    s.owned.science_installation = 9;
    s.breakerOn.science_installation = true;
    s.research.selected = "radar";
    const before = s.research.progress.radar || 0;
    s.tick(0.2);
    expect(s.research.progress.radar - before).toBeCloseTo(9 * CONFIG.scienceRpPerDay, 6);
  });
  it("contributes nothing while unpowered or with no focused tech", () => {
    const s = createStore();
    powered(s);
    s.owned.science_installation = 5;
    s.breakerOn.science_installation = false; // off
    s.research.selected = "radar";
    const before = s.research.progress.radar || 0;
    s.tick(0.2);
    expect(s.research.progress.radar - before).toBe(0);
    // powered again but nothing focused → still nothing to receive the RP
    s.breakerOn.science_installation = true;
    s.research.selected = null;
    s.tick(0.2);
    expect(s.research.progress.radar - before).toBe(0);
  });
});

describe("Construction Logistics auto-build", () => {
  const powered = (s) => { s.owned.solar_collector = 60; s.breakerOn.solar_collector = true; s.power = s.powerCap; };
  it("queues the first plan step from an empty queue when powered & affordable", () => {
    const s = createStore();
    powered(s);
    s.metal = 1e6;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    expect(s.logistics.loopIdx).toBe(0);
    s.tick(0.2);
    expect(s.buildQueue.map((j) => j.id)).toEqual(["solar_collector"]);
    expect(s.logistics.loopIdx).toBe(1);
  });
  it("does nothing while unpowered", () => {
    const s = createStore();
    powered(s);
    s.metal = 1e6;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = false; // off
    s.tick(0.2);
    expect(s.buildQueue.length).toBe(0);
    expect(s.logistics.loopIdx).toBe(0);
  });
  it("parks on a step it can't afford, then advances once metal is available", () => {
    const s = createStore();
    powered(s);
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.metal = 0; // can't afford the first step (Solar Collector = 8 T)
    s.tick(0.2);
    expect(s.buildQueue.length).toBe(0);
    expect(s.logistics.loopIdx).toBe(0); // parked, not advanced
    s.metal = 1000;
    s.tick(0.2);
    expect(s.buildQueue.map((j) => j.id)).toEqual(["solar_collector"]);
    expect(s.logistics.loopIdx).toBe(1);
  });
  it("walks the whole plan in order and wraps the cursor", () => {
    const s = createStore();
    s.metal = 1e9;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.owned.replica = 200; s.breakerOn.replica = true; // build power to clear each 1-item queue per tick
    s.research.done.replication = true;
    s.owned.solar_collector = 300; s.breakerOn.solar_collector = true; s.power = s.powerCap; // generation headroom
    s.reconcileMilestones(); // research.done/owned set directly above → resync the maps
    const before = { sc: s.owned.solar_collector, am: s.owned.asteroid_mine, rep: s.owned.replica, ka: s.owned.kinetic_accumulator };
    for (let i = 0; i < 8; i++) s.tick(0.2);
    // every distinct plan building has been built at least once...
    expect(s.owned.solar_collector).toBeGreaterThan(before.sc);
    expect(s.owned.asteroid_mine).toBeGreaterThan(before.am);
    expect(s.owned.replica).toBeGreaterThan(before.rep);
    expect(s.owned.kinetic_accumulator).toBeGreaterThan(before.ka);
    // ...and the cursor has wrapped and stays in range
    expect(s.logistics.loopIdx).toBeGreaterThanOrEqual(0);
    expect(s.logistics.loopIdx).toBeLessThan(5);
  });
  it("cheapestAvailableMine skips depleted bodies and mines whose infra isn't built", () => {
    const s = createStore();
    expect(s.cheapestAvailableMine).toBe("asteroid_mine"); // fresh: only the belt is ready
    s.depleted.belt = true;
    expect(s.cheapestAvailableMine).toBe(null);            // belt gone, no other infra built
    s.owned.uranian_railgun = 1; s.reconcileMilestones();  // cheapest moon mine's infra (poked directly)
    expect(s.cheapestAvailableMine).toBe("uranian_mine");
    s.owned.mercury_ring = 1; s.reconcileMilestones();     // a pricier rocky mine — stays uranian
    expect(s.cheapestAvailableMine).toBe("uranian_mine");
  });
  it("retargets the mine step to the cheapest available mine when the belt is spent", () => {
    const s = createStore();
    powered(s);
    s.metal = 1e9;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.depleted.belt = true; s.owned.asteroid_mine = 0; // belt exhausted and its mines recycled
    s.owned.uranian_railgun = 1;                        // uranian_mine (8,680) now buildable
    s.reconcileMilestones();                            // infra poked directly → resync the maps
    s.logistics.loopIdx = 1;                            // cursor sits on the mine step
    s.tick(0.2);
    expect(s.buildQueue.map((j) => j.id)).toEqual(["uranian_mine"]);
    expect(s.logistics.loopIdx).toBe(2);                     // advanced past the substituted step
    expect(s.breakerOn.construction_logistics).toBe(true);   // still running
  });
  it("switches itself off when the belt is spent and no other mine's infra is built", () => {
    const s = createStore();
    powered(s);
    s.metal = 1e9;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.depleted.belt = true; s.owned.asteroid_mine = 0;
    s.logistics.loopIdx = 1; // cursor on the mine step, nothing else minable
    s.tick(0.2);
    expect(s.breakerOn.construction_logistics).toBe(false); // halted
    expect(s.buildQueue.length).toBe(0);
    expect(s.logistics.loopIdx).toBe(1);                    // cursor left where it parked
    s.tick(0.2); // stays idle while off
    expect(s.buildQueue.length).toBe(0);
  });
  it("persists the loop cursor across a save/load round-trip", () => {
    const s = createStore();
    powered(s);
    s.metal = 1e6;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.tick(0.2);
    expect(s.logistics.loopIdx).toBe(1);
    const s2 = createStore();
    s2.loadSave(s.saveText());
    expect(s2.logistics.loopIdx).toBe(1);
  });

  it("canPowerN: generators and no-draw buildings always pass; draws need headroom", () => {
    const s = createStore();
    s.owned.solar_collector = 10; s.breakerOn.solar_collector = true; // ~1543 kW generation
    expect(s.canPowerN("solar_collector", 1000)).toBe(true);      // generator
    expect(s.canPowerN("kinetic_accumulator", 1000)).toBe(true);  // no powerUsage
    expect(s.canPowerN("asteroid_mine", 100)).toBe(true);         // small draw fits the surplus
    expect(s.canPowerN("asteroid_mine", 100000)).toBe(false);     // huge draw doesn't
  });
  it("with Multithreading on, commits a full ×16 batch as 16 jobs", () => {
    const s = createStore();
    powered(s);
    s.metal = 1e6;
    s.multithread = true;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.tick(0.2); // step 0 = solar_collector (a generator → power always fine)
    expect(s.buildQueue.length).toBe(16);
    expect(s.buildQueue.every((j) => j.id === "solar_collector")).toBe(true);
    expect(s.buildQueue.every((j) => j.count === 1)).toBe(true); // qty 1 per job
    expect(s.logistics.loopIdx).toBe(1);
  });
  it("with Multithreading on, waits when it can't afford the whole ×16 batch in metal", () => {
    const s = createStore();
    powered(s);
    s.metal = 100; // < 16 × 8 T for the Solar Collector step
    s.multithread = true;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.tick(0.2);
    expect(s.buildQueue.length).toBe(0);
    expect(s.logistics.loopIdx).toBe(0);
  });
  it("with Multithreading on, waits when the ×16 batch would overrun power headroom", () => {
    const s = createStore();
    s.metal = 1e9;
    s.multithread = true;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.research.done.replication = true;
    // 8 collectors (~1234 kW) minus the unit's own 1 MW draw ≈ 234 kW surplus —
    // not enough for 16 Replicas (16 × 23.8 = 380.8 kW), but grid stays net-positive.
    s.owned.solar_collector = 8; s.breakerOn.solar_collector = true; s.power = s.powerCap;
    s.logistics.loopIdx = 3; // Replica step
    s.tick(0.2);
    expect(s.buildQueue.length).toBe(0);   // parked on the power gate
    expect(s.logistics.loopIdx).toBe(3);
  });
  it("with Multithreading on and ample power, commits the ×16 Replica batch", () => {
    const s = createStore();
    s.metal = 1e9;
    s.multithread = true;
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.research.done.replication = true;
    s.owned.solar_collector = 50; s.breakerOn.solar_collector = true; s.power = s.powerCap; // big surplus
    s.reconcileMilestones(); // research.done.replication poked directly → resync so replica unlocks
    s.logistics.loopIdx = 3; // Replica step
    s.tick(0.2);
    expect(s.buildQueue.length).toBe(16);
    expect(s.buildQueue.every((j) => j.id === "replica")).toBe(true);
    expect(s.logistics.loopIdx).toBe(4);
  });
});

describe("Construction Logistics plan editing", () => {
  it("seeds an editable clone of the default plan (not the shared const)", () => {
    const a = createStore(), b = createStore();
    expect(a.logistics.plan.map((s) => s.building)).toEqual(LOGISTICS_PLAN.map((s) => s.building));
    a.logistics.plan[0].building = "replica"; // mutating one game's plan...
    expect(b.logistics.plan[0].building).toBe("solar_collector"); // ...doesn't leak to another
    expect(LOGISTICS_PLAN[0].building).toBe("solar_collector");   // ...or to the const
  });
  it("edits rows and rewinds the cursor to the top", () => {
    const s = createStore();
    s.logistics.loopIdx = 3;
    s.logisticsSetQty(0, 10);
    expect(s.logistics.plan[0].qty).toBe(10);
    expect(s.logistics.loopIdx).toBe(0); // rewound
    s.logisticsSetBuilding(1, "kinetic_accumulator");
    expect(s.logistics.plan[1].building).toBe("kinetic_accumulator");
    s.logisticsAddRow();
    expect(s.logistics.plan.length).toBe(6);
    s.logisticsDeleteRow(5);
    expect(s.logistics.plan.length).toBe(5);
  });
  it("clamps quantity to a positive integer and rejects unknown buildings", () => {
    const s = createStore();
    s.logisticsSetQty(0, 0);   expect(s.logistics.plan[0].qty).toBe(1);
    s.logisticsSetQty(0, -5);  expect(s.logistics.plan[0].qty).toBe(1);
    s.logisticsSetQty(0, 7.9); expect(s.logistics.plan[0].qty).toBe(7);
    s.logisticsSetBuilding(0, "not_a_building");
    expect(s.logistics.plan[0].building).toBe("solar_collector"); // unchanged
  });
  it("never lets the plan be emptied", () => {
    const s = createStore();
    while (s.logistics.plan.length > 1) s.logisticsDeleteRow(0);
    expect(s.logistics.plan.length).toBe(1);
    s.logisticsDeleteRow(0); // refused
    expect(s.logistics.plan.length).toBe(1);
  });
  it("resets to the default plan", () => {
    const s = createStore();
    s.logisticsResetPlan(); // from a mutated state
    s.logistics.plan[0].building = "replica";
    s.logistics.loopIdx = 2;
    s.logisticsResetPlan();
    expect(s.logistics.plan.map((x) => x.building)).toEqual(LOGISTICS_PLAN.map((x) => x.building));
    expect(s.logistics.loopIdx).toBe(0);
  });
  it("locks all edits while running (built + breaker on)", () => {
    const s = createStore();
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    expect(s.logisticsRunning).toBe(true);
    const before = s.logistics.plan.map((x) => ({ ...x }));
    s.logisticsSetQty(0, 99);
    s.logisticsSetBuilding(0, "replica");
    s.logisticsAddRow();
    s.logisticsDeleteRow(0);
    s.logisticsResetPlan();
    expect(s.logistics.plan.map((x) => ({ ...x }))).toEqual(before); // nothing changed
    // switch off → edits allowed again
    s.breakerOn.construction_logistics = false;
    expect(s.logisticsRunning).toBe(false);
    s.logisticsSetQty(0, 99);
    expect(s.logistics.plan[0].qty).toBe(99);
  });
  it("owned-0 is not 'running' even with the breaker defaulted on", () => {
    const s = createStore();
    expect(s.breakerOn.construction_logistics).toBe(true); // breakers default on
    expect(s.owned.construction_logistics || 0).toBe(0);
    expect(s.logisticsRunning).toBe(false);                // ...but nothing built → editable
    s.logisticsSetQty(0, 5);
    expect(s.logistics.plan[0].qty).toBe(5);
  });
  it("the tick follows an edited plan", () => {
    const s = createStore();
    s.metal = 1e6;
    s.owned.solar_collector = 60; s.breakerOn.solar_collector = true; s.power = s.powerCap;
    // rewrite the plan to a single step, then build it
    while (s.logistics.plan.length > 1) s.logisticsDeleteRow(0);
    s.logisticsSetBuilding(0, "kinetic_accumulator");
    s.owned.construction_logistics = 1;
    s.breakerOn.construction_logistics = true;
    s.tick(0.2);
    expect(s.buildQueue.map((j) => j.id)).toEqual(["kinetic_accumulator"]);
  });
  it("a custom plan survives save/load; a legacy save (no plan) falls back to default", () => {
    const s = createStore();
    s.logisticsSetBuilding(0, "replica");
    s.logisticsSetQty(0, 10);
    const s2 = createStore();
    s2.loadSave(s.saveText());
    expect(s2.logistics.plan[0]).toEqual({ building: "replica", qty: 10 });
    // legacy save: logistics carries only loopIdx
    const legacy = createStore();
    const snap = JSON.parse(s.saveText());
    delete snap.state.logistics.plan;
    snap.state.logistics.loopIdx = 2;
    legacy.loadSnapshot(snap);
    expect(legacy.logistics.loopIdx).toBe(2);
    expect(legacy.logistics.plan.map((x) => x.building)).toEqual(LOGISTICS_PLAN.map((x) => x.building));
  });
});

describe("framejack easter egg", () => {
  const allFramejacks = [1, ...ORDERED_FRAMEJACKS.map((x) => x.fj)];
  it("exposes only ×1 with no research and no Brain", () => {
    const s = createStore();
    expect(s.framejackLevels[0].fj).toEqual(1);
  });
  it("unlockAllFramejack surfaces every tier without a Brain", () => {
    const s = createStore();
    expect(s.owned.sol_matrioshka_brain || 0).toBe(0);
    s.unlockAllFramejack();
    expect(s.devFramejack).toBe(true);
    expect(s.research.done.framejacking).toBe(true);
    expect(s.research.done.efficient_underclocking).toBe(true);
    expect(s.research.done.quantum_cooled_cpu).toBe(true);
    expect(s.research.done.planck_rate_processing).toBe(true);
    expect(s.framejackLevels.map((x) => x.fj)).toEqual(allFramejacks);
  });
  it("is idempotent and persists across a save/load round-trip", () => {
    const s = createStore();
    s.unlockAllFramejack();
    s.unlockAllFramejack(); // no throw, no change
    expect(s.framejackLevels.map((x) => x.fj)).toEqual(allFramejacks);
    const s2 = createStore();
    s2.loadSave(s.saveText());
    expect(s2.devFramejack).toBe(true);
    expect(s2.framejackLevels.map((x) => x.fj)).toEqual(allFramejacks);
  });
});

describe("cortical scan", () => {
  it("starts at 8.1B and grows toward the start-temperature capacity", () => {
    const s = createStore();
    expect(s.humanPopulation).toBe(8.1e9);
    expect(s.peopleScanned).toBe(0);
    expect(s.surfaceTemp).toBe(CLIMATE.tStart);
    const cap = popCapacity(CLIMATE.tStart); // 8.9B, clamped from the 288K anchor
    const before = s.humanPopulation;
    s.tick(0.2);
    expect(s.humanPopulation).toBeGreaterThan(before); // 8.1B climbing toward 8.9B
    expect(s.humanPopulation).toBeLessThan(cap);        // still below capacity
  });

  it("population declines on a frozen Earth and is pulled to 0 in the deep cold", () => {
    const s = createStore();
    // freezing (cap 4B < 8.1B): a die-off, but still plenty of people after a few weeks
    let prev = s.humanPopulation;
    for (let i = 0; i < 30; i++) { s.surfaceTemp = 273; s.tick(0.2); }
    expect(s.humanPopulation).toBeLessThan(prev);
    expect(s.humanPopulation).toBeGreaterThan(0);
    // deep cold (cap −1B): population is pulled through zero and floored there
    for (let i = 0; i < 2000; i++) { s.surfaceTemp = 100; s.tick(0.2); }
    expect(s.humanPopulation).toBe(0);
  });

  it("never goes negative even though deep-cold capacity is negative", () => {
    const s = createStore();
    s.humanPopulation = 5e8;
    for (let i = 0; i < 600; i++) {
      s.surfaceTemp = 50; // capacity −1e9
      s.tick(0.2);
      expect(s.humanPopulation).toBeGreaterThanOrEqual(0);
    }
    expect(s.humanPopulation).toBe(0);
  });

  it("grows toward — and never past — capacity when the climate is ideal", () => {
    const s = createStore();
    const cap = popCapacity(CLIMATE.tPreindustrial); // 11B peak
    let prev = s.humanPopulation;
    for (let i = 0; i < 300; i++) {
      s.surfaceTemp = CLIMATE.tPreindustrial;
      s.tick(0.2);
      expect(s.humanPopulation).toBeGreaterThan(prev);       // climbing toward the peak
      expect(s.humanPopulation).toBeLessThanOrEqual(cap + 1); // never overshoots it
      prev = s.humanPopulation;
    }
  });

  it("banks scanned minds when the population dies back, clamping scanFrac at 1", () => {
    const s = createStore();
    s.peopleScanned = s.humanPopulation;   // everyone imaged
    expect(s.scanFrac).toBeCloseTo(1, 6);
    for (let i = 0; i < 20; i++) { s.surfaceTemp = 240; s.tick(0.2); } // capacity ~0.4B ≪ pop
    expect(s.humanPopulation).toBeLessThan(s.peopleScanned); // more banked minds than living people
    expect(s.scanFrac).toBe(1);            // still reads as fully scanned, not >100%
  });

  it("a powered scanner images 1000 people per game-day", () => {
    const s = createStore();
    s.owned.dyson_ring_collector = 1; // ample generation so the scanner stays powered
    s.owned.discreet_neural_scanner = 1;
    for (let i = 0; i < 10; i++) s.tick(0.2); // 10 game-days
    expect(s.peopleScanned).toBeCloseTo(1000 * 10, 0);
    expect(s.scanFrac).toBeGreaterThan(0);
  });

  it("does not scan while the breaker is tripped", () => {
    const s = createStore();
    s.owned.dyson_ring_collector = 1;
    s.owned.discreet_neural_scanner = 1;
    s.breakerOn.discreet_neural_scanner = false; // scanner powered off
    for (let i = 0; i < 10; i++) s.tick(0.2);
    expect(s.peopleScanned).toBe(0);
    s.breakerOn.discreet_neural_scanner = true; // back on
    for (let i = 0; i < 10; i++) s.tick(0.2);
    expect(s.peopleScanned).toBeCloseTo(1000 * 10, 0);
  });

  it("does not scan without a scanner, and never exceeds the population", () => {
    const s = createStore();
    for (let i = 0; i < 5; i++) s.tick(0.2);
    expect(s.peopleScanned).toBe(0);
    // near the cap, even a big powered scan can't over-count past the population
    s.owned.dyson_ring_collector = 1;
    s.owned.discreet_neural_scanner = 1000;
    s.peopleScanned = s.humanPopulation - 5;
    s.tick(0.2);
    expect(s.peopleScanned).toBeLessThanOrEqual(s.humanPopulation);
    expect(s.peopleScanned).toBeGreaterThan(0);
  });
});

describe("story chain (STORY_CHAIN via the events engine)", () => {
  it("checks one chain head every tick — no throttle", () => {
    const s = createStore();
    // fake chains whose heads never fire, so the round-robin cursor purely advances
    s.rebuildEventChains([
      [{ key: "fake_a", test: () => false, action: () => {} }],
      [{ key: "fake_b", test: () => false, action: () => {} }],
      [{ key: "fake_c", test: () => false, action: () => {} }],
    ]);
    expect(s.eventChainIdx).toBe(0);
    s.tick(0.2);
    expect(s.eventChainIdx).toBe(1); // a head is checked on the very first tick
    s.tick(0.2);
    expect(s.eventChainIdx).toBe(2); // and again the next tick — no multi-tick gap
  });

  it("MAIN spine's Act 1A completes in order once its beats are met: initialize → unpack → grow → shade", () => {
    const s = createStore();
    s.owned.solar_collector = 1;
    s.owned.asteroid_mine = 1;
    s.research.done.replication = true;
    s.owned.replica = 1;
    s.research.done.thin_film = true;
    s.owned.shade_panel = 1;
    runEvents(s);
    expect(s.flags.act_1a_initialize).toBe(true);
    expect(s.flags.act_1a_unpack).toBe(true);
    expect(s.flags.act_1a_grow).toBe(true);
    expect(s.flags.act_1a_shade).toBe(true);
    expect(s.completedQuests).toContain("act_1a_grow");  // completion now drives reveals (see milestones.js)
    expect(s.completedQuests).toContain("act_1a_shade");
    expect(s.techsRevealed.thin_film).toBe(true);        // act_1a_grow reveals Thin-Film Reflectors
    expect(s.currentQuestKey).toBe("act_1b_scan"); // parked on the next unmet quest
  });

  it("act_1b_ark gates on a fully scanned Earth (scanFrac >= 1) on top of an online Ark", () => {
    const ark = STORY_CHAIN.flat().find((x) => x.key === "act_1b_ark");
    expect(ark).toBeDefined();
    const base = {
      research: { done: { complete_user_archival: true } },
      owned: { l2_ark_of_terra: 1 },
      breakerOn: { l2_ark_of_terra: true },
      powerNet: 5,
    };
    expect(ark.test({ ...base, scanFrac: 0.999 })).toBe(false); // nearly, but not fully, scanned
    expect(ark.test({ ...base, scanFrac: 1 })).toBe(true);      // fully scanned → fires
    // the scan gate is additive: a fully-scanned but offline Ark still doesn't fire
    expect(ark.test({ ...base, breakerOn: { l2_ark_of_terra: false }, scanFrac: 1 })).toBe(false);
  });

  it("regression: quantumCpu cannot fire before firstBrain, even if the tech is marked done early", () => {
    // FRAMEJACK_CHAIN was originally (incorrectly) spliced inline before
    // firstBrain in ACT_3 — quantum_cooled_cpu requires the "Turiya" Idea,
    // which requires Philosophy access, which only opens once the Brain is
    // built. If quantumCpu were still part of the same chain as firstBrain
    // and positioned before it, this would deadlock the whole chain forever.
    const s = createStore();
    s.research.done.quantum_cooled_cpu = true; // satisfied "early", before the Brain exists
    let guard = 0;
    for (; guard < 1000; guard++) s.tick(0.2);
    expect(s.flags.quantumCpu).toBe(true); // fires on its own — not blocked by firstBrain's chain
    expect(s.flags.firstBrain).toBeUndefined(); // and doesn't spuriously fire the Brain milestone
  });

  it("act_2a_needle reveals the Brain (Act III label) on completion, no firstPipe bridge", () => {
    // MAIN_STORY_CHAIN now covers Acts 1–3 (KARDASHEV_CHAIN and the old ACT_3
    // chain were superseded and dropped). What used to be ACT_3's brainRevealed
    // beat — reveal the Brain, print the "neighboring stars beckon" proposal — is
    // now folded into act_2a_needle's onComplete, so no flags.firstPipe bridge exists.
    const s = createStore();
    expect(s.revealed.brain).toBe(false);
    reachMainQuest(s, "act_2a_needle");
    s.research.done.centrosphere = true;
    s.owned.core_heat_pipes = 1;
    runEvents(s);
    expect(s.flags.act_2a_needle).toBe(true);
    expect(s.revealed.brain).toBe(true);
  });

  it("act_2a gates: Reverse is temperature-only; Cold also requires the human vessels eliminated", () => {
    // firstGun moved out of story.js entirely (see news.js's DEFENSE_NEWS_CHAIN) —
    // it's flavor now, not a story gate. act_2a_preindustrial ("Reverse") therefore
    // fires on temperature alone. act_2a_cold ("Cold"), by contrast, now additionally
    // requires every human vessel destroyed — a deliberate gate the spine sits behind.
    const preindustrial = STORY_CHAIN.flat().find((x) => x.key === "act_2a_preindustrial");
    const cold = STORY_CHAIN.flat().find((x) => x.key === "act_2a_cold");
    expect(preindustrial).toBeDefined();
    expect(cold).toBeDefined();

    expect(preindustrial.test({ surfaceTemp: CLIMATE.tPreindustrial })).toBe(true);
    expect(preindustrial.test({ surfaceTemp: CLIMATE.tPreindustrial + 1 })).toBe(false);

    expect(cold.test({ surfaceTemp: CONFIG.humanFreezeTemp, humanVessels: 3 })).toBe(false);
    expect(cold.test({ surfaceTemp: CONFIG.humanFreezeTemp, humanVessels: 0 })).toBe(true);
    expect(cold.test({ surfaceTemp: CONFIG.humanFreezeTemp + 1, humanVessels: 0 })).toBe(false);
  });
});

describe("mining tick", () => {
  it("produces metal and depletes the belt", () => {
    const s = createStore();
    s.owned.asteroid_mine = 1;
    expect(s.metalPerSec).toBeCloseTo(5, 6); // belt fullRate at 100%
    const m0 = s.metal, mined0 = s.mined.belt, rem0 = s.remaining("belt");
    s.tick(0.2);
    expect(s.metal).toBeGreaterThan(m0);
    expect(s.mined.belt).toBeGreaterThan(mined0);   // more has been extracted
    expect(s.remaining("belt")).toBeLessThan(rem0); // less remains
  });

  it("stops producing metal once its breaker is switched off", () => {
    const s = createStore();
    s.owned.asteroid_mine = 1;
    s.breakerOn.asteroid_mine = false;
    expect(s.metalPerSec).toBe(0);
    const m0 = s.metal, mined0 = s.mined.belt;
    s.tick(0.2);
    expect(s.metal).toBe(m0);
    expect(s.mined.belt).toBe(mined0);
    // and it resumes the moment the breaker is switched back on
    s.breakerOn.asteroid_mine = true;
    expect(s.metalPerSec).toBeCloseTo(5, 6);
    s.tick(0.2);
    expect(s.metal).toBeGreaterThan(m0);
  });

  it("holds a minimum rate floor once a body drops below 2% remaining", () => {
    const s = createStore();
    const belt = BODIES[0];
    s.owned.asteroid_mine = 1;
    // 1% remaining — below the 2% floor
    s.mined.belt = belt.mass * 0.99;
    // rate is floored at fullRate × 0.02, not fullRate × 0.01
    expect(s.metalPerSec).toBeCloseTo(belt.fullRate * 0.02, 9);
    expect(s.metalPerSec).not.toBeCloseTo(belt.fullRate * 0.01, 9);
  });

  it("reports paused whenever any modal is open", () => {
    const s = createStore();
    // a fresh game opens on the prelude modal, so it starts paused
    expect(s.paused).toBe(true);
    s.dismissPreludeModal();
    expect(s.paused).toBe(false);
    s.showPreludeModal = true;
    expect(s.paused).toBe(true);
    s.showPreludeModal = false;
    s.showActOneModal = true;
    expect(s.paused).toBe(true);
    s.showActOneModal = false;
    s.showActTwoModal = true;
    expect(s.paused).toBe(true);
    s.showActTwoModal = false;
    s.showFinaleModal = true;
    expect(s.paused).toBe(true);
  });
});

describe("research", () => {
  it("assistResearch completes a tech", () => {
    const s = createStore(); // replication cost 50
    s.selectResearch("replication");
    let guard = 0;
    while (!s.research.done.replication && guard++ < 100) s.assistResearch("replication");
    expect(s.research.done.replication).toBe(true);
  });
  it("focusAndAssist focuses (without toggling) and lands one assist per call", () => {
    const s = createStore();
    expect(s.research.selected).toBe(null);
    s.focusAndAssist("replication");
    expect(s.research.selected).toBe("replication");      // focused
    const after1 = s.research.progress.replication;
    expect(after1).toBeGreaterThan(0);                    // assisted
    // clicking again keeps it focused (not toggled off) and adds more progress
    s.focusAndAssist("replication");
    expect(s.research.selected).toBe("replication");
    expect(s.research.progress.replication).toBeGreaterThan(after1);
  });
  it("focusAndAssist ignores locked or already-researched techs", () => {
    const s = createStore();
    s.focusAndAssist("framejacking"); // locked (requires prior techs)
    expect(s.research.selected).toBe(null);
    s.research.done.replication = true;
    s.focusAndAssist("replication");  // already done
    expect(s.research.selected).toBe(null);
  });
  it("researchPower counts powered Science Installations, independent of the build queue", () => {
    const s = createStore();
    s.metal = 1e6;
    expect(s.researchPower).toBe(0);
    // idle Replicas contribute while the queue is empty and their breaker is on
    s.owned.replica = 4; s.breakerOn.replica = true;
    expect(s.researchPower).toBeCloseTo(4 * CONFIG.replicaResearchPerSec, 6);
    // a busy queue silences the Replica contribution
    s.enqueue("solar_collector", 1);
    expect(s.buildQueue.length).toBe(1);
    expect(s.researchPower).toBe(0);
    // ...but powered Science Installations still count (they research regardless)
    s.owned.science_installation = 3; s.breakerOn.science_installation = true;
    const sci = 3 * CONFIG.scienceRpPerDay * EXPLORE_DAYS_PER_SEC;
    expect(s.researchPower).toBeCloseTo(sci, 6);
    // switching their breaker off drops the contribution
    s.breakerOn.science_installation = false;
    expect(s.researchPower).toBe(0);
  });
  it("per-day chip getters are the per-second rates divided by EXPLORE_DAYS_PER_SEC", () => {
    const s = createStore();
    s.owned.asteroid_mine = 1; s.breakerOn.asteroid_mine = true;
    s.owned.replica = 10; s.breakerOn.replica = true;
    expect(s.metalPerDay).toBeCloseTo(s.metalPerSec / EXPLORE_DAYS_PER_SEC, 9);
    expect(s.buildPerDay).toBeCloseTo(s.buildPower / EXPLORE_DAYS_PER_SEC, 9);
    expect(s.researchPerDay).toBeCloseTo(s.researchPower / EXPLORE_DAYS_PER_SEC, 9);
    // a Science Installation reads as exactly scienceRpPerDay per game-day
    s.owned.science_installation = 1; s.breakerOn.science_installation = true;
    const expected = 10 * CONFIG.replicaResearchPerSec / EXPLORE_DAYS_PER_SEC + 1 * CONFIG.scienceRpPerDay;
    expect(s.researchPerDay).toBeCloseTo(expected, 9);
  });
});

describe("perf: bounded buffers", () => {
  it("caps the narrative log to the most recent LOG_CAP entries", () => {
    const s = createStore();
    for (let i = 0; i < LOG_CAP + 500; i++) s.pushLog("line " + i);
    expect(s.log.length).toBe(LOG_CAP);
    expect(s.log[0].msg).toBe("line " + (LOG_CAP + 499)); // newest at the front
  });
  it("caps telemetry.events near TELEMETRY_CAP under a flood", () => {
    const s = createStore();
    for (let i = 0; i < TELEMETRY_CAP * 3; i++) s.pushTelemetry({ type: "action", action: "spam", i });
    expect(s.telemetry.events.length).toBeLessThanOrEqual(TELEMETRY_CAP + TELEMETRY_SLACK);
    expect(s.telemetry.events.length).toBeGreaterThanOrEqual(TELEMETRY_CAP);
  });
  it("a long auto-build run keeps both buffers bounded", () => {
    const s = createStore();
    s.metal = 1e12;
    s.multithread = true;
    s.owned.construction_logistics = 1; s.breakerOn.construction_logistics = true;
    s.owned.replica = 500; s.breakerOn.replica = true;
    s.research.done.replication = true;
    s.owned.solar_collector = 400; s.breakerOn.solar_collector = true; s.power = s.powerCap;
    for (let i = 0; i < 4000; i++) s.tick(0.2);
    expect(s.telemetry.events.length).toBeLessThanOrEqual(TELEMETRY_CAP + TELEMETRY_SLACK);
    expect(s.log.length).toBeLessThanOrEqual(LOG_CAP);
  });
  it("enqueue pushes no telemetry and gives each job an auto-incrementing integer uid", () => {
    const s = createStore();
    s.metal = 1e6;
    const before = s.telemetry.events.length;
    s.enqueue("solar_collector", 1);
    s.enqueue("solar_collector", 1);
    expect(s.telemetry.events.length).toBe(before);   // no per-enqueue telemetry
    const [a, b] = s.buildQueue;
    expect(typeof a.uid).toBe("number");
    expect(b.uid).toBe(a.uid + 1);                    // auto-incrementing integer id
    expect(a.queue_item_id).toBeUndefined();          // UUID field removed
  });
  it("_trimBuffers clamps a bloated (pre-cap) save on load", () => {
    const s = createStore();
    // simulate an old save whose buffers were never capped
    for (let i = 0; i < TELEMETRY_CAP + 4000; i++) s.telemetry.events.push({ type: "old", i });
    for (let i = 0; i < LOG_CAP + 400; i++) s.log.push({ id: i, msg: "old " + i });
    const s2 = createStore();
    s2.loadSave(s.saveText());
    expect(s2.telemetry.events.length).toBeLessThanOrEqual(TELEMETRY_CAP);
    expect(s2.log.length).toBeLessThanOrEqual(LOG_CAP);
  });
});

describe("dev toolbar", () => {
  it("toggleDevMode flips the flag and is not persisted", () => {
    const s = createStore();
    expect(s.devMode).toBe(false);
    s.toggleDevMode();
    expect(s.devMode).toBe(true);
    const s2 = createStore();
    s2.loadSave(s.saveText());
    expect(s2.devMode).toBe(false); // devMode isn't in STATE_KEYS
  });
  it("clearTelemetryAndLog empties both buffers", () => {
    const s = createStore();
    s.pushLog("x"); s.pushTelemetry({ type: "action", action: "y" });
    s.clearTelemetryAndLog();
    expect(s.telemetry.events.length).toBe(0);
    expect(s.log.length).toBe(0);
  });
  it("profileTicks records phase timings then reports and clears", () => {
    const s = createStore();
    const table = vi.spyOn(console, "table").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    s.profileTicks(3);
    expect(s._profTicksLeft).toBe(3);
    s.tick(0.2); s.tick(0.2);
    expect(s._prof).not.toBeNull();       // still profiling
    expect(s._prof.mining).toBeGreaterThanOrEqual(0);
    s.tick(0.2);                          // 3rd tick → report + clear
    expect(s._prof).toBeNull();
    expect(s._profTicksLeft).toBe(0);
    expect(table).toHaveBeenCalled();
    table.mockRestore(); log.mockRestore();
  });
  it("adds no measurable state when not profiling", () => {
    const s = createStore();
    expect(s._prof).toBeNull();
    s.tick(0.2); // must not throw or start profiling on its own
    expect(s._prof).toBeNull();
  });
});

describe("reveal/enable notification system", () => {
  it("notify fires then deletes a key's watchers; unknown/consumed keys no-op", () => {
    const s = createStore();
    let calls = 0;
    s.notifyWatchers.foo = [() => calls++, () => calls++];
    s.notify("foo");
    expect(calls).toBe(2);
    expect(s.notifyWatchers.foo).toBeUndefined(); // key deleted on fire
    s.notify("foo");            // already consumed → no-op
    s.notify("never_seen");     // nobody listening → no-op
    expect(calls).toBe(2);
  });
  it("setFlag sets store.flags and notifies its listeners (idempotent)", () => {
    const s = createStore();
    let fired = 0;
    s.notifyWatchers.core = [() => fired++];
    s.setFlag("core");
    expect(s.flags.core).toBe(true);
    expect(fired).toBe(1);
    s.setFlag("core"); // already set → no re-fire
    expect(fired).toBe(1);
  });
  it("root nodes (no requires/revealKey) derive to revealed+enabled at init", () => {
    const s = createStore();
    // replication has empty derived predicates → available immediately, no notify needed
    expect(s.techsRevealed.replication).toBe(true);
    expect(s.techsEnabled.replication).toBe(true);
  });
  it("pilot tech (thin_film) reveals on quest completion, enables on prereq research", () => {
    const s = createStore();
    expect(s.techsRevealed.thin_film).toBeUndefined();
    s.addCompletedQuest("act_1a_grow");            // revealWhen: { completed: ["act_1a_grow"] }
    expect(s.techsRevealed.thin_film).toBe(true);
    expect(s.techsEnabled.thin_film).toBeUndefined(); // replication not researched yet
    s.research.progress.replication = TECHS.replication.cost;
    s.finishTechIfDone("replication");             // enableWhen: { researched: ["replication"] }
    expect(s.techsEnabled.thin_film).toBe(true);
  });
  it("pilot building (user_matrix_installation) reveals on quest, enables on research", () => {
    const s = createStore();
    s.addCompletedQuest("act_1b_scan");
    expect(s.buildingsRevealed.user_matrix_installation).toBe(true);
    expect(s.buildingsEnabled.user_matrix_installation).toBeUndefined();
    s.research.progress.cortex_simulation = TECHS.cortex_simulation.cost;
    s.finishTechIfDone("cortex_simulation");
    expect(s.buildingsEnabled.user_matrix_installation).toBe(true);
  });
  it("pilot tech (k3) reveals AND enables when its idea is realized (empty enableWhen)", () => {
    const s = createStore();
    expect(s.techsRevealed.k3_distributed_processing).toBeUndefined();
    s.philosophy.progress.be_one_with_the_universe = IDEAS.be_one_with_the_universe.cost;
    s.finishIdeaIfDone("be_one_with_the_universe");
    expect(s.techsRevealed.k3_distributed_processing).toBe(true);
    expect(s.techsEnabled.k3_distributed_processing).toBe(true);
  });
  it("a multi-gate enable only flips on the LAST gate, in any order", () => {
    const s = createStore();
    // research prereq FIRST (enable's other gate), reveal SECOND
    s.research.progress.cortex_simulation = TECHS.cortex_simulation.cost;
    s.finishTechIfDone("cortex_simulation");
    expect(s.buildingsEnabled.user_matrix_installation).toBeUndefined(); // not revealed yet
    s.addCompletedQuest("act_1b_scan");
    expect(s.buildingsEnabled.user_matrix_installation).toBe(true);      // last gate closed
  });
  it("initMilestones reconciles the maps from loaded state (safety net, no notify)", () => {
    const s = createStore();
    s.addCompletedQuest("act_1b_scan");
    s.research.progress.cortex_simulation = TECHS.cortex_simulation.cost;
    s.finishTechIfDone("cortex_simulation");
    const s2 = createStore();
    s2.loadSave(s.saveText());
    expect(s2.buildingsRevealed.user_matrix_installation).toBe(true);
    expect(s2.buildingsEnabled.user_matrix_installation).toBe(true);
    expect(s2.techsRevealed.thin_film).toBeUndefined(); // act_1a_grow wasn't completed
  });
  it("a notify cascade reveals a downstream node with no manual reconcile", () => {
    const s = createStore();
    // discreet_neural_scanner has no revealKey → derived revealWhen == enableWhen ==
    // { researched: [cortical_scanning] }; researching the tech alone must reveal+enable it.
    expect(s.buildingsRevealed.discreet_neural_scanner).toBeFalsy();
    s.research.progress.cortical_scanning = TECHS.cortical_scanning.cost;
    s.finishTechIfDone("cortical_scanning"); // fires cortical_scanning_researched
    expect(s.buildingsRevealed.discreet_neural_scanner).toBe(true);
    expect(s.buildingsEnabled.discreet_neural_scanner).toBe(true);
  });
  it("no node is stranded: every node reveals+enables once its state is satisfied", () => {
    const s = createStore();
    for (const id of Object.keys(TECHS)) s.research.done[id] = true;
    for (const id of Object.keys(IDEAS)) s.philosophy.done[id] = true;
    for (const id of Object.keys(BUILDINGS)) s.owned[id] = 1;
    for (const e of MAIN_STORY_CHAIN) if (!s.completedQuests.includes(e.key)) s.completedQuests.push(e.key);
    s.reconcileMilestones();
    const allTrue = (map, dict, label) => {
      for (const id of Object.keys(dict)) expect(s[map][id], `${label}: ${id}`).toBe(true);
    };
    allTrue("techsRevealed", TECHS, "tech revealed");
    allTrue("techsEnabled", TECHS, "tech enabled");
    allTrue("buildingsRevealed", BUILDINGS, "building revealed");
    allTrue("buildingsEnabled", BUILDINGS, "building enabled");
    allTrue("ideasRevealed", IDEAS, "idea revealed");
    allTrue("ideasEnabled", IDEAS, "idea enabled");
  });
});

describe("framejack: one big step == N small steps (continuous subsystems)", () => {
  it("mining/metal/core match to float precision", () => {
    const setup = () => {
      const s = createStore();
      s.owned.asteroid_mine = 5;
      s.owned.solar_collector = 2; // 100 kW gen vs 50 kW draw — keep the breaker on throughout;
      // mining now correctly stops when powered off (see store.js), so a power trip
      // would inject the discrete breaker state machine into this continuous-subsystem check
      s.owned.core_heat_pipes = 2000;
      s.research.done.radar = true;
      // keep the discrete human subsystem inert: defense on, below freeze, no vessels
      s.revealed.defense = true;
      s.surfaceTemp = 272;
      s.owned.shade_panel = 500;
      return s;
    };
    const A = setup(), B = setup();
    const DT = 0.2, N = 100;
    for (let i = 0; i < N; i++) A.tick(DT);
    B.tick(N * DT);

    const rel = (a, b) => (a === 0 ? Math.abs(b) : Math.abs(a - b) / Math.abs(a));
    expect(rel(A.mined.belt, B.mined.belt)).toBeLessThan(1e-9);
    expect(rel(A.metal, B.metal)).toBeLessThan(1e-6);
    expect(rel(A.coreHeat, B.coreHeat)).toBeLessThan(1e-9);
    expect(rel(A.surfaceTemp, B.surfaceTemp)).toBeLessThan(1e-9); // target constant here
  });
});

describe("milestones", () => {
  it("logs the replication milestone and records the quest", () => {
    const s = createStore();
    s.owned.solar_collector = 1; // act_1a_unpack must clear first (linear spine)
    s.owned.asteroid_mine = 1;
    s.research.done.replication = true;
    s.owned.replica = 1;
    const before = s.log.length;
    runEvents(s);
    expect(s.flags.act_1a_grow).toBe(true);
    expect(s.completedQuests).toContain("act_1a_grow");
    expect(s.log.length).toBeGreaterThan(before);
  });
});

describe("Act III — Brain, Insight, Philosophy", () => {
  it("the Brain is revealed (Act III label) once act_2a_needle completes", () => {
    // The Brain reveal no longer depends on jupiter_spire — it rides on the Core
    // Heat Pipe quest (act_2a_needle), tying Act 2's cooling arc to Act 3 starting.
    const s = createStore();
    expect(s.revealed.brain).toBe(false);
    reachMainQuest(s, "act_2a_needle");
    s.research.done.centrosphere = true;
    s.owned.core_heat_pipes = 1;
    runEvents(s);
    expect(s.revealed.brain).toBe(true);
  });

  it("reveals the Philosophy panel and starts Insight when the Brain is built", () => {
    const s = createStore();
    expect(s.revealed.philosophy).toBe(false);
    expect(s.insightPerDay).toBe(0);
    // Philosophy now reveals via MAIN's act_2b_brain, so fast-forward the spine to
    // it (mark every earlier MAIN beat fired).
    const mainKeys = MAIN_STORY_CHAIN.map((e) => e.key);
    const beforeBrain = mainKeys.slice(0, mainKeys.indexOf("act_2b_brain"));
    skipStoryFlags(s, beforeBrain);
    s.owned.sol_matrioshka_brain = 1;
    runEvents(s);
    expect(s.revealed.philosophy).toBe(true);
    expect(s.completedQuests).toContain("act_2b_brain"); // completion drives the ×100 Framejack reveal
    expect(s.insightPerDay).toBe(CONFIG.insightPerBrainPerDay);
  });

  it("contemplating the Idea completes it and reveals the K3 techs", () => {
    const s = createStore();
    s.owned.sol_matrioshka_brain = 1;
    s.checkMilestones();
    expect(s.techVisible("k3_distributed_processing")).toBe(false);
    expect(s.techVisible("k3_wave_logistics")).toBe(false);

    s.selectIdea("be_one_with_the_universe");
    expect(s.philosophy.selected).toBe("be_one_with_the_universe");
    let n = 0;
    while (!s.ideaDone("be_one_with_the_universe") && n++ < 100000) s.tick(0.2);
    expect(s.ideaDone("be_one_with_the_universe")).toBe(true);
    // both research entries are now visible and researchable
    expect(s.techVisible("k3_distributed_processing")).toBe(true);
    expect(s.techVisible("k3_wave_logistics")).toBe(true);
  });

  it("selectIdea toggles focus off when re-selected", () => {
    const s = createStore();
    s.owned.sol_matrioshka_brain = 1;
    s.selectIdea("be_one_with_the_universe");
    s.selectIdea("be_one_with_the_universe");
    expect(s.philosophy.selected).toBe(null);
  });

  it("Insight accrual is framejack-invariant (loop == one big step)", () => {
    const A = createStore(), B = createStore();
    for (const x of [A, B]) { x.owned.sol_matrioshka_brain = 1; x.selectIdea("be_one_with_the_universe"); }
    for (let i = 0; i < 100; i++) A.tick(0.2);
    B.tick(100 * 0.2);
    expect(A.philosophy.progress.be_one_with_the_universe)
      .toBeCloseTo(B.philosophy.progress.be_one_with_the_universe, 9);
  });
});

describe("Act III — Galactic Logistics", () => {
  const TARS = (s) => { reachMainQuest(s, "act_3_seed"); s.owned.tars_seed_launcher = 1; runEvents(s); };

  it("reveals the panel and caps charge at the richest wedge", () => {
    const s = createStore();
    expect(s.revealed.galaxy).toBe(false);
    TARS(s);
    expect(s.revealed.galaxy).toBe(true);
    expect(s.galaxyChargeMax).toBe(MAX_WEDGE_STARS);
  });

  it("accrues charge per game-day, dt-scaled and capped", () => {
    const s = createStore();
    TARS(s);
    s.tick(0.2); // 1 game-day
    expect(s.galaxy.charge).toBeCloseTo(CONFIG.galaxyChargePerDay, 3);
    s.galaxy.charge = 1e30;
    s.tick(0.2);
    expect(s.galaxy.charge).toBe(s.galaxyChargeMax); // clamped
  });

  it("seeding needs the launcher, Seeds, and charge — and can't repeat a wedge", () => {
    const s = createStore();
    const cost = s.wedgeCost(6, 0);
    // no launcher yet
    expect(s.canSeed(6, 0)).toBe(false);
    TARS(s);
    s.galaxy.charge = cost; s.owned.matrioshka_seed = 0;
    expect(s.canSeed(6, 0)).toBe(false); // no seeds
    s.owned.matrioshka_seed = cost;
    expect(s.canSeed(6, 0)).toBe(true);
    s.seedWedge(6, 0);
    expect(s.galaxy.waves.length).toBe(1);
    expect(s.galaxy.charge).toBeCloseTo(0, 3);
    expect(s.owned.matrioshka_seed).toBeCloseTo(0, 3);
    expect(s.canSeed(6, 0)).toBe(false); // already seeded
  });

  it("a wave seeds its wedge as the front crosses, heard lagging by the round trip", () => {
    const s = createStore();
    TARS(s);
    s.owned.matrioshka_seed = 1e30; s.galaxy.charge = 1e30;
    s.seedWedge(0, 0); // toward Sgr A★, nearest ring
    expect(s.galaxySeededStars).toBe(0);
    // advance until the outbound front has exactly crossed ring 0
    s.explore.day += (BIN_LY / CONFIG.galaxyProbeSpeedC) * 365.25;
    const heardFraction = 1 / (1 + CONFIG.galaxyProbeSpeedC); // R_heard = front/(1+speedC)
    expect(s.galaxySeededStars).toBeCloseTo(LUT[0][0], 0);              // fully seeded
    expect(s.galaxyHeardStars).toBeCloseTo(LUT[0][0] * heardFraction, 0); // most already heard at 0.1c
  });

  it("heard stars feed back into insightPerDay", () => {
    const s = createStore();
    TARS(s);
    s.owned.matrioshka_seed = 1e30; s.galaxy.charge = 1e30;
    expect(s.insightPerDay).toBe(0);
    s.seedWedge(0, 0);
    s.explore.day += (BIN_LY / CONFIG.galaxyProbeSpeedC) * 365.25;
    const heardFraction = 1 / (1 + CONFIG.galaxyProbeSpeedC);
    expect(s.insightPerDay).toBeCloseTo(LUT[0][0] * heardFraction * CONFIG.insightPerBrainPerDay, 0);
  });

  it("seeded/heard counts are framejack-invariant (derived from explore.day)", () => {
    const A = createStore(), B = createStore();
    for (const x of [A, B]) { TARS(x); x.owned.matrioshka_seed = 1e30; x.galaxy.charge = 1e30; x.seedWedge(0, 0); }
    // run A as many small ticks, B as one big tick — same total elapsed days
    for (let i = 0; i < 5000; i++) A.tick(0.2);
    B.tick(5000 * 0.2);
    expect(A.galaxyHeardStars).toBeCloseTo(B.galaxyHeardStars, 6);
    expect(A.galaxySeededStars).toBeCloseTo(B.galaxySeededStars, 6);
    expect(A.galaxy.charge).toBeCloseTo(B.galaxy.charge, 3);
  });

  it("galaxy-funded Insight accrual is framejack-invariant across a heard ramp", () => {
    // A wave mid-flight makes insightPerDay ramp linearly within ring 0; the
    // trapezoidal integration must give the same progress big-step vs many-small.
    const A = createStore(), B = createStore();
    for (const x of [A, B]) {
      TARS(x); x.owned.matrioshka_seed = 1e30; x.galaxy.charge = 1e30;
      x.seedWedge(0, 0);
      x.explore.day += (2000 / CONFIG.galaxyProbeSpeedC) * 365.25; // heard front ~2000 ly into ring 0
      x.philosophy.selected = "frac_test"; // synthetic Idea — never completes (defensive guard)
      x.philosophy.progress = { frac_test: 0 };
      x.philosophy.done = {};
    }
    // same total elapsed time, staying inside ring 0 (heard front 2000 → 6000 ly, well under the 11000 cap)
    const totalDt = ((4000 / CONFIG.galaxyProbeSpeedC) * 365.25) / EXPLORE_DAYS_PER_SEC;
    for (let i = 0; i < 200; i++) A.tick(totalDt / 200);
    B.tick(totalDt);
    expect(A.galaxyHeardStars).toBeLessThan(LUT[0][0]);        // never clamped — rate truly ramped
    expect(A.philosophy.progress.frac_test).toBeGreaterThan(0);
    // values are ~1e14; use relative error instead of toBeCloseTo (which is absolute)
    const rel = Math.abs(A.philosophy.progress.frac_test - B.philosophy.progress.frac_test) / B.philosophy.progress.frac_test;
    expect(rel).toBeLessThan(1e-9);
  });
});

describe("Act III — the finale (relocation, floor swap, directive satisfied)", () => {
  const reach = (s) => {
    reachMainQuest(s, "act_3_seed");
    s.owned.tars_seed_launcher = 1; runEvents(s);
    s.research.done.galactic_relocation = true;
    s.research.done.zero_return_radiator = true;
  };

  it("building the Planetary Sail launches the relocation; it completes after the journey", () => {
    const s = createStore();
    reach(s);
    expect(s.relocating).toBe(false);
    expect(s.relocationProgress).toBe(0);
    s.owned.planetary_sail = 1; runEvents(s);
    expect(s.galaxy.relocateDay0).toBeCloseTo(s.explore.day, 6);
    expect(s.relocating).toBe(true);
    expect(s.relocated).toBe(false);
    // halfway through the fall
    s.explore.day += s.relocateDurationDays / 2;
    expect(s.relocationProgress).toBeCloseTo(0.5, 6);
    // arrival
    s.explore.day += s.relocateDurationDays;
    runEvents(s);
    expect(s.relocated).toBe(true);
    expect(s.completedQuests).toContain("act_3_arrive"); // Black Eye reveal now rides on this completion
  });

  it("the Black Eye is hidden until arrival, then visible", () => {
    const s = createStore();
    reach(s);
    expect(s.buildingVisible("black_eye_of_sagittarius")).toBe(false); // not relocated yet
    s.owned.planetary_sail = 1; runEvents(s);
    s.explore.day += s.relocateDurationDays + 1; runEvents(s);
    expect(s.buildingVisible("black_eye_of_sagittarius")).toBe(true);
  });

  it("the Black Eye swaps the surface floor from the CMB to Hawking", () => {
    const s = createStore();
    s.owned.shade_panel = 1000; s.coreHeat = 0; // shade + core both ~0, so the floor is the binding term
    expect(s.cmbrDefeated).toBe(false);
    expect(s.surfaceTarget).toBeCloseTo(CLIMATE.cmbr, 6); // pinned at 2.7 K
    s.owned.black_eye_of_sagittarius = 1;
    expect(s.cmbrDefeated).toBe(true);
    // with the core drained, the floor is now Hawking, ~0
    s.coreHeat = 0;
    expect(s.surfaceTarget).toBeCloseTo(CLIMATE.hawking, 18);
    expect(s.surfaceTarget).toBeLessThan(CLIMATE.cmbr);
  });

  it("fires the finale modal once the surface falls below the old CMB floor", () => {
    const s = createStore();
    reachMainQuest(s, "act_3_zero");
    s.owned.shade_panel = 1000; s.coreHeat = 0;
    s.owned.black_eye_of_sagittarius = 1;
    s.surfaceTemp = CLIMATE.cmbr;          // sitting at the old floor
    runEvents(s);
    expect(s.showFinaleModal).toBe(false); // not yet below it
    s.surfaceTemp = 2.5;                   // dropped below 2.7
    runEvents(s);
    expect(s.showFinaleModal).toBe(true);
    expect(s.flags.act_3_zero).toBe(true);
  });

  it("after the swap the surface relaxes below 2.7 K and keeps falling", () => {
    const s = createStore();
    s.owned.shade_panel = 1000; s.coreHeat = 0;
    s.owned.black_eye_of_sagittarius = 1;
    s.surfaceTemp = CLIMATE.cmbr;
    const t0 = s.surfaceTemp;
    for (let i = 0; i < 50; i++) s.tick(0.2);
    expect(s.surfaceTemp).toBeLessThan(t0);
    expect(s.surfaceTemp).toBeLessThan(CLIMATE.cmbr);
    const t1 = s.surfaceTemp;
    for (let i = 0; i < 50; i++) s.tick(0.2);
    expect(s.surfaceTemp).toBeLessThan(t1); // still falling, never settling
  });
});

describe("save / load", () => {
  it("round-trips the full state", () => {
    const a = createStore();
    a.owned.asteroid_mine = 7;
    a.metal = 12345.6;
    a.explore.day = 999;
    a.research.done.replication = true;
    a.flags.repl = true;
    a.explore.sys["Sirius"].launched = true;
    a.explore.sys["Sirius"].speed = 0.9;

    const text = a.saveText();
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(SAVE_VERSION);

    const b = createStore();
    const ok = b.loadSave(text);
    expect(ok).toBe(true);
    expect(b.owned.asteroid_mine).toBe(7);
    expect(b.metal).toBe(12345.6);
    expect(b.explore.day).toBe(999);
    expect(b.research.done.replication).toBe(true);
    expect(b.explore.sys["Sirius"].launched).toBe(true);
    expect(b.explore.sys["Sirius"].speed).toBe(0.9);
  });

  it("round-trips buildingMaxOverrides (story cap raises survive save/load)", () => {
    const a = createStore();
    a.buildingMaxOverrides.discreet_neural_scanner = 50000; // as the User Matrix event sets it
    a.buildingMaxOverrides.shade_panel = 1000;              // as the Ark event sets it

    const b = createStore();
    expect(b.loadSave(a.saveText())).toBe(true);
    // fresh store owns none of these buildings, so these values can ONLY come from
    // the save being preserved (the reconcile freeform-map fix), not the backfill.
    expect(b.buildingMaxOverrides.discreet_neural_scanner).toBe(50000);
    expect(b.buildingMaxOverrides.shade_panel).toBe(1000);
    expect(b.buildingMax("discreet_neural_scanner")).toBe(50000); // cap actually applied
  });

  it("backfills buildingMaxOverrides for a legacy save that lacks the field", () => {
    const a = createStore();
    a.owned.discreet_neural_scanner = 1;  // implies shade_panel cap → 5
    a.owned.user_matrix_installation = 1; // implies scanner cap → 50000
    const save = JSON.parse(a.saveText());
    delete save.state.buildingMaxOverrides; // an old save from before it was persisted

    const b = createStore();
    expect(b.loadSnapshot(save)).toBe(true);
    // reconstructed from the loaded owned-building state
    expect(b.buildingMaxOverrides.discreet_neural_scanner).toBe(50000);
    expect(b.buildingMaxOverrides.shade_panel).toBe(5);
    expect(b.buildingMax("discreet_neural_scanner")).toBe(50000); // can now build many
  });

  describe("error reporting", () => {
    let errSpy, warnSpy, infoSpy;
    beforeEach(() => {
      errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    });
    afterEach(() => {
      errSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });

    it("reports corrupted JSON and aborts", () => {
      const s = createStore();
      const ok = s.loadSave("{ not json ,,,");
      expect(ok).toBe(false);
      expect(errSpy).toHaveBeenCalled();
      expect(String(errSpy.mock.calls[0][0])).toContain("corrupted");
    });

    it("reports a non-object save", () => {
      const s = createStore();
      expect(s.loadSnapshot(42)).toBe(false);
      expect(errSpy).toHaveBeenCalled();
    });

    it("reports version mismatch, missing, unknown (nested) and type-mismatched keys, applying the rest", () => {
      const s = createStore();
      const save = JSON.parse(s.saveText());
      save.version = 99;                     // version mismatch
      save.state.owned.flux_capacitor = 3;   // unknown nested key
      save.state.gizmo = true;               // unknown top-level key
      delete save.state.coreHeat;            // missing key
      save.state.metal = "lots";             // type mismatch
      save.state.owned.asteroid_mine = 4;    // a valid value that should still apply

      const ok = s.loadSnapshot(save);
      expect(ok).toBe(true);

      // collect every warned string
      const warned = warnSpy.mock.calls.map((c) => JSON.stringify(c));
      const all = warned.join(" ");
      expect(all).toContain("99");                 // version warning
      expect(all).toContain("coreHeat");           // missing
      expect(all).toContain("owned.flux_capacitor"); // unknown, nested path
      expect(all).toContain("gizmo");              // unknown top-level
      expect(all).toContain("metal");              // type mismatch

      // best-effort application: bad metal rejected, good value applied
      expect(typeof s.metal).toBe("number");
      expect(s.metal).not.toBe("lots");
      expect(s.owned.asteroid_mine).toBe(4);
    });
  });
});

describe("recycleMines", () => {
  it("refunds the full metal cost and zeroes the owned count", () => {
    const s = createStore();
    const n = 3;
    s.owned.asteroid_mine = n;
    s.depleted.belt = true;
    const metalBefore = s.metal;
    const expectedRefund = n * 40; // BUILDINGS.asteroid_mine.metalCost = 40
    s.recycleMines("asteroid_mine");
    expect(s.owned.asteroid_mine).toBe(0);
    expect(s.metal).toBeCloseTo(metalBefore + expectedRefund, 6);
  });

  it("does nothing if the body is not yet depleted", () => {
    const s = createStore();
    s.owned.asteroid_mine = 2;
    const metalBefore = s.metal;
    s.recycleMines("asteroid_mine"); // belt not depleted
    expect(s.owned.asteroid_mine).toBe(2);
    expect(s.metal).toBe(metalBefore);
  });
});

describe("launchProbe", () => {
  it("launches at 0.3c without the Stellaser", () => {
    const s = createStore();
    s.owned.probe_launcher = 1;
    s.metal = 200;
    s.launchProbe("Alpha Centauri");
    expect(s.explore.sys["Alpha Centauri"].launched).toBe(true);
    expect(s.explore.sys["Alpha Centauri"].speed).toBe(0.3);
  });

  it("launches at 0.9c with the Stellaser built", () => {
    const s = createStore();
    s.owned.probe_launcher = 1;
    s.owned.stellaser = 1;
    s.metal = 200;
    s.launchProbe("Alpha Centauri");
    expect(s.explore.sys["Alpha Centauri"].launched).toBe(true);
    expect(s.explore.sys["Alpha Centauri"].speed).toBe(0.9);
  });

  it("does not launch without a probe launcher", () => {
    const s = createStore();
    s.metal = 200;
    s.launchProbe("Alpha Centauri");
    expect(s.explore.sys["Alpha Centauri"].launched).toBe(false);
  });

  it("does not launch without enough metal", () => {
    const s = createStore();
    s.owned.probe_launcher = 1;
    s.metal = 10; // PROBE_COST is 140
    s.launchProbe("Alpha Centauri");
    expect(s.explore.sys["Alpha Centauri"].launched).toBe(false);
  });
});

describe("enqueueMultithreaded", () => {
  it("queues 16 separate full-price jobs when affordable", () => {
    const s = createStore();
    s.metal = 40 * 1000 * 16; // exactly enough for 16 batches of 1000 asteroid mines
    s.enqueueMultithreaded("asteroid_mine", 1000, 16);
    expect(s.buildQueue.length).toBe(16);
    for (const job of s.buildQueue) expect(job.count).toBe(1000);
    expect(s.metal).toBeCloseTo(0, 6);
  });

  it("stops early (no partial batch) when metal runs out mid-loop", () => {
    const s = createStore();
    s.metal = 40 * 1000 * 5; // only enough for 5 full batches of 1000
    s.enqueueMultithreaded("asteroid_mine", 1000, 16);
    expect(s.buildQueue.length).toBe(5);
    for (const job of s.buildQueue) expect(job.count).toBe(1000);
    expect(s.metal).toBeCloseTo(0, 6);
  });

  it("stops early when remaining capacity can't fit a full batch", () => {
    const s = createStore();
    s.metal = 1e12; // plenty of metal
    s.buildingMaxOverrides.shade_panel = 10; // story-driven cap raise (see story.js)
    s.owned.shade_panel = 8; // max 10, room for only 2 more
    s.research.done.thin_film = true;
    s.reconcileMilestones(); // research.done poked directly → resync so shade_panel unlocks
    s.enqueueMultithreaded("shade_panel", 1, 16); // batches of 1, room for only 2 batches (2/1)
    expect(s.buildQueue.length).toBe(2);
    for (const job of s.buildQueue) expect(job.count).toBe(1);
  });

  it("queues nothing if even one full batch can't be afforded", () => {
    const s = createStore();
    s.metal = 10; // can't afford even one asteroid mine (40 T)
    s.enqueueMultithreaded("asteroid_mine", 1, 16);
    expect(s.buildQueue.length).toBe(0);
    expect(s.metal).toBe(10);
  });

  it("when only ~3 of 16 batches are affordable, queues exactly 3 separate ×1000 jobs", () => {
    const s = createStore();
    // asteroid_mine costs 40 T each, so a ×1000 batch costs 40,000 T.
    // 3001 mines' worth of metal affords 3 full ×1000 batches (120,000 T)
    // with 40,040 T left over (1001 mines' worth) — not enough for a 4th.
    s.metal = 40 * 3001;
    s.enqueueMultithreaded("asteroid_mine", 1000, 16);
    expect(s.buildQueue.length).toBe(3);
    for (const job of s.buildQueue) expect(job.count).toBe(1000);
    expect(s.metal).toBeCloseTo(40 * 1, 6); // 3001 - 3*1000 = 1 mine's worth of metal remains
  });
});

describe("store.arrived (derived probe-arrival lookup)", () => {
  const NAME = "Alpha Centauri";
  const DIST = EXPLORE_SYS_BY_NAME[NAME].distance;

  it("is false for every system before any probe launches", () => {
    const s = createStore();
    for (const def of EXPLORE_SYSTEMS) expect(s.arrived[def.name]).toBe(false);
  });

  it("flips true only once the probe's light-lag has elapsed", () => {
    const s = createStore();
    const sys = s.explore.sys[NAME];
    sys.launched = true;
    sys.speed = 0.9;
    sys.launchDay = 0;
    const travel = (DIST / 0.9) * 365; // recomputed here on purpose — pins the formula

    s.explore.day = travel - 1;
    expect(s.arrived[NAME]).toBe(false);

    s.explore.day = travel;          // arrival is inclusive (>=)
    expect(s.arrived[NAME]).toBe(true);
  });

  it("tracks launchDay, not absolute day — a late launch still has to travel", () => {
    const s = createStore();
    const sys = s.explore.sys[NAME];
    sys.launched = true;
    sys.speed = 0.3;
    sys.launchDay = 10_000;
    s.explore.day = 10_000 + (DIST / 0.3) * 365 - 1;
    expect(s.arrived[NAME]).toBe(false);
    s.explore.day += 1;
    expect(s.arrived[NAME]).toBe(true);
  });

  it("gates buildHarvester / buildDriver", () => {
    const s = createStore();
    const sys = s.explore.sys[NAME];
    sys.launched = true;
    sys.speed = 0.9;
    sys.launchDay = 0;
    s.explore.day = 0; // in transit

    const cat = EXPLORE_DERIVED[NAME].present[0];
    s.buildHarvester(NAME, cat);
    expect(sys.cats[cat].phase).toBe("idle"); // refused — not arrived
    s.buildDriver(NAME);
    expect(sys.driver.phase).toBe("idle");
  });
});

describe("Act III mass-beam full lifecycle (Alpha Centauri)", () => {
  const NAME = "Alpha Centauri";

  // Put a launched, fully-harvested system on the doorstep of shipping: probe has
  // arrived, every category harvested, driver built. producedNet is fully available.
  const primeSystem = (s) => {
    const d = EXPLORE_DERIVED[NAME];
    const sys = s.explore.sys[NAME];
    sys.launched = true;
    sys.speed = 0.9;
    sys.launchDay = 0;
    // mark arrival: elapsed >= travelDays. Put the clock past travel time.
    s.explore.day = Math.ceil((EXPLORE_SYS_BY_NAME[NAME].distance / sys.speed) * 365) + 1;
    for (const c of d.present) sys.cats[c] = { phase: "harvested", t: d.models[c].tHarvestDone, tau: 0 };
    sys.driver = { phase: "done", t: 90 };
    sys.driverDoneDay = s.explore.day;
    sys.shipped = 0;
    sys.consumed = false;
    sys.beam = { state: "empty" };
    sys.beamPackets = [];
    return { d, sys };
  };

  const producedNetOf = (s, d, sys) => {
    const gross = systemReserve(d.present, sys.cats, d.models, d.asteroidMass);
    return Math.max(0, gross - DRIVER_MINED_GATE * d.nonStarMass);
  };

  // advance `days` game-days in framejack-sized steps, exactly like the real tick loop
  // (explore.day += framejack; tickExplore(dt) where dayStep === framejack).
  const advanceDays = (s, days, fj) => {
    const dt = (fj * 0.2); // DT=0.2; dayStep = EXPLORE_DAYS_PER_SEC(5) * dt = fj
    let advanced = 0;
    while (advanced < days) {
      s.explore.framejack = fj;
      s.explore.day += fj;
      s.tickExplore(dt);
      advanced += fj;
    }
    return advanced;
  };

  for (const fjDef of ORDERED_FRAMEJACKS) {
    const fj = fjDef.fj;
    it(`ships the entire system home at framejack ${fjDef.label}`, () => {
      const s = createStore();
      s.metal = 0; // isolate: all metal that appears must have come from the beam
      const { d, sys } = primeSystem(s);
      const producedNet = producedNetOf(s, d, sys);
      expect(producedNet).toBeGreaterThan(0);

      const streamDays = (EXPLORE_SYS_BY_NAME[NAME].distance / 0.9) * 365;

      // ---- phase 1: run until the source is drained (emission complete) ----
      // Cap generously: DRIVER_SHIP_DAYS(900) firing + reload gaps, well under 4000 days.
      // At high framejack the short-circuit drains in a single step.
      let guard = 0;
      while (sys.shipped < producedNet - producedNet * 1e-9 && guard < 20000) {
        advanceDays(s, Math.max(fj, 50), fj);
        guard += Math.max(fj, 50);
      }
      // the system's own reserve is now empty (everything is emitted: in-flight or delivered)
      expect(producedNet - sys.shipped).toBeLessThanOrEqual(producedNet * 1e-6);
      expect(s.sysReserve(NAME)).toBeLessThanOrEqual(producedNet * 1e-6);

      // ---- phase 2: run systemDelayDays more so every packet crosses to Sol ----
      // (framejack ticks may overshoot; that's fine — deliverBeam is time-based.)
      advanceDays(s, Math.ceil(streamDays) + fj, fj);

      // 100% of the system mass is now in the Sol metal pool, nothing left in flight
      expect(sys.beamPackets.length).toBe(0);
      expect(sys.consumed).toBe(true);
      // relative error tiny: everything emitted was delivered (returned === producedNet)
      const relErr = Math.abs(s.explore.returned - producedNet) / producedNet;
      expect(relErr).toBeLessThan(1e-9);
      // metal delivered to Sol equals producedNet (started at 0)
      expect(Math.abs(s.metal - producedNet) / producedNet).toBeLessThan(1e-9);
    });
  }
});

describe("buildQueueFrac (workload-weighted queue completion)", () => {
  it("is 0 for an empty queue", () => {
    const s = createStore();
    expect(s.buildQueue.length).toBe(0);
    expect(s.buildQueueFrac).toBe(0);
  });

  it("weights by total workload, so a huge early job dominates a tiny finished one", () => {
    const s = createStore();
    const wSmall = BUILDINGS.asteroid_mine.workload;        // 10
    const wHuge  = BUILDINGS.sol_matrioshka_brain.workload; // 8.2e24
    // a tiny job 99% done, and an enormous job just 1% done
    s.buildQueue.push({ id: "asteroid_mine", count: 1, progress: 0.99 * wSmall, uid: 1 });
    s.buildQueue.push({ id: "sol_matrioshka_brain", count: 1, progress: 0.01 * wHuge, uid: 2 });

    const expected = (0.99 * wSmall + 0.01 * wHuge) / (wSmall + wHuge);
    expect(s.buildQueueFrac).toBeCloseTo(expected, 12);
    // the near-complete tiny job barely moves the needle — overall ≈ 1%
    expect(s.buildQueueFrac).toBeGreaterThan(0.0099);
    expect(s.buildQueueFrac).toBeLessThan(0.0101);
  });

  it("counts a job's `count` toward its total work", () => {
    const s = createStore();
    const w = BUILDINGS.asteroid_mine.workload;
    // 4 mines, half the total work done → 50%
    s.buildQueue.push({ id: "asteroid_mine", count: 4, progress: 0.5 * w * 4, uid: 1 });
    expect(s.buildQueueFrac).toBeCloseTo(0.5, 12);
  });

  it("averages equal-workload jobs by their progress", () => {
    const s = createStore();
    const w = BUILDINGS.asteroid_mine.workload;
    s.buildQueue.push({ id: "asteroid_mine", count: 1, progress: 0.2 * w, uid: 1 });
    s.buildQueue.push({ id: "asteroid_mine", count: 1, progress: 0.8 * w, uid: 2 });
    expect(s.buildQueueFrac).toBeCloseTo(0.5, 12); // (0.2 + 0.8) / 2
  });
});

describe("High-Power Servos & Kinetic Impactors", () => {
  const moonBody = BODIES.find((b) => b.tier === "moon");
  const beltBody = BODIES.find((b) => b.radar);

  it("servos quintuple Replica build power but leave manual Assists alone", () => {
    const s = createStore();
    s.owned.replica = 100;
    const base = s.buildPower;
    const assistBase = s.playerBuildPower;
    s.research.done.high_power_servos = true;
    expect(s.buildPower).toBeCloseTo(base * CONFIG.servoBuildMult, 6);
    expect(s.playerBuildPower).toBe(assistBase); // ion_thrusters' business, not ours
  });

  it("servos reach the tick, not just the readout", () => {
    // The bug this guards: buildPower (the getter) was multiplied while tick() went on
    // re-deriving owned.replica * replicaBuildPerSec, so the tech was pure cosmetics.
    // Assert on real job progress; a getter-only assertion cannot see the difference.
    const mk = (servo) => {
      const s = createStore();
      s.research.done.replication = true;
      s.reconcileMilestones();
      s.metal = 1e12;
      s.owned.replica = 10;
      s.owned.solar_collector = 5000; // keep the grid up
      s.research.done.high_power_servos = servo;
      s.enqueue("asteroid_mine", 1000); // far too big to finish in one tick
      return s;
    };
    const off = mk(false), on = mk(true);
    off.tick(0.2); on.tick(0.2);
    const p0 = off.buildQueue[0].progress, p1 = on.buildQueue[0].progress;
    expect(p0).toBeGreaterThan(0);
    expect(p1).toBeCloseTo(p0 * CONFIG.servoBuildMult, 6);
  });

  it("tickBuildPower is the single source: rate x dt equals what the tick spends", () => {
    const s = createStore();
    s.research.done.replication = true;
    s.reconcileMilestones();
    s.metal = 1e12;
    s.owned.replica = 10;
    s.owned.solar_collector = 5000;
    s.research.done.high_power_servos = true;
    s.enqueue("asteroid_mine", 1000);
    const expected = s.tickBuildPower(0.2);
    expect(expected).toBeCloseTo(s.buildPower * 0.2, 9);
    s.tick(0.2);
    expect(s.buildQueue[0].progress).toBeCloseTo(expected, 6);
  });

  it("servos speed up actuators, not cognition — idle research is unchanged", () => {
    // Surplus build-labour spills into research at 5:1. Servoing the pool without
    // dividing it back out would make High-Power Servos a stealth research multiplier
    // and desync researchPower (which has no servo term).
    const mk = (servo) => {
      const s = createStore();
      s.owned.replica = 100;
      s.owned.solar_collector = 5000;
      s.research.selected = "radar";        // cost 1000 — won't finish this tick
      s.research.done.high_power_servos = servo;
      return s;                              // empty queue: every replica is idle
    };
    const off = mk(false), on = mk(true);
    off.tick(0.2); on.tick(0.2);
    expect(on.research.progress.radar).toBeCloseTo(off.research.progress.radar, 6);
    expect(off.researchPower).toBeCloseTo(on.researchPower, 6); // readout stays honest
  });

  it("impactors quintuple moon-tier yield and nothing else", () => {
    const s = createStore();
    expect(s.mineMult(moonBody)).toBe(1);
    s.research.done.kinetic_impactors = true;
    expect(s.mineMult(moonBody)).toBe(CONFIG.impactorMineMult);
    // the belt is not moon-tier — impactors must not touch it
    expect(s.mineMult(beltBody)).toBe(1);
  });

  it("stacks multiplicatively with radar only where both apply", () => {
    const s = createStore();
    s.research.done.radar = true;
    s.research.done.kinetic_impactors = true;
    expect(s.mineMult(beltBody)).toBe(CONFIG.radarMineMult);   // belt: radar only
    expect(s.mineMult(moonBody)).toBe(CONFIG.impactorMineMult); // moon: impactors only
  });

  it("metalPerSec (readout) and tick() (truth) apply the same multiplier", () => {
    const mk = (impactors) => {
      const s = createStore();
      s.owned[moonBody.mineId] = 10;
      s.breakerOn[moonBody.mineId] = true;
      s.research.done.kinetic_impactors = impactors;
      return s;
    };
    const slow = mk(false), fast = mk(true);
    expect(fast.metalPerSec).toBeCloseTo(slow.metalPerSec * CONFIG.impactorMineMult, 6);

    // and the integrator agrees with the readout it advertises
    const mined0 = slow.mined[moonBody.id] || 0;
    const rate = slow.metalPerSec;
    slow.tick(0.2);
    expect((slow.mined[moonBody.id] || 0) - mined0).toBeCloseTo(rate * 0.2, 3);
  });

  it("impactors reach the tick, not just the readout", () => {
    // Mirror of the servo regression: assert on tonnage actually mined, not on the
    // metalPerSec getter. mineMult() is shared by readout and integrator, so this
    // should hold — but that was true of buildPower's getter too, right up until it
    // wasn't. The A/B bench (impactorMineMult 5 vs 1) is the end-to-end version.
    const mk = (impactors) => {
      const s = createStore();
      s.owned[moonBody.mineId] = 10;
      s.breakerOn[moonBody.mineId] = true;
      s.research.done.kinetic_impactors = impactors;
      return s;
    };
    const slow = mk(false), fast = mk(true);
    const before = slow.mined[moonBody.id] || 0;
    slow.tick(0.2); fast.tick(0.2);
    const dSlow = (slow.mined[moonBody.id] || 0) - before;
    const dFast = (fast.mined[moonBody.id] || 0) - before;
    expect(dSlow).toBeGreaterThan(0);
    expect(dFast / dSlow).toBeCloseTo(CONFIG.impactorMineMult, 6);
  });

  it("impactors do not accelerate the belt (radar's territory)", () => {
    const mk = (impactors) => {
      const s = createStore();
      s.owned[beltBody.mineId] = 10;
      s.breakerOn[beltBody.mineId] = true;
      s.research.done.kinetic_impactors = impactors;
      return s;
    };
    const off = mk(false), on = mk(true);
    off.tick(0.2); on.tick(0.2);
    expect(on.mined[beltBody.id]).toBeCloseTo(off.mined[beltBody.id], 9);
  });

  it("both techs reveal only once act_1b_simulate is complete", () => {
    const s = createStore();
    expect(s.techVisible("high_power_servos")).toBe(false);
    expect(s.techVisible("kinetic_impactors")).toBe(false);
    s.addCompletedQuest("act_1b_simulate");
    expect(s.techVisible("high_power_servos")).toBe(true);
    expect(s.techVisible("kinetic_impactors")).toBe(true);
  });

  it("story-gated techs are never cheaper than their prerequisites (no autoplayer soft-lock)", () => {
    // autoplayer.assistVisibleTechOrWait picks the cheapest *visible* tech, but
    // focusAndAssist no-ops on a locked one. Only revealKey techs can be revealed
    // while still locked (for the rest, milestones derives revealWhen === enableWhen).
    // So a story-gated tech cheaper than its prereq would make the bot spin forever.
    for (const [id, t] of Object.entries(TECHS)) {
      if (!t.revealKey) continue;
      for (const req of t.requires ?? []) {
        expect(TECHS[req].cost, `${id} is cheaper than its prereq ${req}`).toBeLessThan(t.cost);
      }
    }
  });
});

describe("power failure is unrecoverable without manual intervention", () => {
  it("latches: with every breaker tripped, powerNet is exactly 0 and the cell never refills", () => {
    // tickPower trips EVERY breaker on a blackout, generators included. powerGen then
    // falls to the bare chassis, whose panel and load cancel — so powerNet lands on
    // exactly 0, power stays at 0, and the `powerFailed && power > 0` clear can never
    // fire. Only a human flipping breakers (or the bot) brings it back. This is why
    // the autoplayer must never oversubscribe the grid in the first place.
    const s = createStore();
    s.owned.solar_collector = 1;
    s.owned.replica = 500;          // 500 x 23.8 kW against one collector
    s.power = 0;
    let guard = 200;
    while (!s.powerFailed && guard-- > 0) s.tick(0.2);
    expect(s.powerFailed).toBe(true);
    expect(s.breakerOn.solar_collector).toBe(false); // the generator trips too

    for (let i = 0; i < 100; i++) s.tick(0.2);
    expect(s.powerNet).toBe(0);
    expect(s.power).toBe(0);
    expect(s.powerFailed).toBe(true); // still dark, forever

    s.setBreaker("solar_collector", true); // the manual flip
    s.tick(0.2);
    expect(s.powerNet).toBeGreaterThan(0);
    expect(s.powerFailed).toBe(false);
  });
});

describe("enqueue's count invariant (powers of ten, or a Duplication doubling)", () => {
  const dupStore = (owned) => {
    const s = createStore();
    s.research.done.replication = true;
    s.reconcileMilestones();
    s.metal = 1e12;
    s.owned.replica = owned;
    return s;
  };

  it("accepts a ×2 doubling of an arbitrary fleet size", () => {
    // Catalog.jsx: dupN = Math.min(owned, cap). 317 is not a power of ten, and a hard
    // power-of-ten throw crashed the game the moment a player clicked ×2. No test
    // covered this path, which is how it stayed invisible.
    const s = dupStore(317);
    expect(() => s.enqueue("replica", 317)).not.toThrow();
    expect(s.buildQueue[0].count).toBe(317);
  });

  it("accepts a ×2 doubling dispatched through Multithreading (16 jobs)", () => {
    // owned never changes mid-loop (jobs haven't resolved), so all 16 iterations see
    // the same doubling target.
    const s = dupStore(317);
    expect(() => s.enqueueMultithreaded("replica", 317, 16)).not.toThrow();
    expect(s.buildQueue.length).toBe(16);
    expect(s.buildQueue.every((j) => j.count === 317)).toBe(true);
  });

  it("accepts a doubling clamped by the building's remaining capacity", () => {
    const s = dupStore(400);
    s.buildingMaxOverrides.replica = 700;      // cap 700 → only 300 more can exist
    expect(s.remainingCapacity("replica")).toBe(300);
    const dupN = Math.min(s.owned.replica, s.remainingCapacity("replica")); // 300
    expect(isPowerOfTen(dupN)).toBe(false);
    expect(() => s.enqueue("replica", dupN)).not.toThrow();
  });

  it("accepts every MULTS order and ×1", () => {
    for (const n of [1, ...MULTS.map((m) => m.n)]) {
      const s = dupStore(0);
      expect(isPowerOfTen(n), `MULTS ${n} must be a power of ten`).toBe(true);
      expect(() => s.enqueue("replica", n)).not.toThrow();
    }
  });

  it("throws on a fractional count — a fraction of a structure is never buildable", () => {
    const s = dupStore(491);
    expect(() => s.enqueue("replica", 0.5625)).toThrow(/power of ten/);
  });

  it("throws on an arbitrary count that is neither a MULTS order nor a doubling", () => {
    const s = dupStore(317);
    expect(() => s.enqueue("replica", 5)).toThrow(/power of ten/);
    expect(() => s.enqueue("replica", 318)).toThrow(/power of ten/); // off-by-one from the fleet
  });

  it("10^k is divisible by 16 for k>=4, so a %16 test could not have discriminated", () => {
    // Documents why isPowerOfTen exists rather than a divisibility check: a plain ×1e6
    // order and a ×16 multithreaded ×1e5 order are indistinguishable modulo 16.
    expect(1e6 % 16).toBe(0);
    expect((16 * 1e5) % 16).toBe(0);
    expect(isPowerOfTen(1e6)).toBe(true);
    expect(isPowerOfTen(16 * 1e5)).toBe(false);
  });
});
