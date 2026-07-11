# story.TODO.md

> RESOLVED — the ×100M/×10k labels now interpolate FRAMEJACKS.*.label (both correct).

Full read of `src/story.js` (37 lines) — now just `FRAMEJACK_CHAIN` (two flavor callouts)
plus the `STORY_CHAIN` composition, after the main spine moved to quests.js. The chain
shape and engine wiring are fine.

## Finding

### 1. `planckRate` log states the WRONG multiplier — "×100,000" vs actual ×100M (1e8)
The `planckRate` event (l.27) logs: *"Framejack ×100,000 unlocked — the fastest clock
physics permits."* But `FRAMEJACKS.planck_rate_processing.fj` is **1e8** and its label is
**×100M** (config.js). So the flavor text is off by 1000× (100,000 vs 100,000,000). The
sibling `quantumCpu` log ("×10,000") happens to match `×10k` correctly, so only this one is
wrong.

Root cause: these two story logs HARDCODE the multiplier as a literal string, whereas the
config tech descriptions interpolate `${FRAMEJACKS.*.label}` and therefore can't drift. Fix:
either interpolate the label here too (`${FRAMEJACKS.planck_rate_processing.label}`), or just
correct the literal to ×100M. Interpolation is better — it makes this immune to the next
rebalance, same as the config descs. User-facing, but low-severity (a late-game flavor line).

## Checked and FINE

- `STORY_CHAIN` is an array-of-chains (MAIN_STORY_CHAIN + FRAMEJACK_CHAIN), matching the
  engine's expected shape (same as ALL_NEWS_CHAINS) — round-robin + self-prune apply.
- FRAMEJACK_CHAIN correctly sits OFF the DIRECTIVE spine (flavor, not objectives), as the
  header explains — these fire whenever their tech completes, independent of quest order.
- `test`/`action` are pure reads + a single `pushLog`, matching the news/story engine
  contract (action runs once, the tick after test first passes).
