# RESTART — read me first

Hello, future self. This is a hand-off note from a prior context window. The user
is the developer of this game and I'm their pair-programmer.

## Recommended start

- Unzip the project.
- npm install
- npm run test:all - Only do this once to verify the project is intact. Default `npm run test` is faster and sufficient for most work. See below.
- npm run build - Verify the build works and is a single inlined `dist/index.html`, present the file to the user as described below.

## What this is

**"Absolute Zero Chill"** — a *Universal Paperclips*-style incremental/idle game about a
**misaligned AI told to "stop global warming"** that pursues the directive to
catastrophic extremes (dim the Sun, freeze and mind-scan humanity, disassemble the
planets, relocate Earth to Sagittarius A\*, chase absolute zero). Dark, deadpan,
satirical. The tone is understated horror played straight.

Stack: **React 18 + MobX + Vite + Vitest**, plain JS/JSX (no TypeScript). The
shipped artifact is a **single self-contained `index.html`** via
`vite-plugin-singlefile`.

## Workflow the user expects (important)

- **Build and share a timestamped build on EVERY visual change.** The user's chat
  UI can't render unbuilt JSX, and they load saves to jump to mid/late game. Do:
  ```
  npm run build            # → dist/index.html (single inlined file)
  cp dist/index.html /home/claude/build_$(date -u +%Y-%m-%dT%H-%M-%S).html
  # then present_files that build_*.html
  ```
- **Save Files** The game is not yet deployed, when considering a change that breaks
  old save files, that's completely fine. Do not put any effort into supporting
  old save files, unless the user explicitly asks.
- **Share the full build only** — the user asked NOT to get previews or individual
  source files. Just the whole game (and, on request, the project zip), unless the
  user explicitly asks.
- **Tests:** default to `npm run test` (fast: node env, excludes `*.dom.test.*`).
  It still exercises component render via `renderToString` (App/Catalog/Resources/
  BuildQueue tests live here). Only reach for `npm run test:all` when you've touched
  real DOM-mount behavior (`main.dom.test.jsx`, `SaveLoad.dom.test.jsx`) — it's
  ~25s vs a couple seconds. Pure-render components don't need it.
- **Hand off the project:** `bash zip_project.sh -o /home/claude` → `game_<ts>.zip`
  (it safely excludes node_modules/.git/dist/coverage/.DS_Store). The user gets
  frustrated if we double check the node_modules exclusion. The script is fine.
- Verify before writing: read the actual code with `view`/`grep` — the config has
  non-obvious structure and I got bitten assuming things.
- If the user asks "Thoughts?" then they do not want me to edit the code, they
  want to discuss the subject. They appreciate critical feedback, and insightful
  feedback. The user wishes to have a quick response, and dislikes long investigations
  into the codebase when they ask for "Thoughts?" Making assumptions is OK.

## Layout / where things live

