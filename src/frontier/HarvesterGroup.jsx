import {
  buildVisualFrac, K_BUILD, mineCountAt, recycleVisualFrac,
  fleetRemainingFrac, M0, harvestRemainingFrac,
} from "../shared/model.js";
import { PhaseBar } from "./PhaseBar.jsx";
import { PoweredButton } from "../components/common.jsx";
import { FmtValue } from "../components/FmtValue.jsx";

/* HarvesterGroup — one harvestable category. The label sits ABOVE its bars (so
   the bars get full width — friendlier on narrow screens), with a short status
   word. The research-gate name lives in the Research section, not here. Dumb:
   handed its phase + model + callbacks. */

const HARV_STATUS = { idle: "", building: "building", harvesting: "harvesting", harvested: "ready to recycle", recycling: "recycling", done: "consumed" };

export function HarvesterGroup({ cat, phase, t, tau, m, meta, cost, reserve, hasReserve, onBuild, onRecycle }) {
  const status = HARV_STATUS[phase] || "";
  const title = (
    <div className="hgroup-title">
      <span className="hgroup-name">{meta.label}</span>
      {status ? <span className="hgroup-status">{status}</span> : null}
    </div>
  );

  if (phase === "idle") {
    let main, right = null;
    if (cat !== "asteroid" && !hasReserve) {
      main = <div className="hrow-locked">locked — mine asteroids first</div>;
    } else {
      const free = cost === 0, afford = reserve >= cost;
      main = <PoweredButton className="hbtn" disabled={!afford} onClick={onBuild}>Build · {free ? "free" : <FmtValue value={cost} unit=" T" />}</PoweredButton>;
      right = free ? null : <span className={afford ? "" : "hrow-need"}><FmtValue value={cost} unit=" T" /></span>;
    }
    return <div className="hgroup">{title}<div className="hrow"><div className="hrow-main">{main}</div><div className="hrow-right">{right}</div></div></div>;
  }

  if (phase === "done") {
    return <div className="hgroup">{title}<div className="hrow"><div className="hrow-main"><PhaseBar tone="build" fraction={1} dim label="Fleet recycled" /></div><div className="hrow-right">✓</div></div></div>;
  }

  let fleetBar, fleetRight;
  if (phase === "building") {
    fleetBar = <PhaseBar tone="build" fraction={buildVisualFrac(t, m, K_BUILD)} label="Building fleet" />;
    fleetRight = <FmtValue value={Math.ceil(mineCountAt(t, m))} unit=" ⛏" />;
  } else if (phase === "recycling") {
    fleetBar = <PhaseBar tone="metal" fraction={recycleVisualFrac(tau, m, K_BUILD)} label="Recycling fleet" />;
    fleetRight = <FmtValue value={Math.ceil((m.mineMass / M0) * fleetRemainingFrac(tau))} unit=" ⛏" />;
  } else {
    fleetBar = <PhaseBar tone="build" fraction={1} dim label="Mining fleet · complete" />;
    fleetRight = <FmtValue value={Math.ceil(m.mineMass / M0)} unit=" ⛏" />;
  }

  let bottomMain, bottomRight;
  if (phase === "harvested") {
    bottomMain = <PoweredButton className="hbtn hbtn-recycle" onClick={onRecycle}>Recycle fleet · <FmtValue value={m.mineMass + cost} unit=" T" forceSign /></PoweredButton>;
    bottomRight = "refund";
  } else {
    const rem = harvestRemainingFrac(t, m);
    bottomMain = <PhaseBar tone="metal" fraction={rem} label={rem > 0 ? <>Harvesting · <FmtValue value={rem * m.mTotal} unit=" T" /> left</> : "Harvested"} />;
    bottomRight = <FmtValue value={rem * m.mTotal} unit=" T" />;
  }

  return (
    <div className="hgroup">
      {title}
      <div className="hrow"><div className="hrow-main">{fleetBar}</div><div className="hrow-right">{fleetRight}</div></div>
      <div className="hrow"><div className="hrow-main">{bottomMain}</div><div className="hrow-right">{bottomRight}</div></div>
    </div>
  );
}
