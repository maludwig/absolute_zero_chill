import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { TECHS, BODIES, CONFIG } from "../config.js";
import { ProgressBar } from "./common.jsx";
import { FmtValue } from "./FmtValue.jsx";

/* Resources — the top strip of live readouts, plus the body-depletion panel. */

export const Resources = observer(function Resources() {
  const researchSub = store.research.selected
    ? (TECHS[store.research.selected]?.name ?? store.research.selected)
    : store.buildQueue.length > 0
      ? "(replicas building)"
      : "—";
  return (
    <div className="res">
      <div className="chip metal">
        <div className="k">Metal</div>
        <div className="v"><FmtValue value={store.metal} /></div>
        <div className="sub"><FmtValue value={store.metalPerDay} unit="/day" forceSign /></div>
      </div>
      <div className="chip build">
        <div className="k">Build power</div>
        <div className="v"><FmtValue value={store.buildPerDay} unit=" BP/day" /></div>
        <div className="sub">+ Assist clicks</div>
      </div>
      <div className="chip research">
        <div className="k">Research</div>
        <div className="v">{store.researchPerDay > 0 ? <FmtValue value={store.researchPerDay} unit=" RP/day" /> : "idle"}</div>
        <div className="sub">{researchSub}</div>
      </div>
      {store.revealed.philosophy && (
        <div className="chip insight">
          <div className="k">Insight</div>
          <div className="v">{store.insightPerDay > 0 ? <FmtValue value={store.insightPerDay} unit="/day" /> : "idle"}</div>
          <div className="sub">
            {store.philosophy.selected ? "contemplating" : "no idea focused"}
          </div>
        </div>
      )}
      {store.revealed.defense && (
        <div className={"chip vessels" + (store.humanVessels > 1 ? " alert" : "")}>
          <div className="k">Human Vessels</div>
          <div className="v"><FmtValue value={store.humanShips} /></div>
          <div className="sub">
            {store.surfaceTemp > CONFIG.humanFreezeTemp ? "+0.1/tick" : "launches halted"}
            {store.macKill > 0 ? <> · <FmtValue value={-store.macKill} unit=" MAC" forceSign /></> : ""}
          </div>
        </div>
      )}
    </div>
  );
});

/* Depletions — a progress bar per active body showing how much mass remains,
   each tinted with that body's own palette. Shows the belt plus any body the
   player has begun mining, grouped into Belt / Moons / Planets sections. A
   section header only appears when that section currently has a visible bar. */

// tier → section. Grouping lets the shared "Moons" word live in one header
// instead of on every row, so the moon labels stay short and single-line
// (uneven "Saturnian Moons"/"Jovian Moons" widths were making rows wrap).
const DEP_SECTIONS = [
  { key: "belt",    title: "Belt",    tiers: ["belt"] },
  { key: "moons",   title: "Moons",   tiers: ["moon"] },
  { key: "planets", title: "Planets", tiers: ["rocky", "giant"] },
];

// Row label. Moons drop the trailing "Moons" (now the header) and pluralise the
// adjective — "Uranian Moons" → "Uranians"; Earth's own Moon becomes Luna.
function depLabel(b) {
  if (b.tier !== "moon") return b.short;
  if (b.id === "moon") return "Luna";
  return b.short.replace(/ Moons$/, "") + "s";
}

export const Depletions = observer(function Depletions() {
  const rows = [];
  for (const b of BODIES) {
    // belt is always a candidate; other bodies appear once mining has begun
    if (b.id !== "belt" && (store.owned[b.mineId] || 0) === 0) continue;
    // a fully-exhausted body drops off the panel entirely
    if (store.depleted[b.id]) continue;
    const rem = store.remainingMass(b);
    if (rem <= 0) continue;
    const minedAmt = store.mined[b.id] || 0;
    const minedFrac = minedAmt / b.mass;
    rows.push({ b, rem, minedAmt, minedFrac });
  }
  if (!rows.length) return null;

  // bucket rows by section, dropping any section with nothing to show
  const sections = DEP_SECTIONS
    .map((sec) => ({ sec, items: rows.filter((r) => sec.tiers.includes(r.b.tier)) }))
    .filter(({ items }) => items.length > 0);

  return (
    <section className="panel depletions">
      <h2>Bodies</h2>
      {sections.map(({ sec, items }) => (
        <div key={sec.key} className="dep-section">
          <h3 className="dep-section-title">{sec.title}</h3>
          <div className="depletion-rows">
            {items.map(({ b, rem, minedAmt, minedFrac }) => (
              <div key={b.id} className={"depletion-row " + b.id}>
                <div className="dep-head">
                  <span className="dep-name">{depLabel(b)}</span>
                  <span className="dep-stat">{(minedFrac * 100).toFixed(6)}% mined · <FmtValue value={minedAmt} unit="T" /></span>
                </div>
                <ProgressBar value={rem} max={b.mass} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
});
