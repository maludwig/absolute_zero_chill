# CHANGES

A log of completed work on this project, in roughly chronological order. Open/pending items live in `TODO.md` instead.

## Test suite health

**`src/components/Catalog.test.jsx`, `Header.test.jsx`, `Philosophy.test.jsx`, `BuildQueue.test.jsx`, `Exploration.test.jsx`, `GalacticLogistics.test.jsx`**
Tests were mutating MobX observables directly instead of going through an `action`, which only warned because MobX's strict mode was on. Wrapped every direct store mutation in these six files with `runInAction(() => { ... })` (imported from `mobx`). No more strict-mode warnings.

**`src/components/ChatModal.test.jsx`, `Modal.test.jsx`**
Fixed the repeated `Warning: The current testing environment is not configured to support act(...)`. Root cause was `globalThis.IS_REACT_ACT_ENVIRONMENT` never being set — React 18 checks that flag before letting `act()` batch updates quietly, and vitest doesn't set it for you. Added `test-setup.js` (`globalThis.IS_REACT_ACT_ENVIRONMENT = true`) and wired it into both `vitest.config.js` and `vitest.fast.config.js` via `setupFiles`.

Side effect of fixing the above: with the act-environment flag now correctly set, React started surfacing *real* "update not wrapped in act(...)" warnings in `src/components/SaveLoad.dom.test.jsx` and `src/main.dom.test.jsx` that had previously been masked by the misconfigured-environment warning. Fixed both: `SaveLoad.dom.test.jsx` now mounts/unmounts via `act()` instead of `flushSync`, and the async file-load interaction is wrapped in `await act(async () => { ... })`; `main.dom.test.jsx` wraps both the dynamic `import("./main.jsx")` (which triggers the initial render at module-eval time) and the settle-timeout in `act()`. Full suite is warning-free.

## Story content: the User Matrix / Ark arc

**`src/story/chats.json`, `src/store.js`, `src/components/Modal.jsx`, `src/components/App.jsx`, `src/config.js`**
Added the `user_matrix_online` chat (failed first instantiation → void → panic → termination → "Complete User Archival" plan), wired to a `showUserMatrixModal` flag that fires on the first `user_matrix_installation` built, and added `TECHS.complete_user_archival` + `BUILDINGS.l2_ark_of_terra` (10,000,000 metal, max 1) to match.

**`src/story/chats.json`, `src/store.js`, `src/components/Modal.jsx`, `src/components/App.jsx`**
Added the `ark_online` chat (successful second instantiation of the user into a reconstructed, populated world; the user is distracted/casual and doesn't notice anything's different), wired the same way: `showArkModal` / `dismissArkModal`, triggered on the first `l2_ark_of_terra` built.

**`src/config.js`, `src/store.js`**
Locked `lunar_mass_drivers`, `duplication`, and `mega_processing` behind a new `revealed.l2_ark_of_terra_built` flag (set the first time an L2 Ark of Terra is built), same mechanism as the existing `shade_panel_built`/`discreet_neural_scanner_built` gates. Big pacing change — these three were previously mid-game techs (moon mining tier, ×2/×1M batch buttons), now gated behind one of the very last buildings in the content that existed at the time.

**`src/config.js`, `src/store.js`, `src/components/Catalog.jsx`** *(superseded later — see "Story chains" section below)*
First pass at a story-gated Shade Panel cap: config's static `max` set to 1, with `store.buildingMax(id)` special-casing `shade_panel` to return 10 once `revealed.user_matrix_chat_seen` was set (i.e. once the `user_matrix_online` chat was dismissed). This mechanism was later replaced entirely by the generic `buildingMaxOverrides` system described below.

**`src/config.js` — bug fix**
`user_matrix_installation` had `requires: []` — it was only ever gated by the `discreet_neural_scanner_built` reveal flag, not by the `cortex_simulation` tech actually being researched (a real bug from when it was first added). Fixed: `requires: ["cortex_simulation"]`. Also added `max: 1` to both `discreet_neural_scanner` and `user_matrix_installation` (unique buildings).

**`src/config.js`**
Added `powerDraw` to `discreet_neural_scanner` (100 MW = 1.0e5 kW), `user_matrix_installation` (5 MW = 5.0e3 kW), and `l2_ark_of_terra` (8.1e9 × 5 MW = 4.05e13 kW). This makes all three grid buildings — they now get a breaker toggle and count against `powerDraw`.

## Bug fixes

**`css/style.css`, `src/components/Catalog.jsx`**
Added `.card.pw-off` (red border + tinted background), applied to a building card's outer `<div>` whenever it's a grid building with at least one built and its breaker is switched off. Previously the only cue was the small `brk-switch`/`brk-lbl` toggle in the card header. Named it `pw-off` rather than a bare `off` to avoid ambiguity with the existing `.brk-switch.off`/`.brk-lbl.off` (different, narrower-scoped) classes.

