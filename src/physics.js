/* physics.js — small, pure physics helpers shared across the game.
   No game state, no imports from config/store; just numbers in, numbers out,
   so this stays trivially testable and reusable (e.g. the mines-require-power
   task derives each mine's power draw from escapeEnergy below). */

// Gravitational constant, m^3 kg^-1 s^-2
export const G = 6.67430e-11;

/**
 * Total gravitational escape energy for a payload lifted from a body's surface
 * to infinity — i.e. the magnitude of its gravitational binding energy at r.
 *
 *   U(r) = -G·M·m / r   (potential energy at the surface)
 *   E_escape = 0 - U(r) = G·M·m / r
 *
 * This is the ideal minimum (no drag, no engine losses, KE-only floor). It
 * equals ½·m·v_esc², so escapeEnergy / m is the per-kg cost of leaving the well.
 *
 * @param {number} m_body_kg    - Mass of the celestial body in kg
 * @param {number} m_payload_kg - Mass of the object escaping in kg
 * @param {number} r_body_m     - Radius of the body (starting distance) in metres
 * @returns {number} Total escape energy in Joules
 */
export function escapeEnergy(m_body_kg, m_payload_kg, r_body_m) {
  return (G * m_body_kg * m_payload_kg) / r_body_m;
}
