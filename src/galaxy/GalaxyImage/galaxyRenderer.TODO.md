# galaxyRenderer.TODO.md

Full skim of the 328-line procedural Milky-Way painter — deterministic seeded RNG
(Lehmer/park-miller), arm geometry, star scatter, canvas draw. Pure, no React, unit-testable
per its header. Presentational art; not audited line-by-line (no game-logic surface). OK,
two trivia notes:

- Defines its OWN `fmt(n)` (l.29) — a fourth number formatter distinct from prelude.js's
  canonical `fmt`, plus FmtValue and fmtPeople. This one is renderer-local (galaxy ruler
  labels) and intentionally different (locale thousands, no SI prefix), so it's not really
  duplication — just noting the name collision for anyone grepping `fmt`.
- Exports VB/DRAW_R/SUN_ANGLE that overlay.js correctly anchors its dartboard to — this is
  the "can't drift from the art" anchoring that DOES work (unlike the solDistance seam in
  overlay.TODO #2). The angle/scale anchoring here is the good pattern.
