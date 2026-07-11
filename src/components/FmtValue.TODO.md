# FmtValue.TODO.md

## Minor

- Stale comment: the header says "Pure presentational … Not wired into anything yet."
  It IS wired in — FmtValue/FmtPower/FmtEnergy are used across ~12 components (StatusBar,
  Catalog, Resources, Header, Research, Philosophy, Exploration, GalacticLogistics,
  BuildQueue, frontier/*). Delete that sentence so nobody mistakes it for dead code.

Otherwise OK — clean formatter wrappers. (FIXED: stale "not wired in" line removed.)
