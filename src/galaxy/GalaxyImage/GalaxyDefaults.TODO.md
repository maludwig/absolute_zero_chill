# GalaxyDefaults.TODO.md

Single-source-of-truth defaults for the spiral-art renderer. OK, with one cross-reference:

- `solDistance: 26000` here is the THIRD copy of that literal (see overlay.TODO #2:
  overlay.js `R_SOL_LY`, overlay.js `GALAXY_PARAMS.solDistance`, and this one). The
  dartboard geometry and the painted galaxy agree only because all three are 26000. This
  file is the "single source of truth" per its own header — so the fix for overlay.TODO #2
  is to make overlay.js import solDistance FROM here rather than redeclare it.
