import { observer } from "mobx-react-lite";
import { store } from "../store.js";

/* DevBar — a fixed dev toolbar pinned to the bottom of the page, shown only in dev
   mode (toggle it with 10 clicks on the Sun). It surfaces the counters that reveal
   runaway state and a button to profile the tick loop. Not part of the game UI. */

export const DevBar = observer(function DevBar() {
  if (!store.devMode) return null;
  const profiling = store._profTicksLeft > 0;
  return (
    <div className="devbar">
      <span className="devbar-tag">DEV</span>
      <button className="devbar-btn" disabled={profiling} onClick={() => store.profileTicks(60)}>
        {profiling ? `profiling… ${store._profTicksLeft}` : "Log tick timing (60t)"}
      </button>
      <button className="devbar-btn" onClick={() => store.clearTelemetryAndLog()}>Clear telemetry + log</button>
      <span className="devbar-stat">telemetry <b>{store.telemetry.events.length}</b></span>
      <span className="devbar-stat">log <b>{store.log.length}</b></span>
      <span className="devbar-stat">queue <b>{store.buildQueue.length}</b></span>
      <span className="devbar-hint">timings print to the console</span>
      <button className="devbar-btn devbar-close" onClick={() => store.toggleDevMode()} title="Hide dev bar">✕</button>
    </div>
  );
});
