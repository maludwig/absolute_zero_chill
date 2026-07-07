/* scripts/building_tech_dag.js
   Prints the dependency edges declared in config.js: for every BUILDING and TECH,
   what it `requires`, tagged T(...) for a tech and B(...) for a building. A quick
   experiment to see whether the availability graph is derivable from config alone.
   Run: node scripts/building_tech_dag.js */
import { BUILDINGS, TECHS } from "../src/config.js";

const tag = (id) =>
  TECHS[id]       ? `T(${id})`
  : BUILDINGS[id] ? `B(${id})`
  : `?(${id})`; // neither a tech nor a building

function dump(title, dict) {
  console.log(title + ":");
  for (const id of Object.keys(dict)) {
    const item = dict[id];
    const parts = (item.requires || []).map(tag);
    if (item.revealKey) parts.push(`reveal(${item.revealKey})`);
    console.log(`   ${id} needs ${parts.length ? parts.join(", ") : "—"}`);
  }
  console.log("");
}

dump("BUILDINGS", BUILDINGS);
dump("TECHS", TECHS);

// ---- summary of the edge shapes we hit, to see what a real DAG builder must handle
const unknownReqs = new Set();
const techNeedsBuilding = [];
const revealGated = [];
let buildingCount = 0, techCount = 0;
for (const [dict, kind] of [[BUILDINGS, "B"], [TECHS, "T"]]) {
  for (const id of Object.keys(dict)) {
    if (kind === "B") buildingCount++; else techCount++;
    const item = dict[id];
    for (const r of item.requires || []) {
      if (!TECHS[r] && !BUILDINGS[r]) unknownReqs.add(r);
      if (kind === "T" && BUILDINGS[r]) techNeedsBuilding.push(`${id} -> B(${r})`);
    }
    if (item.revealKey) revealGated.push(`${kind}(${id}) reveal=${item.revealKey}`);
  }
}
console.log("---- summary ----");
console.log(`buildings: ${buildingCount}, techs: ${techCount}`);
console.log(`requires-ids that are neither tech nor building (${unknownReqs.size}):`, [...unknownReqs]);
console.log(`techs that require a building (${techNeedsBuilding.length}):`, techNeedsBuilding);
console.log(`items gated by a revealKey (${revealGated.length}):`);
for (const r of revealGated) console.log("   " + r);
