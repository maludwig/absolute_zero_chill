# Header.TODO.md

## Minor

- The `act` label chain (l.76-85) has two branches that both yield "Act III — Into the
  Galaxy": `store.revealed.brain` and `store.research.done.interstellar_probing`. The
  second is unreachable as written for that string (either predicate produces the same
  label), so one is redundant. Harmless, but a reader will wonder what distinction was
  intended — collapse to a single `||`, or make the two produce different labels if that
  was the intent.

Otherwise OK.
