// GalaxyDefaults.js
// Single source of truth for the galaxy model's default values. Both the
// standalone app (src/App.jsx) and the <GalaxyImage /> component read from this,
// so editing a value here changes the default everywhere.
export const MILKY_WAY_DEFAULTS = {
  numArms: 4,
  segments: 50,
  windingAngle: 12,
  curvedArms: true,
  coreDensity: 5600,
  edgeDensity: 2070,
  starMinSize: 0.65,
  starMaxSize: 1.25,
  glow: 100,
  transparent: false,
  solDistance: 26000,
  galaxyRadius: 50000,
  showLabels: false,
  showSol: false,
  showRulers: false,
  exportScale: 2,
};
