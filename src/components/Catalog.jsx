import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { BUILDINGS, TECHS, MINE_TO_BODY, INFRA_TO_BODY, MULTS, CONSTRUCTION_SECTIONS, sectionForBuilding } from "../config.js";
import { PoweredButton, SelfPoweredButton } from "./common.jsx";
import { FmtValue, FmtPower, FmtEnergy } from "./FmtValue.jsx";
// Side-effect imports: each registers a ConfigComponent onto its building's config.
import "../buildings/ConstructionLogisticsConfig.jsx";
import "../buildings/DiscreetScannerConfig.jsx";

/* Catalog — buildable structures. Locked cards show their tech requirement.
   The Construction panel also hosts the live Build Queue beneath the cards. */

const BuildingCard = observer(function BuildingCard({ id }) {
  const b = BUILDINGS[id];
  const unlocked = store.buildingUnlocked(id);
  // Which buy button the pointer/focus is on: { n, label } so the foot-meta can
  // preview that batch's cost/workload/power and show the button's own label as a
  // badge. null = not hovering.
  const [hover, setHover] = useState(null);

  if (!unlocked) {
    return (
      <div className="card locked">
        <div className="card-h">
          <span className="card-name">{b.name}</span>
          <span className="card-own">locked</span>
        </div>
        <div className="card-desc">{b.desc}</div>
        <div className="req">Requires: {b.requires.map((r) => TECHS[r]?.name ?? r).join(", ")}</div>
      </div>
    );
  }

  // Preview multiplier: 1 normally, or the hovered button's batch count.
  const mult = hover ? hover.n : 1;
  const previewing = mult > 1; // ×1 (Build) changes nothing, so no preview shown
  const afford = store.canAffordN(id, mult);
  const cap = store.remainingCapacity(id); // Infinity for uncapped buildings
  const effMax = store.buildingMax(id);
  const capped = effMax != null;
  const body = MINE_TO_BODY[id] || INFRA_TO_BODY[id];
  const isDepleted = body && store.depleted[body.id];
  const owned = store.owned[id] || 0;
  const inCargo = store.inventory[id] || 0;        // units waiting in the manifest
  const isGrid = !!b.powerUsage;                   // has a switchable power role → gets a breaker
  const isPower = isGrid || !!b.powerCap;          // any power building → gets the power line
  // Only power generators (negative powerUsage) can be built while the grid is dark —
  // that's the recovery path. Everything else uses a normal button that goes inert.
  const BuyBtn = (b.powerUsage && b.powerUsage.W < 0) ? SelfPoweredButton : PoweredButton;

  // build the visible buy buttons: Build (×1) plus each researched multiplier,
  // clamped to remaining capacity and de-duplicated once the cap is reached.
  // A mine on an exhausted body shows a Recycle button instead.
  // Infra buildings (Railgun/Ring/Spire) on an exhausted body simply show DEPLETED.
  let buttons;
  if (isDepleted) {
    const isMine = !!MINE_TO_BODY[id];
    buttons = (
      <React.Fragment>
        <span className="depleted-tag">DEPLETED</span>
        {isMine && owned > 0 && (
          <PoweredButton className="btn recycle" onClick={() => store.recycleMines(id)}>
            Recycle ×<FmtValue value={owned} /> → <FmtValue value={owned * b.metalCost} unit=" T" />
          </PoweredButton>
        )}
      </React.Fragment>
    );
  } else if (cap <= 0) {
    buttons = <span className="maxed">MAXED</span>;
  } else {
    const rows = [{ key: "build", n: 1, label: "Build", cls: "btn" }];
    let lastEff = 1;
    for (const m of MULTS) {
      if (!store.techDone(m.tech)) continue;
      const eff = Math.min(m.n, cap); // clamp to fitting ONE batch; Multithreading queues
      if (eff <= lastEff) continue;   // up to 16 of these independently, stopping when one won't fit
      lastEff = eff;
      rows.push({ key: m.n, n: eff, label: eff < m.n ? <FmtValue value={eff} forceSign /> : m.label, cls: "btn batch" });
    }
    const mainButtons = rows.slice().reverse().map((r) => (
      <BuyBtn
        key={r.key}
        className={r.cls}
        disabled={!store.canAffordN(id, r.n)}
        onClick={() => store.multithread
          ? store.enqueueMultithreaded(id, r.n, 16)
          : store.enqueue(id, r.n)}
        onMouseEnter={() => setHover({ n: r.n, label: r.label })}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover({ n: r.n, label: r.label })}
        onBlur={() => setHover(null)}
      >
        {r.label}
      </BuyBtn>
    ));

    // Duplication ×2 — queues as many as you already own (doubling the fleet),
    // clamped to remaining capacity. Only shown once you own at least one; disabled
    // if you can't afford the doubling.
    let dupButton = null;
    if (store.techDone("duplication") && owned > 0) {
      const dupN = Math.min(owned, cap);
      const dupAfford = dupN > 0 && store.canAffordN(id, dupN);
      dupButton = (
        <BuyBtn
          key="dup"
          className="btn dup"
          disabled={!dupAfford}
          onClick={() => store.multithread
            ? store.enqueueMultithreaded(id, dupN, 16)
            : store.enqueue(id, dupN)}
          onMouseEnter={() => setHover({ n: dupN, label: "×2" })}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover({ n: dupN, label: "×2" })}
          onBlur={() => setHover(null)}
        >
          ×2
        </BuyBtn>
      );
    }

    buttons = (
      <React.Fragment>
        {dupButton}
        <div className="buy-main">{mainButtons}</div>
      </React.Fragment>
    );
  }

  // grid buildings carry a live breaker in the header corner once at least one is
  // built: [live kW] [Off] (toggle) [On] ×N. The Off/On labels light on the active
  // side and grey out on the other, like a status LED. Power buildings without a
  // switch (the Accumulator) keep a plain quantity and a spec line below.
  const brkOn = store.breakerOn[id];
  const perUnit = b.powerUsage ? -b.powerUsage.kW : 0; // net contribution: + = feeds grid, − = draws
  const liveKw = brkOn ? owned * perUnit : 0;
  const liveStr = <FmtPower power={{ kW: liveKw }} forceSign pad />;
  const liveCls = liveKw === 0 ? "z" : liveKw > 0 ? "gen" : "draw";
  const qtyEl = <>×<FmtValue value={owned} />{capped ? <> / <FmtValue value={effMax} /></> : null}</>;
  const Config = b.ConfigComponent; // optional per-building config UI, rendered above the buy buttons

  return (
    <div className={"card" + (id === "shade_panel" && store.humanVessels > 0 ? " threat" : "") + (isDepleted ? " spent" : "") + (isPower ? " grid" : "") + (isGrid && owned > 0 && !brkOn ? " pw-off" : "")}>
      <div className="card-h">
        <span className="card-name">{b.name}</span>
        {isGrid && owned > 0 ? (
          <span className="card-own breaker-set">
            <span className="breaker-power">
              <span className={"live-kw " + liveCls}>{liveStr}</span>
              <span className={"brk-lbl off" + (brkOn ? " dim" : "")}>Off</span>
              <button
                className={"brk-switch " + (brkOn ? "on" : "off")}
                role="switch" aria-checked={brkOn}
                onClick={() => store.setBreaker(id, !brkOn)}
                title={brkOn ? "Switch off" : "Switch on"}
              >
                <span className="brk-knob" />
              </button>
              <span className={"brk-lbl on" + (brkOn ? "" : " dim")}>On</span>
            </span>
            <span className="brk-qty">{qtyEl}</span>
          </span>
        ) : (
          <span className="card-own">{qtyEl}</span>
        )}
      </div>
      <div className="card-desc">{b.desc}</div>
      {isPower && !isGrid && (
        <div className="power-line">
          {b.powerCap ? <span className="pg store"><FmtEnergy energy={{ kWh: b.powerCap }} forceSign /></span> : null}
        </div>
      )}
      <div className="card-foot">
        {inCargo > 0 && (
          <SelfPoweredButton className="btn unpack" onClick={() => store.unpack(id)}>
            Unpack from cargo ×<FmtValue value={inCargo} />
          </SelfPoweredButton>
        )}
        {Config && <Config />}
        <div className="buy-row">{buttons}</div>
        {!isDepleted && (
          <div className={"card-foot-meta" + (previewing ? " previewing" : "")}>
            <span className={"cost" + (afford ? "" : " cant")}><FmtValue value={b.metalCost * mult} unit=" T" /></span>
            <span className="wl">workload <FmtValue value={b.workload * mult} /></span>
            {b.powerUsage && b.powerUsage.W > 0 ? <span className="pw-cost draw"><FmtPower power={{ W: -b.powerUsage.W * mult }} forceSign /></span> : null}
            {b.powerUsage && b.powerUsage.W < 0 ? <span className="pw-cost gen"><FmtPower power={{ W: -b.powerUsage.W * mult }} forceSign /></span> : null}
            {previewing && <span className="meta-mult">{hover.label}</span>}
          </div>
        )}
      </div>
    </div>
  );
});

