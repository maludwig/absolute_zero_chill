// autoplay_bench.mjs — drive the autoplayer through a headless playthrough and
// report how many ticks each quest took.  Run with --help for usage.
//
// This is NOT a test — it's a balance/health instrument. It mirrors App.jsx's real
// loop: one store.tick(DT * framejack) per heartbeat, and NO ticking while a modal
// has the game paused. That last part matters: if the autoplayer forgets to dismiss
// a modal, the real game would sit there forever, and so will this — which is the
// point. We detect it and report a stall rather than spinning.

import { Command, Option, InvalidArgumentError } from "commander";
import { createStore } from "../src/store.js";
import { autoplayer } from "../src/autoplayer.js";
import { MAIN_STORY_CHAIN } from "../src/quests.js";

const DT = 0.2;                 // seconds per tick, matching App.jsx
const DEFAULT_TICKS = 2_000_000;
const DEFAULT_STALL = 20_000;   // no quest progress for this long → give up (--stall)
const PAUSE_STALL = 10;         // consecutive paused ticks with no dismissal → deadlock

const ALL_QUESTS = MAIN_STORY_CHAIN.map((q) => q.key);

// ---------------------------------------------------------------------------
// CLI. commander validates for us, which the old hand-rolled parser did not: a typo
// like `--tick=5000` silently fell back to the 2,000,000-tick default (a 40-minute
// run), and `--ticks 5000` (space instead of `=`) parsed as `{ticks: true}` →
// Number(true) → a ONE-tick run that reported "completed 0/22" and looked like a
// game bug. Both are hard errors now.

/** commander has no number type — everything is a string. Coerce and validate. */
const positiveInt = (label) => (raw) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive integer (got "${raw}").`);
  }
  return n;
};

const program = new Command()
  .name("autoplay_bench")
  .description("Drive the autoplayer through a headless playthrough and report how many ticks each quest took.")
  .addOption(new Option("-t, --ticks <n>", "tick budget before giving up")
    .argParser(positiveInt("--ticks")).default(DEFAULT_TICKS, DEFAULT_TICKS.toLocaleString("en-US")))
  .addOption(new Option("-s, --stall <n>", "abort after this many ticks with no quest completing")
    .argParser(positiveInt("--stall")).default(DEFAULT_STALL, DEFAULT_STALL.toLocaleString("en-US")))
  .addOption(new Option("-u, --until <quest>", "stop as soon as this quest completes").choices(ALL_QUESTS))
  .option("--trace", "print every autoplayer action (very loud)", false)
  .option("--actions", "print a per-quest action histogram", false)
  .option("-q, --quiet", "suppress the live progress lines on stderr", false)
  .addHelpText("after", `
Examples:
  $ node scripts/autoplay_bench.mjs                    run to the end of the questline
  $ node scripts/autoplay_bench.mjs --ticks 20000      cap the budget
  $ node scripts/autoplay_bench.mjs --until act_2b_beam
  $ node scripts/autoplay_bench.mjs --actions --quiet  histogram only

