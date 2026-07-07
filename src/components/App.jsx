import React from "react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { store } from "../store.js";
import { CONFIG, DT, TICK_MS, SHOW_DEV_HUD } from "../config.js";
import { Header } from "./Header.jsx";
import { StatusBar } from "./StatusBar.jsx";
import { Resources, Depletions } from "./Resources.jsx";
import { Directive } from "./Directive.jsx";
import { DevHud } from "./DevHud.jsx";
import { DevBar } from "./DevBar.jsx";
import { Exploration } from "./Exploration.jsx";
import { Philosophy } from "./Philosophy.jsx";
import { GalacticLogistics } from "./GalacticLogistics.jsx";
import { Catalog } from "./Catalog.jsx";
import { Research } from "./Research.jsx";
import { BuildQueue } from "./BuildQueue.jsx";
import { Log } from "./Log.jsx";
import { PreludeModal, ActOneModal, Act1CompleteModal, UserMatrixModal, ArkModal, ActTwoModal, FinaleModal } from "./Modal.jsx";
import { SaveLoad } from "./SaveLoad.jsx";
import { Panel } from "./common.jsx";

/* SiLegend — a small "big-number key" at the foot of the page. The game leans on
   SI prefixes everywhere (metal, power, energy); not everyone past k/M/G knows the
   rest, so this spells out each step as ×1000 of the one before it. */
const SI_PREFIXES = [
  ["Kilo", "k", "1000"],
  ["Mega", "M", "1000k"],
  ["Giga", "G", "1000M"],
  ["Tera", "T", "1000G"],
  ["Peta", "P", "1000T"],
  ["Exa", "E", "1000P"],
  ["Zetta", "Z", "1000E"],
  ["Yotta", "Y", "1000Z"],
  ["Ronna", "R", "1000Y"],
  ["Quetta", "Q", "1000R"],
];

function SiLegend() {
  return (
    <div className="si-legend" aria-label="SI prefix cheat sheet">
      <span className="si-legend-title">Big-number key</span>
      {SI_PREFIXES.map(([name, sym, val]) => (
        <span key={sym} className="si-item"><b>{name}</b> 1{sym} = {val}</span>
      ))}
    </div>
  );
}

/* App — composes the screen and runs the game clock. The interval is the
   heartbeat, but the *amount* of simulation it runs is driven by wall-clock
   time, not by how often the browser chooses to fire it. Backgrounded tabs get
   their setInterval throttled (or paused), so on each fire we measure how much
   real time elapsed and run that many DT-ticks to catch up — the belt keeps
   working while you're away. All catch-up ticks run inside one runInAction so
   MobX re-renders once, not thousands of times. A fractional carry avoids
   drift, and a cap keeps a very long absence from freezing the resume. */

export const App = observer(function App() {
  React.useEffect(() => {
    const maxTicks = Math.floor(CONFIG.maxCatchupSeconds / DT);
    let last = performance.now();
    let carry = 0; // leftover fractional DT-ticks owed

    const handle = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - last) / 1000; // seconds since last fire
      last = now;

      // While a modal is open the game is paused: reset the clock baseline and
      // drop any owed ticks, so closing the modal doesn't unleash a catch-up burst.
      if (store.paused) { carry = 0; return; }

      carry += elapsed / DT;             // == 5 * elapsed DT-ticks owed (DT = 0.2s)
      const baseTicks = Math.floor(carry);
      carry -= baseTicks;

      let simTicks = baseTicks * (store.explore.framejack || 1);
      if (simTicks > maxTicks) simTicks = maxTicks;

      if (simTicks > 0) {
        runInAction(() => { store.tick(simTicks * DT); });
      }
    }, TICK_MS);

    // Economy snapshot — every 10 real seconds, record rates for balance analysis.
    let lastEconomy = performance.now();
    const econHandle = setInterval(() => {
      runInAction(() => {
        store.pushTelemetry({
          type: "economy",
          metal:        store.metal,
          metal_rate:   store.metalPerSec,
          build_power:  store.buildPower + store.playerBuildPower,
          insight_rate: store.insightPerDay,
        });
      });
    }, 10_000);

    return () => { clearInterval(handle); clearInterval(econHandle); };
  }, []);

  return (
    <div className={"wrap" + (store.powerFailed ? " power-failed" : "")}>
      <StatusBar />
      <Header />
      <Resources />
      <Directive />
      <Depletions />
      <Exploration />
      <Philosophy />
      <GalacticLogistics />
      <div className="grid grid-main">
        <Catalog />
        <div className="col-stack">
          <Research />
        </div>
        <Panel title="Build Queue" tag={store.buildQueue.length ? store.buildQueue.length + " active" : null} className="build-queue-panel">
          <BuildQueue />
        </Panel>
      </div>
      <div className="grid grid-log">
        <Log />
      </div>
      <PreludeModal />
      <ActOneModal />
      <Act1CompleteModal />
      <UserMatrixModal />
      <ArkModal />
      <ActTwoModal />
      <FinaleModal />
      <SiLegend />
      <footer>
        <span>SOLETTA-1 · build {BUILD_TIME}</span>
        <SaveLoad />
      </footer>
      {SHOW_DEV_HUD && <DevHud />}
      <DevBar />
    </div>
  );
});
