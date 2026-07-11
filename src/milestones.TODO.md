# milestones.TODO.md

Full read + derivation audit of `src/milestones.js` (174 lines) — the reveal/enable
notification system. Architecturally load-bearing: store.js routes ALL visibility/enable
reads through the six observable maps this file builds. The design (derive predicates from
config's existing `requires` + `revealKey` instead of hand-writing ~80 of them) is genuinely
elegant. Pure leaf — imports config data, never the store.

**Derivation audited sound.** Stress-tested against real config data by script:
- Every `requires` id resolves to exactly ONE bucket (tech/building/idea) — none silently
  dropped by the `bucket ?? null` guard, none ambiguous.
- Every `revealKey` resolves to a real gate (`_complete` quest, idea revealKey, or the
  FLAG_TO_QUEST map) — ZERO hit the `{flags:[rk]}` fallback that could strand a node hidden
  forever. Good: that fallback is a genuine trap (an unknown revealKey → a flag that may
  never be set → permanently invisible node), and nothing currently triggers it.
- No id collisions across the tech/building/idea namespaces (which would make
  `requiresToWhen`'s first-match bucketing ambiguous).
- `enabled ⟹ revealed` holds by construction (enable tests `isReady(revealWhen) &&
  isReady(enableWhen)`), and `healMilestones` preserves the exact same conjunction — so the
  self-heal can't produce an enabled-but-unrevealed node.

## Notes (non-bugs, but non-obvious — worth a comment for the next reader)

### 1. Ideas ignore their OWN revealKey for self-reveal (subtle, currently benign)
`deriveWhen` gates reveal on `revealKey` only when `kind !== "idea"` (l.106). So an idea's
`revealKey` does NOT gate the idea's own visibility — it exists purely to reveal DOWNSTREAM
techs that key off it (e.g. `idea_be_one` reveals k3_distributed_processing /
k3_wave_logistics). Concretely: `be_one_with_the_universe` has empty `requires` + no
idea-level gate, so its `revealWhen` derives to `{}`, which `isReady` treats as always-true
— its `ideasRevealed` bit is set at store creation (t=0), no watcher.

Why this is safe today: the Philosophy PANEL is gated separately by `store.revealed.philosophy`
(false until the Brain is online, store.js l.155), and `ideaVisible` is ANDed with that at
the panel. So the always-set map bit is invisible until the panel unlocks — at which point
the idea should show anyway. Two-layer gating: (map bit) AND (panel reveal).

The trap: someone "tidying" this might make ideas honor their own revealKey (seems more
consistent), which would then gate `be_one` behind `idea_be_one` — a flag that is only set
when `be_one` ITSELF completes. Circular: the idea would gate its own reveal on its own
completion and never appear. The current asymmetry is deliberate; it needs a comment saying
so, because it looks like an oversight.

### 2. `requiresToWhen`'s silent drop is safe ONLY while config stays clean (l.95-96)
`const bucket = TECHS[r] ? ... : null; if (bucket) ...` — an id that resolves to no bucket
is silently omitted from the predicate, which would make a node enable EARLY (missing a
gate). Verified clean now (finding above), but this is load-bearing on config having zero
dangling `requires`. If a future edit adds a `requires: ["typo_id"]`, the node silently
loses that gate instead of erroring. Consider a dev-mode assert in `requiresToWhen` (or a
build-time check) that every requires-id resolves — cheap insurance for a silent failure.

### 3. The `flags` bucket is "future use" (l.12) but the fallback path is live
The header calls `flags` future-use, yet `revealKeyToWhen` (l.88) routes any unknown
revealKey INTO the flags bucket as its fallback. So the fallback is wired even though the
feature is nominally unused. Harmless while nothing hits it (finding above confirms nothing
does), just noting the "future use" label understates that the path is reachable.

## Checked and FINE

- `arm` correctly distinguishes "already satisfied at init → set silently, no onSet" from
  "transition later → fire onSet once". The `if (s[mapName][id]) return` guard makes onSet
  exactly-once even if multiple watcher keys fire.
- `notifyKeys` dedupes (Set) so a node registering under overlapping reveal/enable keys
  doesn't double-run.
- `initMilestones` fully rebuilds from scratch (reassigns the maps) — correct as the
  load-time reconciliation net; `healMilestones` mutates in place so it only re-renders on
  an actual flip. The split is intentional and right.