The questline has ${ALL_QUESTS.length} quests, from ${ALL_QUESTS[0]} to ${ALL_QUESTS[ALL_QUESTS.length - 1]}.`)
  .parse();

const opts = program.opts();
const maxTicks = opts.ticks;
const STALL_TICKS = opts.stall;
const until = opts.until ?? null;
const trace = opts.trace;
const showActions = opts.actions;
const quiet = opts.quiet;

// ---------------------------------------------------------------------------

const fmt = (n) => {
  if (n === 0) return "0";
  if (!isFinite(n)) return "∞";
  const abs = Math.abs(n);
  if (abs >= 1e6 || abs < 1e-2) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
};
const pad = (s, n, right = false) =>
  right ? String(s).padStart(n) : String(s).padEnd(n);
const secs = (t) => {
  const s = t * DT;
  if (s < 90) return s.toFixed(0) + "s";
  if (s < 5400) return (s / 60).toFixed(1) + "m";
  return (s / 3600).toFixed(1) + "h";
};

const t0 = Date.now();
const store = createStore();
const rows = [];                 // one per completed quest
const actionCounts = new Map();  // questKey -> Map(action -> n)
let pausedStreak = 0;
let lastProgressTick = 0;
let stalled = null;
let tick = 0;

const bump = (questKey, action) => {
  if (!showActions) return;
  if (!actionCounts.has(questKey)) actionCounts.set(questKey, new Map());
  const m = actionCounts.get(questKey);
  m.set(action, (m.get(action) ?? 0) + 1);
};

const snapshot = () => ({
  tick,
  day: Math.floor(store.explore.day),
  year: store.gameYear,
  metal: store.metal,
  temp: store.surfaceTemp,
  replicas: store.owned.replica ?? 0,
});

let prevDone = 0;
let prevTick = 0;
let questStartTick = 0;
let currentQuest = store.currentQuestKey;

for (; tick < maxTicks; tick++) {
  const before = store.currentQuestKey;

  const res = autoplayer.play(store);
  if (trace && res) console.log(`t=${tick} [${before}] ${res.action} ${res.id ?? ""}`);
  bump(before ?? "(none)", res?.action ?? "null");

  // Mirror App.jsx: a modal pauses the world. The autoplayer is expected to have
  // dismissed it above; if it didn't, we're deadlocked exactly as a real idle
  // player would be.
  if (store.paused) {
    if (++pausedStreak > PAUSE_STALL) {
      const open = ["showPreludeModal", "showActOneModal", "showAct1CompleteModal",
        "showUserMatrixModal", "showArkModal", "showActTwoModal", "showFinaleModal"]
        .filter((k) => store[k]);
      stalled = `deadlocked: modal(s) open and never dismissed → ${open.join(", ")}`;
      break;
    }
    continue;
  }
  pausedStreak = 0;

  store.tick(DT * (store.explore.framejack || 1));

  // A quest completed this tick (completedQuests only ever grows).
  if (store.completedQuests.length > prevDone) {
    for (let i = prevDone; i < store.completedQuests.length; i++) {
      const key = store.completedQuests[i];
      rows.push({ key, ...snapshot(), ticks: tick - prevTick });
      prevTick = tick;
    }
    prevDone = store.completedQuests.length;
    lastProgressTick = tick;
    currentQuest = store.currentQuestKey;
    questStartTick = tick;
    if (!quiet) {
      const r = rows[rows.length - 1];
      process.stderr.write(
        `  ✓ ${pad(r.key, 22)} t=${pad(fmt(r.tick), 9, true)}  (+${fmt(r.ticks)})  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`
      );
    }
    if (until && store.completedQuests.includes(until)) break;
    if (store.currentQuestKey === null) break; // questline complete
  }

  if (tick - lastProgressTick > STALL_TICKS) {
    stalled = `no quest completed for ${STALL_TICKS} ticks while on "${currentQuest}"`;
    break;
  }

  if (!quiet && tick > 0 && tick % 5000 === 0) {
    process.stderr.write(
      `    · t=${pad(fmt(tick), 9, true)}  on ${pad(currentQuest ?? "-", 20)}` +
      ` queue=${pad(store.buildQueue.length, 5, true)}` +
      ` metal=${pad(fmt(store.metal), 9, true)}` +
      ` ${((Date.now() - t0) / 1000).toFixed(1)}s\n`
    );
  }
}

// ---------------------------------------------------------------------------
// report

const W = [22, 9, 9, 8, 8, 7, 11, 11];
const head = ["quest", "ticks", "Δticks", "wall", "year", "temp K", "metal", "replicas"];
console.log("\n" + head.map((h, i) => pad(h, W[i], i > 0)).join("  "));
console.log(W.map((w) => "─".repeat(w)).join("  "));

for (const r of rows) {
  console.log([
    pad(r.key, W[0]),
    pad(fmt(r.tick), W[1], true),
    pad(fmt(r.ticks), W[2], true),
    pad(secs(r.tick), W[3], true),
    pad(r.year, W[4], true),
    pad(r.temp.toFixed(1), W[5], true),
    pad(fmt(r.metal), W[6], true),
    pad(fmt(r.replicas), W[7], true),
  ].join("  "));
}

const doneKeys = new Set(rows.map((r) => r.key));
const missing = ALL_QUESTS.filter((k) => !doneKeys.has(k));

console.log("");
console.log(`completed ${rows.length}/${ALL_QUESTS.length} quests in ${fmt(tick)} ticks (${secs(tick)} of wall-clock play)`);
if (stalled) console.log(`STALLED — ${stalled}`);
else if (tick >= maxTicks) console.log(`hit the --ticks ${fmt(maxTicks)} budget`);
if (missing.length) console.log(`not reached: ${missing.join(", ")}`);

if (showActions) {
  console.log("\naction histogram by quest");
  for (const [q, m] of actionCounts) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const parts = [...m.entries()].sort((a, b) => b[1] - a[1])
      .map(([a, n]) => `${a}×${n}`).join("  ");
    console.log(`  ${pad(q, 22)} ${pad(total, 8, true)}   ${parts}`);
  }
}

process.exit(stalled ? 1 : 0);
