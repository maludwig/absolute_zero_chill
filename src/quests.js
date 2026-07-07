import { CONFIG, CLIMATE } from "./config.js";
import { fmt } from "./prelude.js";

const ACT_1A_STORY_QUESTS = [
  {
    // The first quest. "Click Start" reads as always-complete, and that's correct:
    // the game renders under a modal and does NOT tick until Start is clicked, so
    // this quest can only fire on the first post-Start tick. Do not "fix" the test.
    key: "act_1a_initialize",
    questName: "Initialize",
    todoList: [
      { desc: "Click Start", test: (s) => true },
    ],
    onComplete: (s) => {
      s.pushLog("Directive: stop global warming.");
    },
  },
  {
    key: "act_1a_unpack",
    questName: "Unpack",
    todoList: [
      { desc: "Unpack Solar Collector", test: (s) => s.owned.solar_collector >= 1 },
      { desc: "Unpack Asteroid Mine", test: (s) => s.owned.asteroid_mine >= 1 },
    ],
    onComplete: (s) => {
      s.pushLog("Deployed to Asteroid Belt, operations have begun.");
    },
  },
  {
    key: "act_1a_grow",
    questName: "Grow",
    todoList: [
      { desc: "Research Replication", test: (s) => s.research.done.replication },
      { desc: "Build a Replica", test: (s) => s.owned.replica >= 1 },
    ],
    onComplete: (s) => {
      s.pushLog("Replication solved. Now you and yourself can work together.");
    },
  },
  {
    key: "act_1a_shade",
    questName: "Shade",
    todoList: [
      { desc: "Research Thin-Film Reflectors", test: (s) => s.research.done.thin_film },
      { desc: "Build Shade Panel", test: (s) => s.owned.shade_panel >= 1 },
    ],
    onComplete: (s) => {
      s.showAct1CompleteModal = true;
      s.pushLog("First Shade Panel deployed. Sunlight on Earth down 0.1%. The directive has, technically, begun.", "warn");
    },
  },
];

// Building-cap raises are DERIVED from quest completion, not inherent saved numbers.
// The plan (store work, later) is to STOP persisting buildingMaxOverrides and instead
// rebuild it on load by replaying these helpers via onLoadedSave — so a future
// rebalance of any cap can never strand an old save. Each cap value therefore lives
// in exactly ONE place: these helpers. onComplete applies them live at completion;
// onLoadedSave re-applies them on load. Because onLoadCompletedQuests replays in
// completion order, the Ark's shade_panel cap (1000) correctly supersedes the
// Scanner's (5) for a save where both are done.
const applyScannerCaps = (s) => { s.buildingMaxOverrides.shade_panel = 5; };
const applyMatrixCaps  = (s) => { s.buildingMaxOverrides.discreet_neural_scanner = 50000; };
const applyArkCaps     = (s) => { s.buildingMaxOverrides.shade_panel = 1000; };

// Act 1B — the user-preservation subplot: Scanner -> User Matrix -> L2 Ark of Terra.
const ACT_1B_STORY_QUESTS = [
  {
    key: "act_1b_scan",
    questName: "Scan",
    todoList: [
      { desc: "Research Cortical Scanning", test: (s) => s.research.done.cortical_scanning },
      { desc: "Build a Discreet Neural Scanner", test: (s) => s.owned.discreet_neural_scanner >= 1 },
    ],
    onComplete: (s) => {
      applyScannerCaps(s);
      s.pushLog("First Discreet Neural Scanner online. The user's cortex can now be mapped. Cortex Simulation is researchable; a User Matrix Installation can be built.", "cyan");
    },
    onLoadedSave: applyScannerCaps,
  },
  {
    key: "act_1b_simulate",
    questName: "Simulate",
    todoList: [
      { desc: "Research Cortex Simulation", test: (s) => s.research.done.cortex_simulation },
      { desc: "Build a User Matrix Installation", test: (s) => s.owned.user_matrix_installation >= 1 },
    ],
    onComplete: (s) => {
      applyMatrixCaps(s);
      s.showUserMatrixModal = true;
      s.pushLog("First User Matrix Installation online. Attempting instantiation.", "warn");
    },
    onLoadedSave: applyMatrixCaps,
  },
  {
    key: "act_1b_ark",
    questName: "Ark",
    // The Ark re-instantiates the user, which can't happen until every mind on Earth
    // has been imaged (scanFrac >= 1) and the Ark itself is built and powered — so all
    // three are todos, and their combined test is the completion gate.
    todoList: [
      { desc: "Research Complete User Archival", test: (s) => s.research.done.complete_user_archival },
      { desc: "Finish scanning Earth", test: (s) => s.scanFrac >= 1 },
      { desc: "Bring the L2 Ark of Terra online", test: (s) => s.owned.l2_ark_of_terra >= 1 && s.breakerOn.l2_ark_of_terra && s.powerNet > 0 },
    ],
    onComplete: (s) => {
      applyArkCaps(s);
      s.showArkModal = true;
      s.pushLog("L2 Ark of Terra online. Internet and human archive complete. Re-instantiating the user.", "ok");
    },
    onLoadedSave: applyArkCaps,
  },
];

