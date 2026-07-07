/* power_helpers.js — unit conversions for the power/energy system, entirely in
   game-time. There is no real-world / tick coupling here: a day is 24 hours and
   an hour is 3600 seconds purely as unit *definitions*, so these are plain
   dimensional conversions (the same way "1 km = 1000 m" carries no clock).

   Energy units: joules, kWh, kWd (kilowatt-day = 24 kWh).
   Power  units: W, kW, Jpd (joules per game-day).

   Inputs are single-key objects that tag their own unit, e.g. {joules: 5e8} or
   {kW: 12}. This keeps call sites self-documenting:

     const eJ   = escapeEnergy(m, 1000, r);                 // J per tonne
     const eKWh = convertEnergy("kWh", { joules: eJ });     // kWh per tonne
     const eKWd = convertEnergy("kWd", { kWh: eKWh });      // kWd per tonne
*/

export const HOURS_PER_DAY = 24;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY; // 86400 (a day, defined)
export const J_PER_KWH = 1000 * SECONDS_PER_HOUR;               // 3.6e6 J  (1 kW for 1 h)
export const J_PER_KWD = J_PER_KWH * HOURS_PER_DAY;             // 8.64e7 J (1 kW for 1 day)

// energy unit -> joules
const ENERGY_TO_J = {
  joules: 1,
  kWh: J_PER_KWH,
  kWd: J_PER_KWD,
};

// power unit -> watts. "Jpd" (joules per game-day) is a power too: 1 J spread over
// a game-day of SECONDS_PER_DAY seconds. So convertPower("Jpd", { kW: 1 }) is the
// energy (in J) a sustained 1 kW delivers over one game-day (= J_PER_KWD).
const POWER_TO_W = {
  W: 1,
  kW: 1000,
  Jpd: 1 / SECONDS_PER_DAY,
};

// Pull the {unit: value} pair out of a tagged input object, validating it names
// exactly one known unit and carries a finite number.
function readTagged(input, table, kind) {
  if (input === null || typeof input !== "object") {
    throw new TypeError(
      `${kind} input must be a tagged object like {${Object.keys(table)[0]}: value}, got ${JSON.stringify(input)}`,
    );
  }
  const units = Object.keys(input).filter((k) => k in table);
  if (units.length !== 1) {
    throw new Error(
      `${kind} input must name exactly one known unit (${Object.keys(table).join(", ")}); got keys [${Object.keys(input).join(", ")}]`,
    );
  }
  const unit = units[0];
  const value = input[unit];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${kind} value for "${unit}" must be a finite number, got ${value}`);
  }
  return { unit, value };
}

/**
 * Convert an energy from one unit to another.
 * @param {"joules"|"kWh"|"kWd"} to_unit - target unit
 * @param {{joules?:number, kWh?:number, kWd?:number}} energy_input - tagged input, one key
 * @returns {number} the energy expressed in `to_unit`
 */
export function convertEnergy(to_unit, energy_input) {
  if (!(to_unit in ENERGY_TO_J)) {
    throw new Error(`convertEnergy: unknown target unit "${to_unit}" (known: ${Object.keys(ENERGY_TO_J).join(", ")})`);
  }
  const { unit, value } = readTagged(energy_input, ENERGY_TO_J, "energy");
  const joules = value * ENERGY_TO_J[unit];
  return joules / ENERGY_TO_J[to_unit];
}

/**
 * Convert a power from one unit to another. Units: W, kW, and Jpd (joules per
 * game-day). Because Jpd is a power unit, converting into it gives energy-over-a-day:
 * convertPower("Jpd", { kW: 1 }) === J_PER_KWD — the joules a sustained 1 kW delivers
 * over one game-day.
 * @param {"W"|"kW"|"Jpd"} to_unit - target unit
 * @param {{W?:number, kW?:number, Jpd?:number}} power_input - tagged input, one key
 * @returns {number} the power expressed in `to_unit`
 */
export function convertPower(to_unit, power_input) {
  if (!(to_unit in POWER_TO_W)) {
    throw new Error(`convertPower: unknown target unit "${to_unit}" (known: ${Object.keys(POWER_TO_W).join(", ")})`);
  }
  const { unit, value } = readTagged(power_input, POWER_TO_W, "power");
  const watts = value * POWER_TO_W[unit];
  return watts / POWER_TO_W[to_unit];
}
