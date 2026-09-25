import { useState, useRef } from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { TECHS } from "../config.js";
import { ProgressBar, Panel } from "./common.jsx";
import { FmtValue } from "./FmtValue.jsx";

/* Research — the tech tree. Clicking a tech both Focuses it (idle Replicas +
   Science Installations pour in) and lands one manual Assist; repeated clicks keep
   it focused and keep assisting. No focus/assist buttons — the row itself is the
   control. Research is offline (rows inert) while the Replica breaker is off or the
   grid has failed. */

const TechRow = observer(function TechRow({ id }) {
  const t = TECHS[id];
  const done = store.techDone(id);
  const unlocked = store.techUnlocked(id);
  const sel = store.research.selected === id;
  const prog = store.research.progress[id] || 0;
  const researchOff = !store.breakerOn.replica || store.powerFailed; // research offline
  const actionable = unlocked && !done && !researchOff;

  let control = null;
  if (done) control = <span className="tstatus done">researched</span>;
  else if (!unlocked) control = <span className="tstatus req">locked</span>;
  else if (sel) control = <span className="tstatus foc">Focused</span>;

  // ---- TEMPORARY TAP DIAGNOSTICS (remove once the dropped-tap cause is known) ----
  // Purely passive: these listeners only log, they do NOT touch the click path — the
  // onClick below is left exactly as it was so the bug reproduces unchanged.
  //
  // Two competing hypotheses produce different signatures in the log:
  //   SCROLL-CANCEL — finger drifts > a few px, browser calls it a scroll: you'll see
  //     "cancel" (or an end with a big move) and NO click line at all.
  //   HANDLER-FLIP — a tick flips `actionable` between touchstart and click: you'll see
  //     act@start=Y but act@end=N, an end with tiny movement, and either no click or a
  //     click that reports handler=NONE.
  const dbg = useRef({ x: 0, y: 0, maxMove: 0, actAtStart: false, t0: 0 });
  const onTouchStart = (e) => {
    const p = e.touches[0];
    dbg.current = { x: p.clientX, y: p.clientY, maxMove: 0, actAtStart: actionable, t0: Date.now() };
    store.pushLog(`[tap] START ${id} act=${actionable ? "Y" : "N"}`, "cyan");
  };
  const onTouchMove = (e) => {
    const p = e.touches[0];
    const d = Math.hypot(p.clientX - dbg.current.x, p.clientY - dbg.current.y);
    if (d > dbg.current.maxMove) dbg.current.maxMove = d;
  };
  const onTouchEnd = () => {
    const d = dbg.current;
    store.pushLog(
      `[tap] END ${id} move=${d.maxMove.toFixed(0)}px ${Date.now() - d.t0}ms act@start=${d.actAtStart ? "Y" : "N"} act@end=${actionable ? "Y" : "N"}`,
      "warn"
    );
  };
  const onTouchCancel = () => {
    const d = dbg.current;
    store.pushLog(`[tap] CANCEL(scroll) ${id} move=${d.maxMove.toFixed(0)}px — no click will fire`, "danger");
  };
  const onClickDbg = () => {
    const d = dbg.current;
    store.pushLog(
      `[tap] CLICK ${id} move=${d.maxMove.toFixed(0)}px handler=${actionable ? "ATTACHED" : "NONE"} act@start=${d.actAtStart ? "Y" : "N"}`,
      actionable ? "ok" : "danger"
    );
  };
  // -------------------------------------------------------------------------------

  return (
    <div
      className={"trow" + (done ? " tdone" : "") + (sel ? " tsel" : "") + (actionable ? " clickable" : "")}
      onClick={actionable ? () => store.focusAndAssist(id) : undefined}
      title={actionable ? "Click to focus + assist" : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onClickCapture={onClickDbg}
    >
      <div className="tinfo">
        <span className="tname">{t.name}</span>
        {control && <span className="tctrl">{control}</span>}
      </div>
      <div className="tdesc">{t.desc}</div>
      {!done && unlocked && <ProgressBar value={prog} max={t.cost} small />}
      {!done && unlocked && <div className="tcost"><FmtValue value={prog} /> / <FmtValue value={t.cost} unit=" RP" /></div>}
    </div>
  );
});

export const Research = observer(function Research() {
  const [showDone, setShowDone] = useState(false);
  const visible = Object.keys(TECHS)
    .filter((id) => store.techVisible(id))
    .sort((a, b) => TECHS[a].cost - TECHS[b].cost);
  const active = visible.filter((id) => !store.techDone(id));
  const done   = visible.filter((id) =>  store.techDone(id));
  return (
    <Panel title="Research" tag={!store.breakerOn.replica ? "⚡ offline — Replica breaker off" : null}>
      {active.map((id) => <TechRow key={id} id={id} />)}
      {done.length > 0 && (
        <div className="completed-section">
          <button className="completed-toggle" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "▾" : "▸"} Completed ({done.length})
          </button>
          {showDone && done.map((id) => <TechRow key={id} id={id} />)}
        </div>
      )}
    </Panel>
  );
});
