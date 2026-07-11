# quests.TODO.md

Full read + engine audit of `src/quests.js` (377 lines) — the main quest spine
(`MAIN_STORY_CHAIN`, 22 quests across Acts 1A–3) and the chain-builder. This is the
backbone the game and the autoplayer both walk. Verified by script:

- **22 unique keys**, no duplicates; `FIRST_QUEST_KEY` matches the first quest.
- **Forward chain is complete**: walking `nextQuestKey` from the first reaches all 22 and
  terminates at `null`. No orphans, no cycles.
- **Every chain entry is well-formed** (`test` and `action` both functions).
- **The onComplete / onLoadedSave persistence contract holds** (details below) — no quest
  silently loses a non-persisted effect on load.

The per-quest reasoning comments are excellent (e.g. why act_1a_initialize's test is
`() => true`, why each Act 2A cooling threshold is its own quest). This file is in good shape.

## Findings

### 1. [BY DESIGN — now commented] `act_1b_ark` gates completion on `powerNet > 0` (l.104)
RESOLVED as intentional (per game author). The player converses with the re-instantiated
user running ON the Ark, so the Ark can't be offline at completion — a browned-out grid
means no live substrate for that conversation. A save parked here with chronically negative
power correctly waits until the grid can keep the Ark lit. Now documented with a comment at
the todoList so it no longer reads as an oversight. Original analysis below for context.
The Ark quest's third todo is `owned >= 1 && breakerOn && powerNet > 0`. The first two are
monotonic (once true, stay true), but `powerNet > 0` OSCILLATES — it's negative whenever
the grid is momentarily oversubscribed. Since this is a SPINE quest, if the test happens to
evaluate during a power dip, completion is deferred until the next tick where power is
positive. In practice the autoplayer keeps the grid healthy so it completes fine, and a
human would too — but it's the only completion gate in the whole chain that depends on a
non-monotonic condition. If a player parked here with a chronically negative grid, the spine
would stall with no obvious "why" (the Ark looks built and on). Consider gating on
`owned >= 1 && breakerOn` only (the Ark being ON is the milestone; whether the grid is
net-positive this exact tick is incidental), or documenting that the stall is power-driven.

### 2. `applyXCaps` onLoadedSave hooks are currently REDUNDANT (intentional, per comment)
The three cap helpers (applyScannerCaps/Matrix/Ark) run in both `onComplete` AND
`onLoadedSave`, but `buildingMaxOverrides` (what they set) IS persisted (verified in
STATE_KEYS) — so the load-time replay currently rewrites values the save already restored.
This is deliberate belt-and-suspenders: the l.54-61 comment says the plan is to STOP
persisting buildingMaxOverrides and rebuild it purely from replay, at which point these
hooks become load-bearing. Flagging only so nobody deletes the "redundant" onLoadedSave
hooks without also doing that persistence change — they look dead but they're staged. (This
is the same item as the project-level TODO's "retire buildingMaxOverrides persistence".)

### 3. `generateStoryChain` mutates its input array elements (l.327)
`quest.nextQuestKey = nextQuestKey` writes onto the shared module-level quest objects, and
`AVAILABLE_QUESTS[quest.key] = quest` aliases them. Benign — called exactly once at module
load, and the quest objects aren't frozen or reused elsewhere — but it's a side effect in a
function named "generate" (which reads as pure). A reader might expect it to return a new
structure without touching the inputs. Minor; a one-word comment ("mutates: stamps
nextQuestKey") would set expectations.

## Checked and FINE (persistence contract, in detail)

Audited every `onComplete` side-effect against STATE_KEYS:
- `revealed.defense/core/brain/philosophy/galaxy` — all under `revealed`, which IS persisted.
  So the quests that set these WITHOUT an onLoadedSave are correct: the flag survives the save.
- `galaxy.relocateDay0` (act_3_sail) — `galaxy` is persisted. Correct, no onLoadedSave needed.
- `showXModal` (5 quests) — all persisted AND the event engine fast-forwards past fired beats
  on load, so modals correctly do NOT re-pop. Correct to have no onLoadedSave.
- `buildingMaxOverrides` (the 3 cap quests) — persisted; onLoadedSave present but redundant
  (finding #2). Correct behavior either way.
Conclusion: the "persisted → no onLoadedSave; transient → onLoadedSave" rule the header
states is followed, and there is currently NO quest that sets a non-persisted effect without
a replay hook. The contract is sound.
