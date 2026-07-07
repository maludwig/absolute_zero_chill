import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import {
  EXPLORE_DERIVED, EXPLORE_SYS_BY_NAME, EXPLORE_SYSTEMS, CATEGORY_META,
  DRIVER_MINED_GATE, DRIVER_BUILD_SECONDS, harvesterStartCost, PROBE_COST,
  K_RESERVE, arrivalLoopSpeed,
} from "../explore.js";
import { PoweredButton } from "./common.jsx";
import { FmtValue } from "./FmtValue.jsx";
import { StarIcon } from "../frontier/StarIcon.jsx";
import { SystemRow } from "../frontier/SystemRow.jsx";
import { ProbeTravelProgressBar } from "../frontier/ProbeTravelProgressBar.jsx";
import { ProbeArrivedBar } from "../frontier/ProbeArrivedBar.jsx";
import { PhaseBar } from "../frontier/PhaseBar.jsx";
import { HarvesterGroup } from "../frontier/HarvesterGroup.jsx";
import { MetalReserveBar } from "../frontier/MetalReserveBar.jsx";
import { MassStreamBar } from "../frontier/MassStreamBar.jsx";
import { SolArrival } from "../frontier/SolArrival.jsx";
import { StarSystemSubPanel } from "../frontier/StarSystemSubPanel.jsx";

/* Exploration — Act III. The interstellar frontier, gated behind the Probe
   Launcher. Each system is launched with a 140 T probe, then runs its own
   parallel lifecycle straight off the store: travel → arrive → harvest → ship
   home. All the bars are the dumb frontier components; this container is the only
   store-aware piece — it reads explore state and dispatches the actions. */

const SOL_ICON = <StarIcon stars={[{ radius: 1, type: "G" }]} box={30} />;

// the harvester stack + mass-driver row for one arrived system
const HarvesterRows = observer(function HarvesterRows({ name }) {
  const s = store.explore.sys[name];
  const d = EXPLORE_DERIVED[name];
  const reserve = store.sysReserve(name);
  const hasReserve = reserve > 0 || d.present.some((c) => s.cats[c].phase !== "idle"); // asteroid mined → others unlock
  const allStarted = d.present.every((c) => s.cats[c].phase !== "idle");
  const started = d.present.filter((c) => s.cats[c].phase !== "idle").length;
  const driverCost = DRIVER_MINED_GATE * d.nonStarMass;
  const dtitle = (st) => <div className="hgroup-title"><span className="hgroup-name">Mass Driver</span><span className="hgroup-status">{st}</span></div>;

  let driverRow;
  if (s.driver.phase === "done") {
    driverRow = <div className="hgroup">{dtitle("shipping home")}
      <div className="hrow"><div className="hrow-main"><div className="hrow-locked" style={{ color: "var(--good)", borderColor: "rgba(125,245,200,.3)" }}>Mass Driver · firing</div></div><div className="hrow-right">↩</div></div></div>;
  } else if (s.driver.phase === "building") {
    driverRow = <div className="hgroup">{dtitle("building")}
      <div className="hrow"><div className="hrow-main"><PhaseBar tone="build" fraction={s.driver.t / DRIVER_BUILD_SECONDS} label="Building Mass Driver" /></div><div className="hrow-right">{Math.ceil(s.driver.t)}/{DRIVER_BUILD_SECONDS}d</div></div></div>;
  } else if (allStarted) {
    driverRow = <div className="hgroup">{dtitle("ready")}
      <div className="hrow"><div className="hrow-main"><PoweredButton className="hbtn hbtn-driver" disabled={reserve < driverCost} onClick={() => store.buildDriver(name)}>Build Mass Driver · <FmtValue value={driverCost} unit=" T" /></PoweredButton></div><div className="hrow-right"><FmtValue value={driverCost} unit=" T" /></div></div></div>;
  } else {
    driverRow = <div className="hgroup">{dtitle("locked")}
      <div className="hrow"><div className="hrow-main"><div className="hrow-locked">unlocks once every harvester is started — {started}/{d.present.length}</div></div><div className="hrow-right" /></div></div>;
  }

  return (
    <div className="hrows">
      {d.present.map((c) => (
        <HarvesterGroup key={c} cat={c} phase={s.cats[c].phase} t={s.cats[c].t} tau={s.cats[c].tau}
          m={d.models[c]} meta={CATEGORY_META[c]} cost={harvesterStartCost(c, d.asteroidMass)}
          reserve={reserve} hasReserve={hasReserve}
          onBuild={() => store.buildHarvester(name, c)} onRecycle={() => store.recycleHarvester(name, c)} />
      ))}
      {driverRow}
    </div>
  );
});

