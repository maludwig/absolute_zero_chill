# Catalog.TODO.md

Full read of `src/components/Catalog.jsx` (264 lines) — the buildable-structures panel:
buy-button matrix, breaker toggles, per-building config components, section grouping. This
was the file skipped in the earlier alphabetical pass. It has the most serious finding of
the whole review: a reproducible user-triggerable crash.

## BUG — FIXED (near-cap batch buttons could throw in `store.enqueue`)

RESOLVED. The fix was in `store.enqueue`, not Catalog: the invariant now accepts a third
legal shape — a top-off order that exactly fills a capped building to its max
(`count === remainingCapacity`). Catalog's `eff = Math.min(m.n, cap)` always lands on either
a power of ten (when `m.n < cap`) or exactly the top-off (when `m.n ≥ cap`), so every buy
button on every capped building is now legal. Verified exhaustively (all capped buildings ×
all owned counts × all MULTS buttons → 0 illegal enqueues), and the multithreaded path
(`enqueueMultithreaded`, which refuses rather than clamps) is covered too. Regression tests
added in store.test.js ("enqueue accepts a top-off-to-max count…", "…still rejects an illegal
count…"). Original description kept below for context.

---

Historical (now fixed): the buy-button builder clamps each MULTS batch to remaining capacity:
```js
const eff = Math.min(m.n, cap);   // cap = store.remainingCapacity(id)
```
and the button's onClick calls `store.enqueue(id, r.n)` (or enqueueMultithreaded). But
`enqueue` enforces a HARD invariant (store.js): `count` must be a power of ten OR a
Duplication doubling (`count === min(owned, cap)`), else it **throws**. `Math.min(m.n, cap)`
is an arbitrary integer — when `cap` isn't a power of ten and isn't equal to `min(owned,cap)`,
the rendered button throws on click.

**Reproduced** (script, real store): `mac_gun_station` (max 100), owned = 40 →
`remainingCapacity = 60`. The ×1000 button clamps to `eff = 60`. 60 is not a power of ten,
and 60 ≠ min(40, 60) = 40, so:
```
enqueue("mac_gun_station", 60) → THROWS:
  count must be a power of ten, or a Duplication doubling of the 40 already owned (got 60).
```
An unhandled exception in a React onClick — it breaks the render. This is reachable in
normal play: the player has Bulk Processing (×1000) long before maxing the 100-cap MAC Gun
Station (or any capped multi-buildable), so any owned count that leaves a non-power-of-ten
gap under a visible batch button is a live crash.

Why it hides: it only bites capped buildings (`max != null`) whose remaining capacity, when a
batch is clamped to it, lands on a non-power-of-ten that also isn't the doubling value. Most
buildings are uncapped (cap = Infinity → `min(m.n, ∞) = m.n`, always legal), so the common
path is fine — which is why tests/playthroughs miss it. The `eff === m.n ? label : <Fmt eff>`
ternary at l.79 even RENDERS the clamped value ("+60"), so the UI advertises the button that
will throw.

**Fix**: clamp to the legal ladder, not to raw capacity — exactly what the autoplayer's
`clampLegal` does (autoplayer.js). Either import/reuse that logic, or drop any batch whose
clamped `eff` isn't a power of ten (only offer legal batches + the explicit ×2 Duplication
button, which is separately handled and correctly uses `min(owned, cap)`). The ×2 dup button
is fine; it's the MULTS-clamp path that's broken.

## Checked and FINE

- The ×2 Duplication button correctly uses `dupN = min(owned, cap)`, which is exactly the
  `isDoubling` value enqueue accepts — so it never throws. Only the MULTS buttons are unsafe.
- `isBuildingCompleted` logic is sound: power-drawing built things stay in the main list;
  only fully-gone (owned 0, depleted) or maxed things tuck away.
- Breaker toggle, unpack-from-cargo (SelfPoweredButton so it survives a blackout), and the
  generator-only "buildable while dark" rule (`powerUsage.W < 0 → SelfPoweredButton`) are all
  correct.
- Section grouping via `sectionForBuilding` + hide-empty-sections is clean.
