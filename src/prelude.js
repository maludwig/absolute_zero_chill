/* prelude — the single canonical compact number formatter, shared everywhere.
   Previously this file also destructured MobX/observer globals from the inlined
   UMD libraries; under the bundler each module imports those from the npm
   packages directly, so all that remains here is fmt. SI prefixes: kilo(k) …
   quetta(Q); beyond 10^30 there is no SI prefix, so fall back to e-notation. */
import { convertEnergy, convertPower } from "./power_helpers.js";

// Compact number. With force_sign, always prefixes a sign: "+" for positive,
// "-" for negative, "±" for zero. The sign is part of the returned string so
// fmt()'s padding treats "sign + number" as one right-aligned unit (rather than
// leaving a gap between a caller-supplied sign and a padded magnitude).
function _fmt(n, force_sign = false) {
  const sign = n < 0 ? "-" : force_sign ? (n > 0 ? "+" : "±") : "";
  n = Math.abs(n);
  let body;
  if (n === Infinity) body = "∞";
  else if (n < 1000) body = n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.round(n).toString();
  else if (n >= 1e33) body = n.toExponential(2).replace("e+", "e");
  else {
    const u = ["", "k", "M", "G", "T", "P", "E", "Z", "Y", "R", "Q"];
    let i = 0;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    body = n.toFixed(2) + u[i];
  }
  return sign + body;
}

// Left-pad the compact number with non-breaking spaces to a minimum width of
// min_width (default 7), so values can keep a stable footprint and not reflow the
// DOM as they change size. min_width 0 disables padding; a larger value pads
// wider (min_width 99 → a 99-char string). Width 7 covers a signed, prefixed
// value like "-50.00M". Strings already ≥ min_width are returned unpadded.
// force_sign is forwarded to _fmt so the sign pads together with the number.
const NBSP = "\u00A0";
export function fmt(n, force_sign = false, min_width = 7) {
  const s = _fmt(n, force_sign);
  return s.length >= min_width ? s : NBSP.repeat(min_width - s.length) + s;
}
// fmtPeople — a compact head-count for populations: billions / millions / thousands
// with a "B" / "M" / "k" suffix, because people read "8.10B", not the SI "8.10G".
// Whole numbers below 1000; two decimals above. Population is floored at 0 upstream.
export function fmtPeople(n) {
  n = Math.max(0, Math.round(n));
  if (n < 1000) return String(n);
  for (const [suffix, scale] of [["B", 1e9], ["M", 1e6], ["k", 1e3]]) {
    if (n >= scale) return (n / scale).toFixed(2) + suffix;
  }
  return String(n);
}

/* fmtEnergy / fmtPower — compact formatters for energy and power. They accept the
   same tagged-object inputs as convertEnergy/convertPower (e.g. {joules}, {kWh},
   {kWd} or {W}, {kW}, {Jpd}), convert to the base unit (joule / watt), run it
   through fmt (SI prefix + 7-wide nbsp padding), then append the unit letter:
     fmtEnergy({joules:5000}) -> fmt(5000) + "J"  ("5.00kJ", nbsp-padded)
     fmtPower({kW:50})        -> fmt(50000) + "W" ("50.00kW", nbsp-padded) */
export function fmtEnergy(energy_input) {
  return fmt(convertEnergy("joules", energy_input)) + "J";
}
export function fmtPower(power_input) {
  return fmt(convertPower("W", power_input)) + "W";
}

/* fmtTemp — temperature formatter that descends below 1 K into the sub-Kelvin
   prefixes, so the asymptotic crawl toward absolute zero stays legible instead
   of flattening to "0.00 K". At/above 1 K it reads plain Kelvin. */
export function fmtTemp(K) {
  if (!isFinite(K)) return "— K";
  if (K <= 0) return "0.00 K";
  if (K >= 1) return K.toFixed(2) + " K";
  const scales = [["mK", 1e-3], ["µK", 1e-6], ["nK", 1e-9], ["pK", 1e-12], ["fK", 1e-15], ["aK", 1e-18], ["zK", 1e-21], ["yK", 1e-24]];
  for (const [unit, s] of scales) if (K >= s) return (K / s).toFixed(2) + " " + unit;
  return K.toExponential(2) + " K"; // colder than yoctokelvin — pure science fiction
}

/* fmtTempTriple — the same temperature in all three everyday scales, one decimal
   each: "273.0K / -0.1°C / 31.7°F". For readers who don't think in Kelvin. Kelvin
   keeps its sub-Kelvin prefixes for the endgame crawl toward absolute zero;
   Celsius and Fahrenheit stay plain (they pin near absolute zero down there). */
export function fmtTempTriple(K) {
  if (!isFinite(K)) return "— K";
  let kStr;
  if (K <= 0) kStr = "0.0K";
  else if (K >= 1) kStr = K.toFixed(1) + "K";
  else {
    const scales = [["mK", 1e-3], ["µK", 1e-6], ["nK", 1e-9], ["pK", 1e-12], ["fK", 1e-15], ["aK", 1e-18], ["zK", 1e-21], ["yK", 1e-24]];
    kStr = K.toExponential(1) + "K";
    for (const [unit, s] of scales) if (K >= s) { kStr = (K / s).toFixed(1) + unit; break; }
  }
  const C = K - 273.15;
  const F = K * 1.8 - 459.67;
  return kStr + " / " + C.toFixed(1) + "°C / " + F.toFixed(1) + "°F";
}