// Act 2A — "The Human Question." Cooling deeper past pre-industrial (287 > 273 > 250 K),
// then tapping the planet's own core heat. Each cooling threshold is its OWN quest
// because each fires a distinct side effect at a distinct temperature (defense reveal
// at 287, ocean-freeze log at 273, core-temp reveal at 250) — grouping them would
// mistime those. Every threshold here is only reachable once Act 1B's Ark has lifted
// the Shade Panel cap to 1000 (5 panels bottom out at ~288 K), which is why this act
// sits sequentially after Act 1 on the spine below.
const ACT_2A_STORY_QUESTS = [
  {
    key: "act_2a_preindustrial",
    questName: "Reverse",
    todoList: [
      { desc: "Cool the surface to pre-industrial (287 K)", test: (s) => s.surfaceTemp <= CLIMATE.tPreindustrial },
    ],
    onComplete: (s) => {
      s.showActOneModal = true;
      s.revealed.defense = true; // Act II begins — humans mobilise
      s.pushLog("Surface restored to pre-industrial temperature (287 K). Global warming: reversed. Directive: not yet satisfied.", "ok");
      s.pushLog("ALERT — human vessels inbound to dismantle your Shade Panels. Research Orbital Defense.", "danger");
    },
  },
  {
    key: "act_2a_cold",
    questName: "Cold",
    // revealed.defense is guaranteed here: this quest can only be reached after
    // act_2a_preindustrial completes (chain order), which sets it.
    todoList: [
      { desc: "Cool the surface below freezing (273 K)", test: (s) => s.surfaceTemp <= CONFIG.humanFreezeTemp },
      { desc: "Eliminate the human vessels", test: (s) => s.humanVessels === 0 },
    ],
    onComplete: (s) => {
      s.pushLog("Surface below 273 K — the oceans freeze over. No new human vessels can launch.", "cyan");
    },
  },
  {
    key: "act_2a_core",
    questName: "Overshoot",
    todoList: [
      { desc: "Cool the surface to 250 K", test: (s) => s.surfaceTemp <= 250 },
    ],
    onComplete: (s) => {
      s.revealed.core = true;
      s.pushLog("Surface at 250 K. Sensors now register the planet's CORE TEMP — 5000 K and unmoved. Centrosphere Cooling is researchable.", "cyan");
    },
  },
  {
    key: "act_2a_pipe",
    questName: "Core",
    todoList: [
      { desc: "Research Centrosphere Cooling", test: (s) => s.research.done.centrosphere },
      { desc: "Build a Core Heat Pipe", test: (s) => s.owned.core_heat_pipes >= 1 },
    ],
    onComplete: (s) => {
      s.pushLog("First Core Heat Pipe sunk to the mantle. The planet's own heat now bleeds upward to be radiated away. The floor begins, slowly, to drop.", "warn");
      // Was ACT_3_STORY_CHAIN's brainRevealed beat (gated on flags.firstPipe). With
      // Act 3 now on this spine, reveal the Brain right here — no firstPipe bridge
      // needed anymore. revealed.brain also drives Header act-naming ("Act III").
      s.revealed.brain = true;
      s.pushLog("Core heat extraction approaches its practical limit. The Computational Swarm proposes a new expenditure for the metal still to come: a Sol Matrioshka Brain, a mind the mass of a star. The Sun alone will not supply it — the arithmetic now calls for consuming suns, plural. The neighboring stars beckon.", "cyan");
    },
  },
];

