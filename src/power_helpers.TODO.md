# power_helpers.TODO.md

Full read + numerical verification of `src/power_helpers.js` (92 lines) — game-time
energy/power unit conversions. **Clean and notably robust.** Verified by script:
- Round-trips exact: 5 kWh → J → kWh = 5; 12 kW → W → kW = 12.
- Documented identities hold: `convertPower("Jpd",{kW:1}) === J_PER_KWD` (8.64e7),
  1 kWh = 3.6e6 J, 1 kWd = 24 kWh.
- `readTagged` validation rejects all malformed inputs I threw at it: two unit keys, no
  known unit, non-finite value, null, and unknown target unit — each throws a clear error.

This is a model for how the other pure-leaf utilities should validate. No action.
