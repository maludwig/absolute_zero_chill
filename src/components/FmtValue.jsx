/* FmtValue — renders a number through the shared compact formatter (fmt) with an
   optional unit suffix, wrapped in a fixed-width span. fmt left-pads short values
   with nbsp to a stable width; the `.fmt-value` class uses a monospace font so
   those pad characters are exactly as wide as digits, keeping columns of values
   aligned and stopping the DOM from reflowing as numbers change magnitude.

   Pure presentational — value in, span out.

     <FmtValue value={1234} unit="J" />  ->  <span class="fmt-value">…1.23kJ</span>
     <FmtValue value={42} />             ->  <span class="fmt-value">…42</span>
*/
import { fmt } from "../prelude.js";
import { convertPower, convertEnergy } from "../power_helpers.js";

export function FmtValue({ value, unit = "", className, forceSign = false, pad = false }) {
  const min_width = pad ? 7 : 0;
  return (
    <span className={"fmt-value" + (className ? " " + className : "")}>
      {fmt(value, forceSign, min_width) + unit}
    </span>
  );
}

/* FmtPower / FmtEnergy — render a power / energy through FmtValue. They take the
   same tagged inputs as convertPower / convertEnergy ({W}/{kW}/{Jpd} and
   {joules}/{kWh}/{kWd}), convert to the base unit, and label it W / J. forceSign
   always shows a +/-/± sign; pad reserves a fixed 7-wide footprint (default off). */
export function FmtPower({ power, className, forceSign = false, pad = false }) {
  return <FmtValue value={convertPower("W", power)} unit="W" className={className} forceSign={forceSign} pad={pad} />;
}
export function FmtEnergy({ energy, className, forceSign = false, pad = false }) {
  return <FmtValue value={convertEnergy("joules", energy)} unit="J" className={className} forceSign={forceSign} pad={pad} />;
}
