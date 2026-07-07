/* scripts/compute_escape_energy.mjs
   Computes the ideal escape energy to lift a fixed payload off each mineable
   body, using src/physics.js + src/stellar_bodies.json.

   Run:  node scripts/compute_escape_energy.mjs
   The payload defaults to 1000 kg (= 1 tonne), i.e. the energy cost per tonne
   of metal dragged out of each body's gravity well. Override with an argument:
   node scripts/compute_escape_energy.mjs 5000
*/
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { escapeEnergy } from "../src/physics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bodies = JSON.parse(
  readFileSync(join(__dirname, "../src/stellar_bodies.json"), "utf8"),
);

const PAYLOAD_KG = Number(process.argv[2]) || 1000;

// Preserve the config.js mining order (belt → moons → rocky → giants).
const ORDER = [
  "belt",
  "uranian_moons", "neptunian_moons", "moon", "saturnian_moons", "jovian_moons",
  "mercury", "mars", "venus",
  "saturn", "jupiter",
];

const rows = ORDER.map((id) => {
  const b = bodies[id];
  const joules = escapeEnergy(b.mass_kg, PAYLOAD_KG, b.radius_m);
  return { id, body: b.body, joules };
});

const moonJoules = rows.find((r) => r.id === "moon").joules;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(`\nEscape energy to lift ${PAYLOAD_KG} kg (payload) off each body:\n`);
console.log(
  pad("game id", 16) + pad("representative", 16) +
  padL("energy (J)", 14) + padL("×Moon", 12),
);
console.log("-".repeat(58));
for (const r of rows) {
  console.log(
    pad(r.id, 16) +
    pad(r.body, 16) +
    padL(r.joules.toExponential(3), 14) +
    padL((r.joules / moonJoules).toFixed(3), 12),
  );
}
console.log("");
