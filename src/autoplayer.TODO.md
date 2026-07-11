# autoplayer.TODO.md

Findings from a full read of `src/autoplayer.js` (695 lines). This is the test-only
bot that plays the game one action per tick; it ships to no player, so "bugs" here are
about the autoplay bench's honesty and maintainability, not user-facing behavior.

## Real bugs

### 1. [FIXED] `act_2b_brain` returns the wrong type when it builds the Brain (l.617)
```js
return this.enqueueBuilding(store, "sol_matrioshka_brain", 1);
```
Every other branch returns an action descriptor `{ action, id }`. `enqueueBuilding`
returns `undefined` (it just calls store.enqueue). So the one tick where the bot
actually orders the Brain reports `undefined` instead of `{action:"enqueue",...}`. The
bench's action histogram and any "what did it do" logging silently miss that step. Cheap
fix: wrap in a `{ action: "enqueue", id: "sol_matrioshka_brain" }` return like its
siblings. Doesn't affect completion, just telemetry honesty.

### 2. [FIXED] `scaleBuildPower` and `scaleEconomy` were byte-for-byte identical (l.241-288)
The two functions have exactly the same body (duplication branch, power check, the 0.89
metalPerDay heuristic, the fallthrough to scaleMines). One is dead weight. Either
`scaleBuildPower` was meant to diverge (e.g. skip the mine fallback) and never did, or
it's a copy that should be deleted and its call sites pointed at `scaleEconomy`. Only
caller of `scaleBuildPower` is the `act_2b_brain` branch (l.611, 614). Worth resolving —
right now a reader has to diff them to discover they're the same, and any future edit to
one will silently not apply to the other.

## Smells / latent traps

### 3. [FIXED] `isPowerOfTen` was DUPLICATED with shared/model.js — and my fragility claim was WRONG
CORRECTION (found while reviewing shared/model.js): this file defines its own
`isPowerOfTen` via `Math.log10(num) % 1 === 0` (l.40-47), and shared/model.js defines a
SECOND copy via `Number.isInteger(Math.log10(n))`. I originally flagged the log10 form here
as float-fragile ("log10(1e15) might come back 14.999…"). That was speculation, and it's
FALSE: I exhaustively tested both forms across every power of ten from 1e0 to 1e308 — zero
false negatives, no false positives among tricky non-powers (16, 1024, 16000, 49499…). V8's
Math.log10 is correctly-rounded for exact powers of ten. So the predicate is SAFE at every
value the game uses. The real (much milder) issue is just the DUPLICATION: autoplayer.js
should import model.js's `isPowerOfTen` and delete its local copy so the two can't drift.
Not a correctness bug. See model.TODO #1.

### 4. [FIXED] Dead commented-out rung left in `act_1b_ark` (l.530-532)
A three-line commented scaleUpToBuild for a 500-scanner intermediate rung. Either it's a
tuning artifact to delete, or a note about an intended step. Commented code rots; drop it
or convert to a one-line prose comment.

### 5. `QUEUE_MAX` name vs meaning (l.51-68)
Already extensively documented in-code: it gates *placing an order*, not queue depth, and
the comment admits the name misleads. Not worth renaming (churns the tests), but flagging
that the name is a known wart, documented rather than fixed.

### 6. Frontier stringly-typed ids (`name + "/" + cat`, l.391/397/672)
Action descriptors encode composite ids as slash-joined strings. Fine for a histogram,
but if anything ever parses these back it's fragile. Low priority — it's test telemetry.

## Checked and fine

- The power-headroom accounting (`queuedDraw`/`powerHeadroom`/`canPowerBatch`, l.124-145)
  is the careful heart of the bot and is well-reasoned — it's what the 7,000-tick grid
  regression test guards. Don't touch without that test.
- `clampLegal`/`legalMults` correctly constrain batches to the orderable ladder; the
  "correct by construction" claim at l.160 holds (10^k or 16·10^k, never overlapping).
- The big quest if/else chain in `play()` is long but flat and readable; each arm maps to
  one quest key. Not worth abstracting — the explicitness is a feature for a bot whose job
  is to mirror a specific intended playthrough.
