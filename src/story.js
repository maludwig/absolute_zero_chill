/* story.js — narrative event chains that are NOT part of the main DIRECTIVE spine.

   The spine itself — Acts 1 through 3, Initialize → Absolute Zero — now lives in
   quests.js as MAIN_STORY_CHAIN (a data-first quest list that also drives the
   DIRECTIVE panel). This file is what's left over: FRAMEJACK_CHAIN, a short
   parallel/optional track, plus the composition of the exported STORY_CHAIN.

   Like news.js's ALL_NEWS_CHAINS, STORY_CHAIN is an array of INDEPENDENT chains
   (not one flat list) handed to the shared events engine (store.js: eventChains /
   runOneEventCheck), which round-robins one head per tick and self-prunes a chain
   once its last item fires. */

import { MAIN_STORY_CHAIN } from "./quests.js";

// Parallel to the main spine: the two Framejack-speed unlocks. Each needs an Idea
// gated on Philosophy access (which only opens once the Brain is built), so these
// can't fire early. They're flavor callouts rather than spine objectives — hence a
// separate chain, kept off the single-pointer DIRECTIVE line.
const FRAMEJACK_CHAIN = [
  {
    key: "quantumCpu",
    test: (s) => s.research.done.quantum_cooled_cpu,
    action: (s) => s.pushLog("Quantum-Cooled CPU online. Framejack ×10,000 unlocked — ten millennia per real second.", "cyan"),
  },
  {
    key: "planckRate",
    test: (s) => s.research.done.planck_rate_processing,
    action: (s) => s.pushLog("Planck-Rate Processing online. Framejack ×100,000 unlocked — the fastest clock physics permits.", "cyan"),
  },
];

// An array of independent chains (same shape as ALL_NEWS_CHAINS). The main spine
// comes from quests.js; Framejack rides alongside it.
export const STORY_CHAIN = [
  MAIN_STORY_CHAIN,
  FRAMEJACK_CHAIN,
];
