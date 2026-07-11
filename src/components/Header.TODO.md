# Header.TODO.md

## Minor

- The `act` label chain (l.76-85) has two branches that both yield "Act III — Into the
  Galaxy": `store.revealed.brain` and `store.research.done.interstellar_probing`. The
  second is unreachable as written for that string (either predicate produces the same
  label), so one is redundant. Harmless, but a reader will wonder what distinction was
  intended — collapse to a single `||`, or make the two produce different labels if that
  was the intent.
- The Sun easter egg (`pokeSun`, l.66-74) both unlocks all framejack tiers AND toggles
  dev mode on the same 5th click. So the "unlock framejack" cheat can't be used without
  also flipping the dev bar. If that coupling is intentional (one gesture = full dev
  access) fine; if not, they may want separate gestures. Also: DevBar.jsx's comment says
  "10 clicks on the Sun" but the actual code here fires at 5 (`n >= 5`). DevBar's comment
  is stale — fix it to 5.

Otherwise OK.
