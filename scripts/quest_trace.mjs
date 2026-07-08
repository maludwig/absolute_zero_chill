// quest_trace.mjs — drive the autoplayer for N ticks and print the quest each
// time it changes.
//
//   node scripts/quest_trace.mjs
//   node scripts/quest_trace.mjs --ticks=5000
//
// One iteration = one autoplayer.play() followed by one store.tick(DT), matching
// App.jsx's heartbeat. Unlike autoplay_bench.mjs this reports on currentQuestKey
// *changing* (so the starting quest is line 0) rather than on quest completion,
// and it doesn't model modal pausing — it's the plain loop, nothing more.

import { createStore } from "../src/store.js";
import { autoplayer } from "../src/autoplayer.js";

const DT = 0.2; // seconds per tick, matching App.jsx

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const ticks = Number(args.ticks ?? 1000);

const store = createStore();
let prev = store.currentQuestKey;

const report = (i, key) => console.log(String(i).padStart(6) + "  " + (key ?? "(questline complete)"));

report(0, prev); // starting quest

for (let i = 1; i <= ticks; i++) {
  autoplayer.play(store);
  store.tick(DT);

  const key = store.currentQuestKey;
  if (key !== prev) {
    report(i, key);
    prev = key;
  }
}

console.log(`\nran ${ticks} ticks; ended on ${store.currentQuestKey ?? "(questline complete)"}`);
