import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { CONFIG } from "../config.js";
import { FmtValue } from "./FmtValue.jsx";
import { LUT, SLICE_COUNT, BIN_LY } from "../galaxy/lut.js";
import GalaxyImage from "../galaxy/GalaxyImage/GalaxyImage.jsx";
import { VB } from "../galaxy/GalaxyImage/galaxyRenderer.js";
import { MILKY_WAY_DEFAULTS } from "../galaxy/GalaxyImage/GalaxyDefaults.js";
import { dartboardGeom, pixelToCell, eventToCanvasPx, drawDartboard, wedgeOnScreen } from "../galaxy/overlay.js";
import { Panel } from "./common.jsx";

/* Galactic Logistics — the polar dartboard over a top-down Milky Way. Each wedge
   is a region of sky (azimuth slice × distance ring), coloured by star density;
   slice 0 points at Sgr A★. Click a wedge to fire a Seed wave (costs one Seed +
   one charge per star). Cyan = seeded front; mint = Insight heard back, at
   front/(1+speedC) — the round trip is the slow outbound leg plus the c-speed return.
   The spiral art is drawn once by <GalaxyImage>; the overlay repaints each tick.

   Sol sits ~52% out (realistic), so the 80k-ly board overruns the canvas — wedges
   that would clip off-frame are simply not drawn, and aren't clickable. */

const GALAXY_PARAMS = {
  ...MILKY_WAY_DEFAULTS,
  galaxyRadius: 50000, // Sol ~52% out — realistic; outer wedges clip off-frame and are dropped
  solDistance: 26000,
  showSol: true,
  showLabels: true,
  showRulers: false,
};
const geom = () => dartboardGeom(GALAXY_PARAMS.galaxyRadius, 0);

const azimuthLabel = (s) => (s === 0 ? "→ Sgr A★" : Math.round((s * 360) / SLICE_COUNT) + "° from centre");
const bandLabel = (b) => Math.round((b * BIN_LY) / 1000) + "–" + Math.round(((b + 1) * BIN_LY) / 1000) + "k ly";

export const GalacticLogistics = observer(function GalacticLogistics() {
  const overlayRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  // flash a readout red when a click can't be afforded: { seeds?: bool, charge?: bool }
  const [flash, setFlash] = useState({ seeds: false, charge: false });
  const flashTimer = useRef(null);

  // reactive reads — touching these makes the observer repaint each tick / on launch
  const day = store.galaxy && store.revealed.galaxy ? store.explore.day : 0;
  const waveCount = store.galaxy ? store.galaxy.waves.length : 0;

  useEffect(() => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return; // jsdom / headless
    const waves = store.galaxy.waves.map((w) => ({ s: w.s, b: w.b, dayLaunched: w.dayLaunched }));
    drawDartboard(ctx, geom(), { hovered, waves, currentDay: day, probeSpeedC: CONFIG.galaxyProbeSpeedC });
  }, [day, waveCount, hovered]);

  if (!store.revealed.galaxy) return null;

  const onMove = (e) => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const g = geom();
    const { mx, my } = eventToCanvasPx(e, cvs);
    const cell = pixelToCell(mx, my, g);
    setHovered(cell && wedgeOnScreen(cell.s, cell.b, g) ? cell : null);
  };
  const onClick = (e) => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const g = geom();
    const { mx, my } = eventToCanvasPx(e, cvs);
    const cell = pixelToCell(mx, my, g);
    if (!cell || !wedgeOnScreen(cell.s, cell.b, g)) return;
    if (store.canSeed(cell.s, cell.b)) { store.seedWedge(cell.s, cell.b); return; }
    // can't launch — if it's specifically a resource shortfall, flash the culprit(s)
    if (store.wedgeSeeded(cell.s, cell.b) || (store.owned.tars_seed_launcher || 0) < 1) return;
    const cost = store.wedgeCost(cell.s, cell.b);
    const shortSeeds  = (store.owned.matrioshka_seed || 0) < cost;
    const shortCharge = store.galaxy.charge < cost;
    if (shortSeeds || shortCharge) {
      setFlash({ seeds: shortSeeds, charge: shortCharge });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash({ seeds: false, charge: false }), 600);
    }
  };

  const charge = store.galaxy.charge;
  const chargeMax = store.galaxyChargeMax;
  const seeds = store.owned.matrioshka_seed || 0;

  let detail = null;
  if (hovered) {
    const stars = LUT[hovered.s][hovered.b];
    const seeded = store.wedgeSeeded(hovered.s, hovered.b);
    const can = store.canSeed(hovered.s, hovered.b);
    const status = seeded ? "seeded" : can ? "ready — click to launch" : (store.owned.tars_seed_launcher || 0) < 1 ? "no launcher" : "need Seeds + charge";
    detail = (
      <div className="galaxy-detail">
        <span className="gd-az">{azimuthLabel(hovered.s)}</span>
        <span className="gd-band">{bandLabel(hovered.b)}</span>
        <span className="gd-stars"><FmtValue value={stars} unit=" stars" /></span>
        <span className="gd-cost">cost <FmtValue value={stars} unit=" Seeds" /> + charge</span>
        <span className={"gd-status" + (can ? " ok" : seeded ? " seeded" : " no")}>{status}</span>
      </div>
    );
  }

  return (
    <Panel title="Galactic Logistics" tag={"Seeds at " + CONFIG.galaxyProbeSpeedC + "c · click a wedge to launch"}>
      <div className="galaxy-readouts">
        <div className={"chip" + (flash.charge ? " flash-short" : "")}>
          <div className="k">Launch charge</div>
          <div className="v"><FmtValue value={charge} /></div>
          <div className="sub">/ <FmtValue value={chargeMax} /> · <FmtValue value={CONFIG.galaxyChargePerDay} unit="/day" forceSign /></div>
        </div>
        <div className={"chip" + (flash.seeds ? " flash-short" : "")}>
          <div className="k">Seeds in hand</div>
          <div className="v"><FmtValue value={seeds} /></div>
          <div className="sub">140 t each — build more</div>
        </div>
        <div className="chip">
          <div className="k">Stars reached</div>
          <div className="v"><FmtValue value={store.galaxySeededStars} /></div>
          <div className="sub">heard <FmtValue value={store.galaxyHeardStars} /></div>
        </div>
        <div className="chip insight">
          <div className="k">Galaxy Insight</div>
          <div className="v"><FmtValue value={store.insightPerDay} unit="/day" /></div>
          <div className="sub">Brains heard from</div>
        </div>
      </div>

      <div className="galaxy-stage">
        <GalaxyImage {...GALAXY_PARAMS} style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }} />
        <canvas
          ref={overlayRef}
          width={VB}
          height={VB}
          className="galaxy-overlay"
          onMouseMove={onMove}
          onMouseLeave={() => setHovered(null)}
          onClick={onClick}
        />
      </div>

      {detail}

      <div className="galaxy-hint">
        Sparse anti-centre wedges are cheap; the bright Sgr A★ wedges are dear. A wave
        crawls out at {CONFIG.galaxyProbeSpeedC}c (cyan); its stars only feed Insight once their
        signal completes the light round-trip home (mint).
      </div>
    </Panel>
  );
});
