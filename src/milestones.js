/* milestones.js — the reveal/enable notification system.

   Every building/tech/idea has, conceptually, two predicates:
     revealWhen — when its card/entry appears (visible)
     enableWhen — when it becomes actionable (buildable / researchable), given revealed
   A predicate is a set of typed buckets:
     {
       built?:      string[],  // building ids that must be built  (owned >= 1)
       researched?: string[],  // tech ids that must be researched
       realized?:   string[],  // idea ids that must be realized
       completed?:  string[],  // quest keys that must be completed
       flags?:      string[],  // raw story flags (live in store.flags): future use
     }

   Rather than hand-write predicates for all ~80 nodes, we DERIVE them from the data
   already in config (`requires` + `revealKey`) — the cleanly-named flags make this
   unambiguous. A node may still declare `revealWhen`/`enableWhen` explicitly to
   override the derivation (e.g. custom reveal timing).

   Derivation:
     enableWhen = the node's `requires`, bucketed (tech→researched, building→built,
                  idea→realized). This matches the legacy *Unlocked getters exactly.
     revealWhen = for a tech/building WITH a revealKey → that story gate (the revealKey
                  maps to a completed/realized bucket); otherwise (and for ideas) the
                  same as enableWhen. So a story-gated node reveals on its gate (a
                  locked preview) and enables once its prereqs are met; an ungated node
                  reveals and enables together.

   The maps (store.buildingsRevealed/Enabled, techs…, ideas…) are the source of truth
   the getters read. isReady/notifyKeys drive the push updates; initMilestones (re)arms
   everything and doubles as the load-time reconciliation sweep. Pure leaf: imports
   config data, never the store. */
import { BUILDINGS, TECHS, IDEAS } from "./config.js";

// Which store slice each bucket reads, and how one entry is tested against it.
const BUCKETS = {
  built:      (store, id) => (store.owned[id] || 0) >= 1,
  researched: (store, id) => !!store.research.done[id],
  realized:   (store, id) => !!store.philosophy.done[id],
  completed:  (store, k)  => store.completedQuests.includes(k),
  flags:      (store, f)  => !!store.flags[f],
};

// The notify-key suffix per bucket. `flags` has none — story flags fire under their
// own raw name (that's how setFlag(flag) notifies).
const SUFFIX = {
  built: "_built", researched: "_researched", realized: "_realized",
  completed: "_completed", flags: "",
};

export function isReady(store, when) {
  if (!when) return true;
  for (const bucket in BUCKETS) {
    const list = when[bucket];
    if (!list) continue;
    const test = BUCKETS[bucket];
    for (const id of list) if (!test(store, id)) return false;
  }
  return true;
}

export function notifyKeys(when) {
  if (!when) return [];
  const keys = [];
  for (const bucket in SUFFIX) {
    const list = when[bucket];
    if (!list) continue;
    const suffix = SUFFIX[bucket];
    for (const id of list) keys.push(id + suffix);
  }
  return [...new Set(keys)]; // dedupe: register once per distinct key
}

// ---- derivation from legacy requires/revealKey --------------------------------
// invert IDEAS' revealKey (idea_be_one) back to the idea key (be_one_with_the_universe)
const IDEA_KEY_BY_REVEALKEY = {};
for (const k of Object.keys(IDEAS)) {
  if (IDEAS[k].revealKey) IDEA_KEY_BY_REVEALKEY[IDEAS[k].revealKey] = k;
}
// story flags that are really quest completions but aren't named <quest>_complete
const FLAG_TO_QUEST = { core: "act_2a_core", defense: "act_2a_preindustrial", relocated: "act_3_arrive" };

// A revealKey → a `when` predicate.
function revealKeyToWhen(rk) {
  if (rk.endsWith("_complete")) return { completed: [rk.slice(0, -"_complete".length)] };
  if (IDEA_KEY_BY_REVEALKEY[rk]) return { realized: [IDEA_KEY_BY_REVEALKEY[rk]] };
  if (FLAG_TO_QUEST[rk]) return { completed: [FLAG_TO_QUEST[rk]] };
  return { flags: [rk] }; // unknown → treat as a raw story flag (store.flags)
}

