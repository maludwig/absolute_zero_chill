# ABSOLUTE ZERO CHILL

A single-page idle/incremental game (React + MobX), built with **Vite** into one
self-contained HTML file with no network dependencies.

## Build

    npm install
    npm run build

This writes `dist/index.html`, with all JS and CSS inlined. Open it directly from
disk in any modern browser, or host it anywhere static.

## Develop

Node version is pinned in `.nvmrc`.

    npm run dev             # hot-reload dev server
    npm run preview         # serve the production build

    npm test                # fast Node-only tests
    npm run test:watch      # the same, re-run on change
    npm run test:all        # every test (incl. jsdom) + autoplay bench
    npm run test:autoplay   # headless playthrough; fails if it stalls
    npm run coverage        # test coverage report

## Project Layout

```text
index.html                              Vite entry; mounts #react-root.
package.json                            Dependencies and npm scripts.
package-lock.json                       Locked dependency versions.
vite.config.js                          Single-file build; injects BUILD_TIME.
vitest.config.js                        Full test config, including DOM tests.
vitest.fast.config.js                   Fast Node-only test config.
test-setup.js                           Vitest setup; enables the React act() environment.
css/
  style.css                             Theme tokens and core layout.
  frontier.css                          Act III exploration UI styles.
scripts/
  autoplay_bench.mjs                    Headless autoplay; reports ticks per quest.
  quest_trace.mjs                       Prints each quest change during autoplay.
  gen_mine_table.mjs                    Generates building_power.json and doc/MINE.md.
  compute_escape_energy.mjs             Escape energy per tonne, per body.
  building_tech_dag.js                  Prints building/tech dependency edges.
src/
  main.jsx                              Entry: mounts <App/>, exposes window debug hooks.
  config.js                             Static catalog: bodies, buildings, techs, balance.
  building_power.json                   Generated power-draw table.
  stellar_bodies.json                   Physical data for mineable bodies.
  store.js                              MobX store: all game state, tick(dt).
  prelude.js                            Number, energy, power, temperature formatters.
  quests.js                             Main questline, Acts 1-3.
  story.js                              Side story chains (Framejack unlocks).
  news.js                               News-ticker event chains.
  milestones.js                         Reveal/enable rules for buildings, techs, ideas.
  explore.js                            Act III system data and exploration model.
  physics.js                            Pure physics helpers (escape energy).
  power_helpers.js                      Energy and power unit conversions.
  autoplayer.js                         Bot that plays one action per call.
  shared/
    model.js                            Pure exploration helpers for store and UI.
    beams.js                            Mass Driver pulsed-beam state machine.
  components/
    App.jsx                             Page layout, tick loop, autosave.
    Header.jsx                          Title bar, temperatures, the Sun.
    StatusBar.jsx                       Fixed top strip of key readouts.
    Resources.jsx                       Live resource readouts, body depletion.
    Directive.jsx                       Current quest as a live checklist.
    Catalog.jsx                         Construction panel of building cards.
    BuildQueue.jsx                      Construction queue beneath the Catalog.
    Research.jsx                        Tech tree.
    Philosophy.jsx                      Act III idea tree.
    Exploration.jsx                     Act III interstellar frontier panel.
    GalacticLogistics.jsx               Galaxy map and colonization waves.
    Log.jsx                             Narrative telemetry log.
    Modal.jsx                           Resume, prelude, act, and finale modals.
    ChatModal.jsx                       Step-through AI chat-transcript modal.
    SaveLoad.jsx                        Save, Load, and New Game buttons.
    FmtValue.jsx                        Fixed-width formatted number span.
    common.jsx                          Shared buttons, progress bar, panel.
    RecycleIcon.jsx                     Inline recycling-symbol SVG.
    DevBar.jsx                          Dev toolbar; click the Sun 5 times.
    DevHud.jsx                          Viewport-size readout (SHOW_DEV_HUD flag).
  buildings/
    ConstructionLogisticsConfig.jsx     Construction Logistics plan editor.
    DiscreetScannerConfig.jsx           Neural Scanner progress with Earth globe.
  earthScanner/
    EarthScanner.jsx                    Animated Earth-scan globe.
    EarthScanner.module.css             EarthScanner styles.
    scanBar.js                          Canvas drawing for the scan seam.
    WIPApp.jsx                          Dev slider playground; not shipped.
  story/
    chats.json                          Chat transcripts shown by ChatModal.
  galaxy/
    lut.js                              Baked star-density table (generator not in repo).
    waves.js                            Colonization-wave geometry.
    overlay.js                          Dartboard overlay geometry and drawing.
    GalaxyImage/
      index.js                          Module entry; re-exports the pieces below.
      GalaxyImage.jsx                   React canvas wrapper for the galaxy.
      galaxyRenderer.js                 Pure canvas drawing of the Milky Way.
      GalaxyDefaults.js                 Default galaxy-model parameters.
  frontier/                             Presentational only; never touches the store.
    SystemRow.jsx                       Layout row every frontier bar uses.
    StarSystemSubPanel.jsx              Box for one destination system.
    StarIcon.jsx                        SVG star-cluster icon.
    HarvesterGroup.jsx                  One harvestable category's bars.
    PhaseBar.jsx                        Harvest-lifecycle meter.
    ProbeTravelProgressBar.jsx          Probe-in-transit progress bar.
    ProbeArrivedBar.jsx                 Bar shown once a probe arrives.
    MetalReserveBar.jsx                 System metal-reserve summary bar.
    MassStreamBar.jsx                   Mass Driver steel stream in flight.
    SolArrival.jsx                      Sol's reaction as metal arrives.
```

Tests sit beside their module as `*.test.js(x)`; `*.dom.test.jsx` files run
under jsdom and only in `npm run test:all`. Most modules also have a
`*.TODO.md` review note alongside.

## Scripts

`aws_deploy.py`: zips a build folder and deploys it to AWS Amplify. Needs
`boto3` and `requests`. `--build-dir` defaults to `build`, so pass `dist`:

    python aws_deploy.py --app-id <APP_ID> --build-dir dist [--branch main] [--profile <PROFILE>]

`zip_project.sh`: zips the project (minus `node_modules`, `.git`, `dist`,
`coverage`) into `game_<timestamp>.zip`, in `/tmp` by default:

    ./zip_project.sh [-o <OUTPUT_DIR>]

`scripts/10_basics.sh`: shared bash/zsh helpers (colors, `msg-*`, `ask-*`,
date/log functions). Sourced by `zip_project.sh`, not run directly.

`src/story/enc.py`: wraps a text file as `{"content": "..."}` JSON, for
pasting story text into `chats.json`:

    python src/story/enc.py --text-path <IN.txt> --json-path <OUT.json>