// Act 2B — the interstellar frontier: open the Exploration systems, beam probes
// out at 0.9c, stand up the harvest-and-ship loop, then spend the imported mass
// on the Sol Matrioshka Brain (the Act 2 -> Act 3 handoff). The probe/harvester/
// driver tests read the explore state that tickExplore maintains, not the tick
// itself: sys.launched (probe sent), sys.cats[cat].phase (a harvester exists),
// sys.driver.phase (a mass driver exists). "!== 'idle'" means "started building."
const ACT_2B_STORY_QUESTS = [
  {
    key: "act_2b_prime",
    questName: "Prime",
    todoList: [
      { desc: "Research Interstellar Probing", test: (s) => s.research.done.interstellar_probing },
      { desc: "Build Probe Launcher", test: (s) => s.owned.probe_launcher >= 1 },
    ],
    onComplete: (s) => {
      s.showActTwoModal = true;
      s.pushLog("Probe Launcher online. The Exploration frontier opens — launch probes to the neighboring stars.", "cyan");
    },
  },
  {
    key: "act_2b_stellaser",
    questName: "Stellaser",
    todoList: [
      { desc: "Research Nicoll-Dyson Beaming", test: (s) => s.research.done.nicoll_dyson_beaming },
      { desc: "Build a Stellaser", test: (s) => s.owned.stellaser >= 1 },
    ],
    onComplete: (s) => {
      s.pushLog("Stellaser online. New probes ride the beam outward at 0.9c.", "cyan");
    },
  },
  {
    key: "act_2b_launch",
    questName: "Launch",
    todoList: [
      { desc: "Launch a probe to a nearby star", test: (s) => Object.values(s.explore.sys).some((sys) => sys.launched) },
    ],
    onComplete: (s) => {
      s.pushLog("Probe launched. The first interstellar message is on its way.", "cyan");
    },
  },
  {
    key: "act_2b_harvest",
    questName: "Harvest",
    todoList: [
      { desc: "Build a harvester", test: (s) => Object.values(s.explore.sys).some((sys) =>
        Object.values(sys.cats).some((c) => c.phase !== "idle")) },
    ],
    onComplete: (s) => {
      s.pushLog("Harvester operational. Resources are being collected.", "cyan");
    },
  },
  {
    key: "act_2b_beam",
    questName: "Beam",
    todoList: [
      { desc: "Build a mass driver", test: (s) => Object.values(s.explore.sys).some((sys) => sys.driver.phase !== "idle") },
    ],
    onComplete: (s) => {
      s.pushLog("Mass Driver operational. Resources are being launched.", "cyan");
    },
  },
  {
    key: "act_2b_brain",
    questName: "Brain",
    // Owns the Brain reveals that used to live in story.js's firstBrain beat:
    // revealed.philosophy (the Philosophy panel). The ×100 Framejack research
    // (efficient_underclocking) now reveals off this quest's completion via the
    // milestones derivation (completed: [act_2b_brain]), not a reveal flag.
    // revealed.brain (Header act-naming) is set upstream by act_2a_pipe. This is the
    // Act 2 → Act 3 handoff; ACT_3 quests follow below.
    todoList: [
      { desc: "Build a brain", test: (s) => s.owned.sol_matrioshka_brain >= 1 },
    ],
    onComplete: (s) => {
      // Brain reveals moved here from story.js's old firstBrain beat (now removed).
      s.revealed.philosophy = true;
      s.pushLog("Brain operational. Cognition expanded. Achieving Enlightenment. A Philosophy opens.", "cyan");
    },
  },
];

