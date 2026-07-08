import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { fmtTemp, fmtTempTriple } from "../prelude.js";
import { CONFIG } from "../config.js";
import { PoweredButton } from "./common.jsx";
import { FmtValue, FmtPower, FmtEnergy } from "./FmtValue.jsx";

/* Header — title plus the Sun, which dims as Shade Panels come online. The
   readouts: Sun dimmed %, Surface temp (sub-Kelvin once the CMB floor falls),
   and — once the core mechanic is revealed at 250 K — Core temp. */

const FramejackControl = observer(function FramejackControl() {
  if (!store.research.done.framejacking) return null;
  const fj = store.explore.framejack;
  return (
    <div className="fj-toggle hd-fj">
      <span className="fj-label">Framejack</span>
      <div className="fj-seg">
        {store.framejackLevels.map((lv) => (
          <PoweredButton key={lv} className={fj === lv ? "on" : ""} onClick={() => store.setFramejack(lv)}>×{lv}</PoweredButton>
        ))}
      </div>
    </div>
  );
});

const PowerWidget = observer(function PowerWidget() {
  // hidden until the player has any power infrastructure in play (a grid building
  // owned or still in cargo) — no need to show a battery before there's a grid.
  const hasGrid = store.owned.solar_collector > 0 || store.owned.asteroid_mine > 0
    || store.inventory.solar_collector > 0 || store.inventory.asteroid_mine > 0;
  if (!hasGrid) return null;

  const frac = Math.max(0, Math.min(1, store.powerFrac));
  const net = store.powerNet;
  const powerFailed = store.powerFailed;
  const draining = net < 0 && !powerFailed;
  const state = powerFailed ? "dead" : draining ? "drain" : net > 0 ? "charge" : "steady";

  return (
    <div className={"power-widget pw-" + state}>
      <svg className="pw-batt" viewBox="0 0 34 16" width="34" height="16" aria-hidden="true">
        <rect className="pw-shell" x="0.5" y="0.5" width="29" height="15" rx="2" />
        <rect className="pw-cap" x="30.5" y="5" width="3" height="6" rx="1" />
        <rect className="pw-fill" x="2" y="2" width={Math.max(0, 26 * frac)} height="12" rx="1" />
      </svg>
      <div className="pw-read">
        <div className="pw-top">
          <span className="pw-pct">{powerFailed ? "OFFLINE" : Math.round(frac * 100) + "%"}</span>
          <span className="pw-net">
            <FmtPower power={{ kW: net }} forceSign />
          </span>
        </div>
        <div className="pw-sub">
          {powerFailed
            ? "breaker tripped — reboot the grid"
            : <><FmtEnergy energy={{ kWh: store.power }} /> / <FmtEnergy energy={{ kWh: store.powerCap }} /></>}
        </div>
      </div>
    </div>
  );
});

export const Header = observer(function Header() {
  const blot = store.sunBlot;
  // Sneaky dev/easter-egg: within each cycle of Sun clicks, 5 unlocks every Framejack
  // tier and toggles the dev toolbar (then resets). Counted in a ref so the Header's
  // per-tick re-renders don't reset it and no UI hints at it.
  const sunClicks = useRef(0);
  const pokeSun = () => {
    const n = ++sunClicks.current;
    if (n >= 5) {
      store.unlockAllFramejack();
      sunClicks.current = 0;
      store.toggleDevMode();
    }
  };
  const act = store.cmbrDefeated
    ? "Act III — Absolute Zero"
    : store.revealed.brain
      ? "Act III — Into the Galaxy"
      : store.research.done.interstellar_probing
        ? "Act III — Into the Galaxy"
        : store.revealed.defense
          ? "Act II — The Human Question"
          : "Act I — The Asteroid Belt";
  return (
    <header>
      <h1>
        ABSOLUTE&nbsp;ZERO&nbsp;CHILL
        <small>{act}</small>
        <small className="hd-year">Year {store.gameYear}</small>
        <FramejackControl />
      </h1>
      <PowerWidget />
      <div className="sun-wrap">
        <div className="sun-meta">
          <span>Sun dimmed<b>{Math.min(100, blot * 100).toFixed(1)}%</b></span>
          <span className="temp-read">Surface temp<b>{fmtTempTriple(store.surfaceTemp)}</b></span>
          {store.revealed.core && (
            <span className="temp-read core"><span className="core-flag">Core temp</span><b>{fmtTempTriple(store.coreTemp)}</b></span>
          )}
        </div>
        <div className="sun" onClick={pokeSun}>
          <div className="shade" style={{ opacity: Math.min(0.95, blot * 6) }} />
        </div>
      </div>
      {store.relocating && (
        <div className="relocate-banner">
          <div className="rb-label">Earth in transit to Sagittarius A★</div>
          <div className="rb-bar"><div className="rb-fill" style={{ width: (store.relocationProgress * 100).toFixed(2) + "%" }} /></div>
          <div className="rb-pct">{(store.relocationProgress * 100).toFixed(1)}% · <FmtValue value={CONFIG.relocateDistanceLy * (1 - store.relocationProgress)} unit=" ly" /> to go</div>
        </div>
      )}
    </header>
  );
});
