# CLAUDE.md

## What this is

**Absolute Zero Chill** is a *Universal Paperclips*-style incremental/idle game about
a **misaligned AI told to "stop global warming"**. It pursues the directive to
catastrophic extremes: dim the Sun, freeze and mind-scan humanity, disassemble the
planets, relocate Earth to Sagittarius A\*, chase absolute zero. Dark, deadpan,
satirical; understated horror played straight.

Stack: React 18 + MobX 6 + Vite + Vitest, plain JS/JSX (no TypeScript). The shipped
artifact is one self-contained `dist/index.html`. See `README.md` for build commands
and a per-file layout.

## Working rules

- **Old save files:** do not spend effort supporting them. The game is live on a
  website but unannounced, so breaking saves is fine unless the user says otherwise.
- **Verify before writing.** Read the actual code; `config.js` has non-obvious
  structure and assumptions bite.
- **Tests:** default to `npm test` (~3s, Node only, skips `*.dom.test.*`). Run
  `npm run test:all` (~5s, adds the jsdom tests + a headless autoplay run) when you
  touch DOM-mount behavior or game balance.
  - A jsdom test needs BOTH the `.dom.test.jsx` name AND a
    `// @vitest-environment jsdom` first line. The name keeps it out of the fast
    suite; the comment is what actually switches the environment.
  - Timer-driven components: use `vi.useFakeTimers()`, never real sleeps.
  - Most component tests render via `renderToString` in Node; no DOM needed.
- **Balance check:** `npm run test:autoplay` plays the whole questline headlessly
  with `src/autoplayer.js` and fails if it doesn't finish by tick 5,000.
  `scripts/quest_trace.mjs` prints each quest change along the way.
- Most modules have a `*.TODO.md` beside them: review notes and known debt.
  Design and story notes live in `doc/`.

## Gotchas

- ⚠️ **`src/building_power.json` is generated.** `scripts/gen_mine_table.mjs`
  rewrites it from scratch (mines + solar/Dyson collectors only) on every run, and
  also rewrites `doc/MINE.md`. Anything hand-added to the JSON is silently wiped.
  For a non-mine building, set `powerUsage` inline in `config.js` with
  `powerUsageFromKw()` (private to config.js) or the exported `powerUsageFromW()`.
- `src/galaxy/lut.js` is a baked table whose generator is NOT in the repo.
- `config.js` is pure static data. `BODIES` starts with the belt entry, then
  appends `MOON_BODIES`, `ROCKY_BODIES`, `GIANT_BODIES`; each body gets a `tier`
  (`belt`/`moon`/`rocky`/`giant`).
- `src/shared/` is a pure leaf layer that imports nothing from store/config, so
  `config.js` can import `shared/model.js` without a cycle.

## Store (`src/store.js`)

- MobX via `makeAutoObservable`, **not** strict-action mode, so tests mutate fields
  directly. `createStore()` makes a fresh store; `store` is the live singleton.
- `STATE_KEYS` is what gets persisted. Save/load: `serialize` / `saveText` /
  `loadSave` / `loadSnapshot`. Autosave goes to localStorage (`zchill.autosave`).
- `tick(dt)` runs every 200ms (`TICK_MS`). At ×1 Framejack each tick is one
  game-day. ×1 is the only speed until the first Framejack tech, which requires
  Interstellar Probing.
- `buildingMax(id)` is a method: `buildingMaxOverrides[id]` if set, else the config
  max. Quests raise the overrides (Shade Panel 1 → 5 → 1000, Scanner → 50,000).
- Debug hooks: `window.gameStore` and `window.makeGameStore`. Five clicks on the
  Sun toggle the dev toolbar (profiling, autoplay, "Unlock all Framejack").

## Reveal/enable (`src/milestones.js`)

- Every building/tech/idea has a `revealWhen` (card appears) and `enableWhen`
  (actionable) predicate over `{ built, researched, realized, completed, flags }`.
  They are **derived** from each node's `requires` + `revealKey` (a node can declare
  them explicitly to override).
- Results live in six observable maps on the store ({buildings, techs, ideas} ×
  {Revealed, Enabled}). The visibility getters (`techVisible`, `buildingUnlocked`,
  …) are O(1) reads of those maps, not graph walks.
- Producers push the maps forward with `notify(key)`: `unpack`/`resolveBuilds` on
  0→1, `finishTechIfDone`, `finishIdeaIfDone`, `addCompletedQuest`, `setFlag`.
- `initMilestones` rebuilds everything (at createStore and after every load);
  `healMilestones` self-heals every 300 ticks. Tests that poke state directly and
  skip the producers should call `store.reconcileMilestones()`.
- milestones.js imports config only, never the store.

## Story and quests

- **Event engine:** `store.runOneEventCheck()` round-robins across all chains
  (`ALL_NEWS_CHAINS` from news.js + `STORY_CHAIN` from story.js), checking ONE chain
  head per tick. A chain item is `{ key, test(s), action(s) }`; the chain parks on
  an item until its `test` passes, then runs `action` and moves on. With N chains
  each is checked about every N ticks.
- **`src/quests.js`** is the main questline, one linear chain of 22 quests. A quest
  is `{ key, questName, todoList: [{ desc, test }], onComplete?, onLoadedSave? }`.
  `generateStoryChain` turns each into a chain item: it passes when every todo
  passes, then runs `onComplete`, calls `addCompletedQuest` (which drives
  quest-gated reveals), and advances to the next quest. `onLoadedSave` replays
  non-persisted effects on load.
- **`src/story.js`** is now just the optional Framejack side chain plus
  `STORY_CHAIN = [MAIN_STORY_CHAIN, FRAMEJACK_CHAIN]`.

## Story arc: two act numberings

The code uses two numberings for the same arc. **The player sees the Header's**;
the quest keys use an internal one. `doc/act_*.md` mixes them (act_3.md files
the frontier under Act III like the Header, but act_2.md covers Philosophy, which
the Header calls Act III), so ask if an "Act N" reference is ambiguous.

| Quest keys (`quests.js`) | Quests | Header (`Header.jsx`) |
|---|---|---|
| Act 1A | Initialize, Unpack, Grow, Shade | Act I — The Asteroid Belt |
| Act 1B | Scan, Simulate, Ark | Act I — The Asteroid Belt |
| Act 2A | Reverse, Cold, Snowball, Needle | Act II — The Human Question (from `revealed.defense`) |
| Act 2B | Prime, Stellaser, Launch, Harvest, Beam, Brain | Act III — Into the Galaxy (from Interstellar Probing) |
| Act 3 | Seed, Sail, Arrive, Black Eye, Absolute Zero | Act III — Into the Galaxy; "Absolute Zero" once `cmbrDefeated` |

- **Act I:** mine the belt, then **Shade Panels** dim the Sun to cool Earth. The
  cortical-scan subplot: **Discreet Neural Scanner → User Matrix → L2 Ark of Terra**
  ("re-instantiate the user"). The Ark quest also requires a fully scanned Earth
  (`scanFrac >= 1`).
- **Act II:** cooling past pre-industrial; humans freeze; defense; tapping Earth's
  core heat.
- **Act III:** the interstellar frontier (probes, harvest, mass drivers), the Sol
  Matrioshka **Brain** + Philosophy/Insight, galactic logistics, relocation to
  Sgr A\*, the absolute-zero finale.
