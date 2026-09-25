import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { store } from "../store.js";
import { autoplayer } from "../autoplayer.js";

/* DevBar — a fixed dev toolbar pinned to the bottom of the page, shown only in dev
   mode (toggle it with 5 clicks on the Sun). It surfaces the counters that reveal
   runaway state, a button to profile the tick loop, autoplay controls, and a
   one-shot Framejack unlock. Not part of the game UI. */

export const DevBar = observer(function DevBar() {
  const [autoRun, setAutoRun] = useState(false);
  const runningRef = useRef(false); // guards against overlapping runs if play() ever gets slow

  // While the toggle is on, fire the same action as "Autoplay Once" every 0.1s. The
  // interval is torn down on toggle-off and on unmount (e.g. hiding the dev bar), so it
  // can't leak or keep running after the bar closes.
  useEffect(() => {
    if (!autoRun) return;
    const h = setInterval(() => {
      if (runningRef.current) return;
      runningRef.current = true;
      try { autoplayer.play(store); } finally { runningRef.current = false; }
    }, 100);
    return () => clearInterval(h);
  }, [autoRun]);

  if (!store.devMode) {
    // Ensure a hidden bar isn't left auto-running in the background.
    if (autoRun) setAutoRun(false);
    return null;
  }
  const profiling = store._profTicksLeft > 0;
  return (
    <div className="devbar">
      <span className="devbar-tag">DEV</span>
      <button className="devbar-btn" disabled={profiling} onClick={() => store.profileTicks(60)}>
        {profiling ? `profiling… ${store._profTicksLeft}` : "Log tick timing (60t)"}
      </button>
      <button className="devbar-btn" onClick={() => store.clearTelemetryAndLog()}>Clear telemetry + log</button>
      <button className="devbar-btn" onClick={() => console.log(autoplayer.play(store))}>Autoplay Once</button>
      <button
        className={"devbar-btn" + (autoRun ? " on" : "")}
        onClick={() => setAutoRun((v) => !v)}
        title="Call Autoplay Once every 0.1s"
      >
        {autoRun ? "■ Auto-running…" : "▶ Auto ×0.1s"}
      </button>
      <button
        className="devbar-btn"
        disabled={store.devFramejack}
        onClick={() => store.unlockAllFramejack()}
        title="Mark every Framejack tech researched, no Brain needed"
      >
        {store.devFramejack ? "Framejack unlocked" : "Unlock all Framejack"}
      </button>
      <span className="devbar-stat">telemetry <b>{store.telemetry.events.length}</b></span>
      <span className="devbar-stat">log <b>{store.log.length}</b></span>
      <span className="devbar-stat">queue <b>{store.buildQueue.length}</b></span>
      <span className="devbar-hint">timings print to the console</span>
      <button className="devbar-btn devbar-close" onClick={() => store.toggleDevMode()} title="Hide dev bar">✕</button>
    </div>
  );
});