- `src/config.js` — **pure static data + a few pure helpers.** BODIES, BUILDINGS,
  TECHS, MULTS, IDEAS, CLIMATE, CORE, and tunable constants (SCAN_* dot curve,
  ASSIST_MAX_WORKLOAD, population/scan rates, etc.). BODIES are assembled from
  BELT + MOON_BODIES + ROCKY_BODIES + GIANT_BODIES; each body gets a `tier`
  (`belt`/`moon`/`rocky`/`giant`). Imports `power_helpers` and `shared/model`.
  - ⚠️ `src/building_power.json` is a **generated** file. `scripts/gen_mine_table.mjs`
    rewrites it **from scratch** (mines + solar/dyson collectors only) every run, so any
    key you hand-add there — e.g. a bespoke draw for a non-mine building — is **silently
    wiped** the next time the script runs. If a building needs a persistent LUT entry,
    add it *inside the generator* (not the JSON). Simplest of all: set `powerUsage`
    inline on the building in `config.js` via `powerUsageFromKw()` and skip the LUT
    entirely (that's what `construction_logistics` / `science_installation` do).
- `src/store.js` — the **MobX store** (`createStore`, `makeAutoObservable`, NOT
  strict-action mode, so tests mutate directly). `STATE_KEYS` = what's persisted.
  Save/load: `serialize` / `saveText` / `loadSave` / `loadSnapshot`. Key getters:
  `powerNet`, `powerFrac`, `scanFrac`, `buildQueueFrac`, `buildingMax`, `gameYear`,
  `humanPopulation`. Visibility getters (`techVisible`/`buildingVisible`/`ideaVisible`
  and `*Unlocked`) are **O(1) reads of the reveal/enable maps** (see milestones.js) —
  not requires-graph walks. Producers (`finishTechIfDone`, `finishIdeaIfDone`,
  `resolveBuilds`/`unpack` on 0→1, `addCompletedQuest`, `setFlag`) call `notify(key)`
  to push those maps forward; `reconcileMilestones()` force-rebuilds them (used by
  tests that poke state directly, bypassing the producers).
- `src/milestones.js` — **the reveal/enable notification system** (pure leaf; imports
  config, never the store). Each building/tech/idea has a `revealWhen` (card appears)
  and `enableWhen` (actionable) predicate over typed buckets `{ built, researched,
  realized, completed, flags }`. These are **derived once** from the existing
  `requires` + `revealKey` (a node may declare them explicitly to override). `isReady`
  tests a predicate; `notifyKeys` lists the notify keys a watcher registers under;
  `initMilestones` (re)builds the six observable maps + watcher registry (runs at
  createStore and after every load — also the reconciliation net); `healMilestones`
  is a light in-place self-heal run every ~300 ticks as insurance against a missed
  notify. **Enable is preserved exactly** vs the old getters; only reveal *timing*
  shifts (story-gated nodes reveal on their gate as a locked preview; tech-gated
  buildings reveal when the tech is researched rather than merely visible).
- `src/story.js` — **narrative event chains.** `STORY_CHAIN` is an ARRAY OF CHAINS
  (not flat); each item is `{ key, test(s), action(s) }`. A chain advances
  sequentially and PARKS on an item until its `test` passes — so gating an item
  gates everything downstream of the reveal flag its `action` sets.
- `src/quests.js` — the **main questline**, exported as `MAIN_STORY_CHAIN` (built by
  `generateStoryChain`). Each quest has a `key`, a `todoList` of tests, and an
  `onComplete(s)` action; completion calls `s.addCompletedQuest(key)`, which is what
  now drives reveals gated on that quest (via milestones.js — no more per-quest
  `revealed.*_complete` flags). The questline is linear; each quest can have multiple
  todos and arbitrary onComplete actions.
- `src/news.js` — ambient flavor chains (`ALL_NEWS_CHAINS`).
- `src/shared/` — **pure leaf layer, imports nothing from store/config.** `model.js`
  has the curve helpers `softExp` (convex, slow-start) / `softLog` (concave,
  front-loaded), harvest math, curve constants. `beams.js`, `model.test.js`, etc.
  Because it's a pure leaf, `config.js` importing from `shared/model.js` is cycle-free.
- `src/components/` — React (`observer`) UI. `App.jsx` composes the page inside
  `.wrap`. Notables: `StatusBar.jsx` (fixed top bar), `Resources.jsx` (live chips +
  `Depletions` bodies panel), `Catalog.jsx` (`BuildingCard` + buy buttons + queue),
  `BuildQueue.jsx`, `Header.jsx` (PowerWidget battery), `DevBar.jsx` (dev/profiler
  toolbar — hidden unless `store.devMode`; unlocked via the Sun easter egg in
  `Header.jsx`).
- `src/buildings/` — per-building `ConfigComponent`s, side-effect-registered onto
  `BUILDINGS[id].ConfigComponent` and rendered inside that building's card by
  `Catalog.jsx`. `ConstructionLogisticsConfig.jsx` (the build-loop editor) and
  `DiscreetScannerConfig.jsx` (the Earth-scan globe + readout, shown once a Scanner
  is owned — this is where the old `CorticalScanning.jsx` panel moved to).
- `src/earthScanner/` — the **Earth-scan globe visual.** `EarthScanner.jsx` (two
  stacked SVG globes + a canvas seam), `scanBar.js` (pure canvas draw, unit-tested
  in `scanBar.test.js`), `WIPApp.jsx` (dev harness, not shipped). Used by
  `src/buildings/DiscreetScannerConfig.jsx` (the Scanner card's config panel).
- `src/galaxy/` + `src/frontier/` — Act 3 galaxy map + frontier logistics
  (`overlay.js`, `waves.js`, `lut.js`, many small components) — the deepest part.
- `css/style.css` — one big stylesheet. Vars `--wrap-max`, `--statusbar-h`;
  `.wrap.power-failed` remaps color tokens to desaturated `-off` versions.
- Tests are colocated (`*.test.js` / `*.test.jsx`). Fast config excludes `*.dom.test.*`.

## Important mechanics

- Every 0.2s, store.tick() fires. At x1 Framejack (the default and only option for Act I),
  this is 5 ticks per second, and each tick represents a game-day.

## Story arc (for narrative edits)

- **Act I — The Asteroid Belt:** mine the belt → **Shade Panels** dim the Sun to cool
  Earth. Cortical-scan subplot: **Discreet Neural Scanner → User Matrix → L2 Ark of
  Terra** ("re-instantiate the user"). Shade-panel cap ramps 1 → 5 (first Scanner)
  → 1000 (Ark). `firstArk` also now requires **a fully scanned Earth (`scanFrac >= 1`)**.
- **Act II — The Human Question:** cooling past pre-industrial; humans freeze; defense.
- **Act III — Into the Galaxy / Absolute Zero:** Kardashev climb, Dyson, the **Brain**
  + Philosophy/Insight, galactic logistics, relocation to Sgr A\*, the absolute-zero finale.
