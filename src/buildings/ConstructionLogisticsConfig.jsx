import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { BUILDINGS, LOGISTICS_BUILDABLE_IDS, MULTS, MINE_TO_BODY } from "../config.js";

/* Per-building config UI for Construction Logistics, rendered inside its Construction
   card (above the Build buttons) via BUILDINGS.construction_logistics.ConfigComponent.

   While the unit is running (built + breaker on) the plan is shown read-only with the
   next step marked — editing is locked so the list can't change mid-iteration. Switch
   it off and each row becomes a quantity + building dropdown with a delete control,
   plus a centered [+] to add a step and a Reset to restore the default plan. */

// The quantity tiers offered: x1 plus every unlocked Processing multiplier.
function qtyLabel(n) {
  for (const m of MULTS) if (m.n === n) return "\u00d7" + m.label.replace(/^\+/, "");
  return "\u00d7" + n;
}
function qtyOptions() {
  const opts = [{ n: 1, label: "\u00d71" }];
  for (const m of MULTS) if (store.techDone(m.tech)) opts.push({ n: m.n, label: qtyLabel(m.n) });
  return opts;
}
// Eligible building ids: unlocked, non-depleted, cheapest first.
function buildingOptions() {
  return LOGISTICS_BUILDABLE_IDS
    .filter((id) => store.buildingUnlocked(id) && !(MINE_TO_BODY[id] && store.depleted[MINE_TO_BODY[id].id]))
    .sort((a, b) => BUILDINGS[a].metalCost - BUILDINGS[b].metalCost);
}
const nameOf = (id) => BUILDINGS[id]?.name ?? id;

export const ConstructionLogisticsConfig = observer(function ConstructionLogisticsConfig() {
  const plan = store.logistics.plan;

  if (store.logisticsRunning) {
    const nextIdx = plan.length ? store.logistics.loopIdx % plan.length : -1;
    return (
      <div className="card-config cfg-logistics locked">
        <div className="cfg-head">
          <span className="cfg-label">Build loop</span>
          <span className="cfg-hint">Switch off to edit</span>
        </div>
        <ol className="cfg-plan">
          {plan.map((s, i) => (
            <li key={i} className={"cfg-planline" + (i === nextIdx ? " next" : "")}>
              <span className="cfg-planname">{nameOf(s.building)}</span>
              <span className="cfg-planqty">{qtyLabel(s.qty)}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const qtys = qtyOptions();
  const opts = buildingOptions();
  return (
    <div className="card-config cfg-logistics">
      <div className="cfg-head">
        <span className="cfg-label">Build loop</span>
        <button className="cfg-reset" onClick={() => store.logisticsResetPlan()}>Reset</button>
      </div>
      {plan.map((s, i) => {
        // Always keep the row's current selections available, even if no longer eligible.
        const rowOpts = opts.includes(s.building) ? opts : [s.building, ...opts];
        const rowQtys = qtys.some((q) => q.n === s.qty) ? qtys : [{ n: s.qty, label: qtyLabel(s.qty) }, ...qtys];
        return (
          <div className="cfg-planrow" key={i}>
            <select className="cfg-qty" value={s.qty}
                    onChange={(e) => store.logisticsSetQty(i, Number(e.target.value))}>
              {rowQtys.map((q) => <option key={q.n} value={q.n}>{q.label}</option>)}
            </select>
            <select className="cfg-bld" value={s.building}
                    onChange={(e) => store.logisticsSetBuilding(i, e.target.value)}>
              {rowOpts.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
            <button className="cfg-del" title="Delete step" aria-label="Delete step"
                    disabled={plan.length <= 1} onClick={() => store.logisticsDeleteRow(i)}>{"\uD83D\uDDD1"}</button>
          </div>
        );
      })}
      <button className="cfg-add" title="Add step" aria-label="Add step"
              onClick={() => store.logisticsAddRow()}>+</button>
    </div>
  );
});

// Register on the Construction Logistics building so the Construction panel renders
// this component inside that building's card. Importing this module performs the
// registration as a side effect.
BUILDINGS.construction_logistics.ConfigComponent = ConstructionLogisticsConfig;
