# ABSOLUTE ZERO CHILL

A single-page idle/incremental game (React + MobX), built with **Vite** into a
standalone, fully-inlined HTML file with no network dependencies.

## Build

    npm install
    npm run build

This writes a single self-contained `dist/index.html` — React, MobX, all CSS,
and all game code inlined into one file (no external requests). Open it directly
from disk in any modern browser, or host it anywhere static.

For local development with hot-reload:

    npm run dev

## How it works

`@vitejs/plugin-react` transforms the JSX at build time (the old in-browser
Babel is gone), and `vite-plugin-singlefile` inlines the bundle into one HTML
page. The build timestamp shown in the footer is injected via Vite's `define`
(replacing the old Jinja `{{ build_time }}`).

## Project layout

    index.html          Vite entry — mounts #react-root, loads src/main.jsx.
    vite.config.js      React plugin, single-file inlining, BUILD_TIME define.
    css/
      style.css         Core theme + layout (Acts I–II).
      frontier.css      Act-III exploration component styles.
    src/
      main.jsx          Entry: imports CSS, mounts <App/>, exposes debug hooks.
      prelude.js        The canonical fmt() number formatter.
      config.js         Bodies, techs, buildings, balance constants (exported data).
      explore.js        Act-III data + game model; re-exports shared/model.js.
      store.js          The MobX store — all game state + the tick() loop.
      quests.js         The main questline
      shared/
        model.js        Pure helpers/constants shared by store + components.
      components/        Store-aware (observer) UI: Header, Resources, Catalog,
                        Research, BuildQueue, Log, Exploration, Philosophy,
                        GalacticLogistics, Modal, SaveLoad, App.
      galaxy/            Act III endgame: lut.js (baked star-density table), waves.js
                        (pure frontier/round-trip math), overlay.js (dartboard
                        geometry + canvas drawing), GalaxyImage/ (the spiral-galaxy
                        canvas renderer).
      frontier/         Dumb presentational components for the frontier UI
                        (star icons, progress/stream bars, system panels).
