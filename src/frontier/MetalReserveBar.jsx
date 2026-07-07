import { softLog, K_RESERVE } from "../shared/model.js";
import { FmtValue } from "../components/FmtValue.jsx";

/* MetalReserveBar — the system-level summary: how much of the whole system has
   been pulled into the local Metal reserve. The star dwarfs everything else
   (~99.99% of system mass), so reserve/total is minuscule for all the non-star
   work; we amplify it with softLog (concave) so dust/asteroid/moon/planet
   harvests fill the front of the bar and cracking the star fills the back. */

export function MetalReserveBar({ reserve, totalMass, curveK }) {
  const frac = softLog(reserve / totalMass, curveK == null ? K_RESERVE : curveK);
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div className="reservebar">
      <div className="reservebar-fill" style={{ width: pct + "%" }} />
      <div className="reservebar-label">
        <span>Metal reserve</span>
        <span className="reservebar-val"><FmtValue value={reserve} unit=" T" /></span>
      </div>
    </div>
  );
}