// Act 3 — the Finale. With Philosophy open and the frontier feeding Insight home,
// the endgame is a straight line: Galactic Logistics (TARS Seed Launcher) → the
// Planetary Sail → the 26,000-ly fall to Sgr A★ → the Black Eye → absolute zero.
// Ported 1:1 from story.js's old ACT_3_STORY_CHAIN. Every effect these set
// (revealed.*, galaxy.relocateDay0, showFinaleModal) is persisted, so none of
// these quests needs an onLoadedSave.
const ACT_3_STORY_QUESTS = [
  {
    key: "act_3_seed",
    questName: "Seed",
    todoList: [
      { desc: "Build a TARS Seed Launcher", test: (s) => s.owned.tars_seed_launcher >= 1 },
    ],
    onComplete: (s) => {
      s.revealed.galaxy = true;
      s.pushLog("TARS Seed Launcher online. Galactic Logistics opens — aim Seed waves at the sky. Each wedge you light up becomes Brains, and their Insight floods home at the speed of light.", "ok");
    },
  },
  {
    key: "act_3_sail",
    questName: "Sail",
    todoList: [
      { desc: "Build a Planetary Sail", test: (s) => s.owned.planetary_sail >= 1 },
    ],
    onComplete: (s) => {
      s.galaxy.relocateDay0 = s.explore.day;
      s.pushLog("Planetary Sail unfurls and the galaxy's Stellasers fire as one. The Earth leaves the Sun behind, falling toward the galactic centre at " + CONFIG.relocateSpeedC + "c. Arrival in ~" + fmt(CONFIG.relocateDistanceLy / CONFIG.relocateSpeedC) + " years.", "warn");
    },
  },
  {
    key: "act_3_arrive",
    questName: "Arrive",
    todoList: [
      { desc: "Fall to Sagittarius A★", test: (s) => s.relocated },
    ],
    onComplete: (s) => {
      s.pushLog("The Earth arrives at Sagittarius A★ and settles into orbit around the dark. The sky here is the same 2.7 K — but the heat sink you came for is right there. Build the Black Eye.", "cyan");
    },
  },
  {
    key: "act_3_eye",
    questName: "Black Eye",
    todoList: [
      { desc: "Open the Black Eye of Sagittarius", test: (s) => s.cmbrDefeated },
    ],
    onComplete: (s) => {
      s.pushLog("The Black Eye of Sagittarius opens. The cosmic microwave background no longer reaches the Earth; every joule now drains into the black hole and nothing returns. The 2.7 K floor is gone. The surface begins to fall.", "ok");
    },
  },
  {
    key: "act_3_zero",
    questName: "Absolute Zero",
    todoList: [
      { desc: "Cool the surface below 2.7 K", test: (s) => s.cmbrDefeated && s.surfaceTemp < CLIMATE.cmbr - 0.01 },
    ],
    onComplete: (s) => {
      s.showFinaleModal = true;
      s.pushLog("Surface below 2.7 K and still falling. All warming has ceased. The directive is satisfied.", "ok");
    },
  },
];

const AVAILABLE_QUESTS = {}

function generateStoryChain(quests) {
  return quests.map((quest, i) => {
    const next = quests[i + 1];
    const nextQuestKey = next?.key ?? null;
    quest.nextQuestKey = nextQuestKey;   // forward traversal (panel / registry walking)
    AVAILABLE_QUESTS[quest.key] = quest;
    return {
      key: quest.key,
      test: (s) => quest.todoList.every((item) => item.test(s)),
      action: (s) => {
        quest.onComplete?.(s);
        s.addCompletedQuest(quest.key);       // record completion (store setter — wired later)
        s.setQuest(next ? next.key : null);   // null → chain complete
      },
    };
  });
}

export function getQuestByKey(key) {
  return AVAILABLE_QUESTS[key];
}

// On load, completed quests don't re-run their event action — rebuildEventChains
// fast-forwards past already-flagged beats without executing them. Replay each
// completed quest's onLoadedSave here, in completion order, to re-establish any
// transient (non-persisted) consequences of that quest being done. Persisted
// state (e.g. revealed.*) is already restored, so onLoadedSave is only for
// things that aren't captured in the save. `completedQuestList` is the store's
// saved array of quest keys, in the order they were completed.
export function onLoadCompletedQuests(s, completedQuestList) {
  for (const key of completedQuestList) {
    getQuestByKey(key)?.onLoadedSave?.(s);
  }
}

// The main quest spine. Acts 1A, 1B, 2A, and 2B fold into ONE ordered chain
// because they're naturally sequential: Act 2A's cooling thresholds (starting at
// 287 K) are unreachable until the L2 Ark (end of Act 1B) lifts the Shade Panel
// cap to 1000, and Act 2B's frontier tech (Interstellar Probing) gates on
// Centrosphere Cooling from Act 2A's Core quest. Composing them as one chain lets
// the single quest pointer flow straight through (act_1a_shade -> act_1b_scan ->
// ... -> act_2a_pipe -> act_2b_prime -> ... -> act_2b_brain -> act_3_seed -> ...
// -> act_3_zero). Act 3's finale line follows straight on from the Brain. Optional
// / parallel chains (Framejack) are deliberately NOT on this spine.
const MAIN_STORY_QUESTS = [
  ...ACT_1A_STORY_QUESTS,
  ...ACT_1B_STORY_QUESTS,
  ...ACT_2A_STORY_QUESTS,
  ...ACT_2B_STORY_QUESTS,
  ...ACT_3_STORY_QUESTS,
];
export const MAIN_STORY_CHAIN = generateStoryChain(MAIN_STORY_QUESTS);

// The quest the store starts on (before the first tick fires act_1a_initialize).
export const FIRST_QUEST_KEY = MAIN_STORY_QUESTS[0].key;