**`src/store.js`, `src/store.test.js` — bug fix**
Asteroid Mine (and every other mine) kept producing metal while its breaker was off. `metalPerSec` and the `tick()` mining loop both only checked owned count and remaining body mass — never `breakerOn`. Added a `breakerOn` check to both. Only `asteroid_mine` (and `solar_collector`, which doesn't mine) currently have real power draw/gen, so this mainly matters for the belt, but the fix is generic across all `BODIES` mine ids in case a later tier gets a power cost too.

Fixing this exposed that the existing "framejack: one big step == N small steps" test unknowingly relied on mining being power-independent: its setup owned 5 Asteroid Mines with zero generation, so the grid was always going to trip. Fixed the test by giving its setup `solar_collector = 2` so the breaker never trips, and added a regression test ("stops producing metal once its breaker is switched off") for the actual bug.

**`src/components/ChatModal.jsx` — bug fix**
The final auto-scroll never fired. The scroll-to-bottom effect only depended on `[revealed]`, but when the *last* message in a chat finishes, `revealed` doesn't change — only `lastMsgDone` flips. So the tail of a long final message, and the just-appeared START button, never got scrolled into view. Added `lastMsgDone` to the effect's dependency array.

## The shared events engine (news + story milestones)

**`src/news.js`, `src/store.js`, `css/style.css`**
New ambient "news ticker" subsystem: `src/news.js` holds named, ordered chains (`CLIMATE_NEWS_CHAIN`, `PROBE_NEWS_CHAIN`, `DEFENSE_NEWS_CHAIN`, combined into `ALL_NEWS_CHAINS`) of `{ key, test(s), action(s) }`. `store.runOneEventCheck()` checks only the head of one chain per tick, round-robin — O(1) per tick regardless of how much news content exists, and self-pruning (emptied chains are swap-removed).

`eventChains`/`eventChainIdx` are intentionally *not* persisted (they hold live function refs, which can't survive JSON) — `store.rebuildEventChains(sourceChains = ALL_EVENT_CHAINS)` rebuilds them from the static source on every store creation and again after `loadSnapshot()`, trimming any prefix of each chain whose `key` is already in the (persisted) `flags` object. `rebuildEventChains` takes its source chains as an optional param purely so tests can inject fake chains — production call sites don't pass anything.

Added `store.addNews(msg)` (thin wrapper over `pushLog(msg, "news")`) and a `.logline.news` CSS rule (dim, italic) to visually separate flavor news from system/milestone log lines.

**`src/story.js`, `src/news.js`, `src/config.js`, `src/store.js`, `src/store.test.js`**
Migrated the old `checkMilestones()` single-condition checks (Replication, Shade Panel, Kardashev, the Brain, the Finale, etc.) into `story.js`, running through the same shared events engine as news, throttled to once every `EVENT_CHECK_EVERY_N_TICKS` (10) real `tick()` calls rather than every tick. Went through several rounds of tracing `config.js`'s actual `requires`/`revealKey` chains to find genuine branch points before merging anything, since forcing a false total order risks a later, functionally-important reveal getting silently stuck behind an earlier item the player hasn't triggered — a real soft-lock, not just a mis-ordered log line.

Current shape:
- **`ACT_1_STORY_CHAIN`** (flat, fully linear): `repl → firstReplica → film → firstPanel → firstScanner → firstUserMatrix → firstArk`. Thin-Film now requires the first Replica (`revealKey: "first_replica_built"`, added to `config.js`) — that gate didn't exist before. Also where the Shade Panel cap now lives: starts at 1 (`config.js`'s base `max`), raised to 5 by `firstScanner`'s action, raised to 1000 by `firstArk`'s action, via a generic `store.buildingMaxOverrides` map (persisted plain data) — this replaced the earlier hardcoded-per-building special case in `buildingMax()`. Verified 5 panels' equilibrium (~288.14 K) sits safely above the 287 K pre-industrial threshold, so the mid-stage cap can't accidentally trigger Act II early.
- **`ACT_2A_STORY_CHAIN`**: `preindustrial → humansFrozen → coreRevealed → firstPipe`. Internally a strict nested-threshold sequence (287 > 273 > 250 K).
- **`KARDASHEV_CHAIN`** (`kardashev → firstLauncher → stellaser`): an independent, non-required branch off `fusion_spires`/the Ark.
- **`ACT_3_STORY_CHAIN`** (renamed from `BRAIN_TO_FINALE_CHAIN`): `brainRevealed → firstBrain → firstTars → firstSail → relocated → firstBlackEye → finale` — the actual critical path to the game's ending. `brainRevealed`'s entry condition changed from `owned.jupiter_spire >= 1` to `flags.firstPipe`, tying Act 2's cooling arc to Act 3 starting. Its log message was reworded accordingly (no longer claims "Jupiter Fusion Spire online") to: "Core heat extraction approaches its practical limit. The Computational Swarm proposes a new expenditure for the metal still to come: a Sol Matrioshka Brain, a mind the mass of a star. The Sun alone will not supply it — the arithmetic now calls for consuming suns, plural. The neighboring stars beckon." Note `firstBrain` still mechanically requires `jupiter_spire` built (`config.js`, unchanged) — no deadlock, just no longer literally announced by that building's completion.
- **`FRAMEJACK_CHAIN`** (`quantumCpu → planckRate`): kept separate from `ACT_3_STORY_CHAIN` because `quantum_cooled_cpu` requires an Idea that only unlocks after `firstBrain` — an earlier draft had this spliced in *before* `firstBrain` and would have deadlocked permanently; regression-tested against that specific mistake.
- **`firstGun`** moved entirely out of `story.js` into `news.js` as `DEFENSE_NEWS_CHAIN` — it had no downstream mechanical consequences, so it's flavor, not a story gate. Message changed to "Fleet under fire from unexpected massive space gun!" and now uses `addNews` instead of `pushLog`.

Six `store.test.js` tests needed updates to match the new chain shapes/dependencies (using new `runEvents`/`skipStoryFlags` test helpers). All fixed; full suite passing at 251/251 as of this writing.