// A `requires` list → a `when` predicate, bucketed by what each id resolves to.
function requiresToWhen(requires) {
  const when = {};
  for (const r of requires || []) {
    const bucket = TECHS[r] ? "researched" : BUILDINGS[r] ? "built" : IDEAS[r] ? "realized" : null;
    if (bucket) (when[bucket] ||= []).push(r);
  }
  return when;
}

// Derive (or read explicit) revealWhen/enableWhen for one node.
export function deriveWhen(kind, node) {
  const enableWhen = node.enableWhen ?? requiresToWhen(node.requires);
  let revealWhen = node.revealWhen;
  if (!revealWhen) {
    revealWhen = (kind !== "idea" && node.revealKey)
      ? revealKeyToWhen(node.revealKey)          // story-gated: reveal on the gate
      : requiresToWhen(node.requires);           // ungated / idea: reveal == enable
  }
  return { revealWhen, enableWhen };
}

// ---- arming -------------------------------------------------------------------
const KINDS = [
  { dict: BUILDINGS, kind: "building", revealed: "buildingsRevealed", enabled: "buildingsEnabled" },
  { dict: TECHS,     kind: "tech",     revealed: "techsRevealed",     enabled: "techsEnabled" },
  { dict: IDEAS,     kind: "idea",     revealed: "ideasRevealed",     enabled: "ideasEnabled" },
];

// Derive every node's predicates + notify-keys ONCE at module load — they're static
// (config is the source of truth), so reconciliation never recomputes them.
const ARM_TABLE = KINDS.map(({ dict, kind, revealed, enabled }) => ({
  kind, revealed, enabled,
  nodes: Object.keys(dict).map((id) => {
    const { revealWhen, enableWhen } = deriveWhen(kind, dict[id]);
    const rKeys = notifyKeys(revealWhen);
    const eKeys = [...new Set([...rKeys, ...notifyKeys(enableWhen)])];
    return { id, revealWhen, enableWhen, rKeys, eKeys };
  }),
}));

// Set the map bit now if `predicate` holds (silently — a node already satisfied at
// init/load/reconcile has no "transition" to announce); otherwise register a watcher
// under each key that re-tests and, on the transition, sets the bit and runs `onSet`.
function arm(store, mapName, id, keys, predicate, onSet) {
  if (predicate(store)) { store[mapName][id] = true; return; }
  const fn = (s) => {
    if (s[mapName][id]) return;              // already set → don't re-run onSet
    if (predicate(s)) { s[mapName][id] = true; if (onSet) onSet(s); }
  };
  for (const key of keys) (store.notifyWatchers[key] ||= []).push(fn);
}

// (Re)build the reveal/enable maps + watcher registry from current state. Runs at
// store creation, after every load, and periodically as a safety net — so a missed
// notify self-heals within a few seconds instead of stranding a node.
export function initMilestones(store) {
  store.notifyWatchers = {};
  for (const { kind, revealed, enabled, nodes } of ARM_TABLE) {
    store[revealed] = {};
    store[enabled] = {};
    for (const { id, revealWhen, enableWhen, rKeys, eKeys } of nodes) {
      arm(store, revealed, id, rKeys,
          (s) => isReady(s, revealWhen),
          (s) => s._onReveal(kind, id));                            // fire availability telemetry
      arm(store, enabled, id, eKeys,
          (s) => isReady(s, revealWhen) && isReady(s, enableWhen)); // enabled ⟹ revealed
    }
  }
}

// Light self-heal: set any map bit that SHOULD be set but isn't (a missed notify).
// In-place (no map reassignment) so it only triggers a re-render when a bit actually
// flips — which, given every producer notifies, should be never. Called periodically
// (not per tick) as cheap insurance so a stray missed notify can't strand a node.
export function healMilestones(store) {
  for (const { kind, revealed, enabled, nodes } of ARM_TABLE) {
    const rMap = store[revealed], eMap = store[enabled];
    for (const { id, revealWhen, enableWhen } of nodes) {
      if (!rMap[id] && isReady(store, revealWhen)) { rMap[id] = true; store._onReveal(kind, id); }
      if (!eMap[id] && isReady(store, revealWhen) && isReady(store, enableWhen)) eMap[id] = true;
    }
  }
}
