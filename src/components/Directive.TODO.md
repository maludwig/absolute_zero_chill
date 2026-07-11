# Directive.TODO.md

## Minor

- `item.test(store)` is wrapped in try/catch that silently swallows any error as "not
  done" (l.20). Pragmatic for render safety, but it means a genuinely throwing quest
  predicate (e.g. one referencing a renamed field) shows as an unchecked box forever
  rather than surfacing. Acceptable for production; just note that a broken todo fails
  invisibly here rather than loudly.

Otherwise OK.