// A building is "completed" once nothing more can be done with it:
// maxed-out capped buildings (including built infra), or depleted mines with no units left to recycle.
// Exception: a built power-drawing building (the Ark, Scanner, Matrix, an active
// mine…) stays in the main list so the player can always see and manage it — its
// breaker, its running state, its live draw. Only once it's gone (owned 0, e.g. a
// fully-recycled depleted mine) does it tuck away.
function isBuildingCompleted(id) {
  const b = BUILDINGS[id];
  const body = MINE_TO_BODY[id] || INFRA_TO_BODY[id];
  const isDepleted = body && store.depleted[body.id];
  const owned = store.owned[id] || 0;
  if (b.powerUsage && b.powerUsage.W > 0 && owned > 0) return false;
  if (isDepleted && owned <= 0) return true;
  if (b.max != null && store.remainingCapacity(id) <= 0) return true;
  return false;
}

export const Catalog = observer(function Catalog() {
  const [showCompleted, setShowCompleted] = useState(false);
  // Per-section collapse state, keyed by section key. Absent = expanded (open) —
  // the buildable cards are the main interaction, so sections default open.
  const [collapsed, setCollapsed] = useState({});
  const toggleSection = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const visible = Object.keys(BUILDINGS)
    .filter((id) => store.buildingVisible(id))
    .sort((a, b) => BUILDINGS[a].metalCost - BUILDINGS[b].metalCost);
  const active    = visible.filter((id) => !isBuildingCompleted(id));
  const completed = visible.filter((id) =>  isBuildingCompleted(id));
  return (
    <section className="panel construction">
      <h2>Construction</h2>
      {store.techDone("multithreading") && (
        <label className="mt-toggle">
          <input type="checkbox" checked={store.multithread} onChange={() => store.toggleMultithread()} />
          <span className="mt-name">Multithreading ×16</span>
          <span className="mt-hint">each build queues 16× at once</span>
        </label>
      )}
      {CONSTRUCTION_SECTIONS.map((sec) => {
        const ids = active.filter((id) => sectionForBuilding(id) === sec.key);
        if (ids.length === 0) return null; // hide empty sections entirely
        const open = !collapsed[sec.key];
        return (
          <div className="build-section" key={sec.key}>
            <button className="section-toggle" onClick={() => toggleSection(sec.key)}>
              {open ? "▾" : "▸"} {sec.title} ({ids.length})
            </button>
            {open && (
              <div className="card-list">
                {ids.map((id) => <BuildingCard key={id} id={id} />)}
              </div>
            )}
          </div>
        );
      })}
      {completed.length > 0 && (
        <div className="completed-section">
          <button className="completed-toggle" onClick={() => setShowCompleted((v) => !v)}>
            {showCompleted ? "▾" : "▸"} Completed ({completed.length})
          </button>
          <div className="card-list">
            {showCompleted && completed.map((id) => <BuildingCard key={id} id={id} />)}
          </div>
        </div>
      )}
    </section>
  );
});
