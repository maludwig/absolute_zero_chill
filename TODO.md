# TODO — things worth considering next

Hand-off notes from the reveal/enable notify migration (the session that replaced the
per-tick `checkMilestones` catalog scan with push-based reveal/enable maps). Ordered
roughly by priority. Nothing here is urgent; the game builds and all tests pass.

## Humans keep growing in population at -268.1°C

The human population is supposed to increase every game-day, as defined in CONFIG.
But it doesn't make sense for humans to keep growing indefinitely. We should add
a HUMAN_GROWTH_STOP_TEMPERATURE entry in the CONFIG, perhaps selecting a value where
humans would struggle.

## Fix the `skipStoryFlags` / `reachMainQuest` test helper
It sets `flags[k]` but never populates `completedQuests`, so it doesn't mirror a real
save (which persists `completedQuests`) and won't trigger quest-gated reveals. No
current test trips on it, but a future test that jumps ahead with `reachMainQuest` and
then checks a reveal will silently see the node hidden. Consider having it also push
the skipped *quest* keys into `completedQuests` — carefully, since MAIN_STORY_CHAIN may
contain non-quest beats and quest-engine code calls `getQuestByKey`.

## Fold the body sweeps into the mining loop (perf)
Removing the catalog scan left `checkMilestones` at ~23µs/tick, now dominated by the
two per-tick `BODIES` sweeps (first-mine log + depletion `remaining()` check) and their
MobX proxy reads. The depletion sweep already skips un-mined/exhausted bodies; the
cleaner win is folding both into the existing mining loop (which already iterates mined
bodies and computes `remaining`). Deferred here because the mining loop's expm1/floor
rate math is precision-sensitive — do it with time to re-verify the harvest tests.

## (Optional) Consolidate the last `revealed.*` flags into `store.flags`
`revealed` now holds only the semantic story flags still read by UI/tick:
`core`, `defense`, `brain`, `philosophy`, `galaxy` (read in Header/Resources/
GalacticLogistics/Philosophy and the defense tick). With the per-node reveal flags
gone, `revealed` vs `flags` is a fuzzy split. Could move these into `store.flags`
(inputs) so `revealed`-as-a-concept fully retires in favor of the milestone maps
(outputs). Touches a handful of UI consumers; purely a clarity refactor.
