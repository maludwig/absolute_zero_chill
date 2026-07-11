# StatusBar.TODO.md

## Minor

- `fjDef = store.framejackLevels.find(...)` (l.26) then reads `fjDef.label` (l.53) guarded
  only by `showFj`. If `store.explore.framejack` is ever set to a value not present in
  `framejackLevels` (e.g. a save from a build with different tiers, or a dev poke), `find`
  returns undefined and `.label` throws, taking down the whole status bar render. Cheap
  guard: `fjDef?.label ?? store.explore.framejack`. Low likelihood but it's a hard crash,
  not a graceful degrade.

Otherwise OK.