// one frontier system: a launch card until launched, then the full lifecycle
const SystemPanel = observer(function SystemPanel({ name }) {
  const s = store.explore.sys[name];
  const d = EXPLORE_DERIVED[name];
  const def = EXPLORE_SYS_BY_NAME[name];
  const fj = store.explore.framejack;
  const destIcon = <StarIcon stars={def.stars} box={46} />;
  const distLabel = def.distance.toFixed(2) + " ly";

  if (!s.launched) {
    const afford = store.metal >= PROBE_COST;
    return (
      <StarSystemSubPanel name={def.name} sub={distLabel + " · " + (store.owned.stellaser > 0 ? "0.9c" : "0.3c") + " probe"}>
        <SystemRow solIcon={SOL_ICON} destIcon={destIcon} right={distLabel}>
          <PoweredButton className="hbtn hbtn-launch" disabled={!afford} onClick={() => store.launchProbe(name)}>Launch probe · <FmtValue value={PROBE_COST} unit=" T" /></PoweredButton>
        </SystemRow>
      </StarSystemSubPanel>
    );
  }

  const travelDays = (def.distance / s.speed) * 365;
  const elapsed = store.explore.day - s.launchDay;
  const arrived = elapsed >= travelDays;
  const reserve = store.sysReserve(name);

  let topRow, sub;
  if (!arrived) {
    const yrsLeft = Math.max(0, (travelDays - elapsed) / 365);
    sub = <>{s.speed.toFixed(1)}c · <FmtValue value={yrsLeft} unit=" yr" /> to go</>;
    topRow = <SystemRow solIcon={SOL_ICON} destIcon={destIcon} right={distLabel}><ProbeTravelProgressBar total_distance={travelDays} current_distance={elapsed} speed={s.speed} /></SystemRow>;
  } else if (s.driver.phase === "done") {
    const streamDays = (def.distance / 0.9) * 365;
    const day = store.explore.day;
    // One band per beamPacket: it departed the source across [departDay, finishedDay]
    // and travels streamDays to Sol, so at time `day` its leading edge (head) is at
    // progress (day-departDay)/streamDays and its trailing edge (tail) at
    // (day-finishedDay)/streamDays — both Dest(0)→Sol(1). MassStreamBar clamps and
    // drops any band fully arrived or not yet departed.
    const bands = s.beamPackets.map((p) => ({
      head: (day - p.departDay) / streamDays,
      tail: (day - p.finishedDay) / streamDays,
    }));
    const consumed = s.consumed && s.beamPackets.length === 0; // source dry AND all packets arrived
    if (consumed) {
      sub = <>system consumed · <FmtValue value={s.shipped} unit=" T" /> delivered</>;
      topRow = <SystemRow solIcon={SOL_ICON} destIcon={destIcon} right={distLabel}><ProbeArrivedBar variant="engraved" label="DELIVERED" /></SystemRow>;
    } else {
      const anyArriving = bands.some((b) => b.head >= 1);
      // driver status line: firing/empty/reloading, plus live delivery note
      const reserveLow = store.sysReserve(name) < 0.1;
      const driverWord = s.beam.state === "firing" ? "firing"
        : (s.beam.state === "reloading" || s.beam.state === "reloading_pause")
          ? (reserveLow ? "empty" : "reloading")
          : reserveLow ? "empty" : "charging";
      sub = anyArriving ? "delivering to Sol · " + driverWord : "stream in transit · " + driverWord;
      const solNode = anyArriving ? <SolArrival variant="intakecharge" size={30} speed={arrivalLoopSpeed(fj)} /> : SOL_ICON;
      topRow = <SystemRow className="sysrow-stream" solIcon={solNode} destIcon={destIcon} right={distLabel}><MassStreamBar bands={bands} /></SystemRow>;
    }
  } else {
    const started = d.present.filter((c) => s.cats[c].phase !== "idle").length;
    sub = s.driver.phase === "building" ? "building mass driver" : started === d.present.length ? "harvesters committed" : "harvesting · " + started + "/" + d.present.length + " started";
    topRow = <SystemRow solIcon={SOL_ICON} destIcon={destIcon} right={distLabel}><ProbeArrivedBar variant="engraved" /></SystemRow>;
  }

  const depleted = arrived && s.consumed && s.beamPackets.length === 0;
  const collapsed = arrived && (s.collapsed == null ? depleted : s.collapsed);
  return (
    <StarSystemSubPanel name={def.name} sub={sub} collapsed={collapsed}
      onToggle={arrived ? () => store.toggleSysCollapsed(name) : null}>
      {topRow}
      {arrived && <MetalReserveBar reserve={reserve} totalMass={d.totalMass} curveK={K_RESERVE} />}
      {arrived && <HarvesterRows name={name} />}
    </StarSystemSubPanel>
  );
});

export const Exploration = observer(function Exploration() {
  if ((store.owned.probe_launcher || 0) <= 0) return null;
  return (
    <section className="panel explore-panel">
      <h2>Exploration<span className="tag"><FmtValue value={store.explore.returned} unit=" T" /> returned</span></h2>
      <div className="explore-controls">
        <span className="explore-meta">Probe drive · {store.owned.stellaser > 0 ? "0.9c" : "0.3c"}</span>
      </div>
      <div className="explore-frontier">
        {EXPLORE_SYSTEMS.map((def) => <SystemPanel key={def.name} name={def.name} />)}
      </div>
    </section>
  );
});
