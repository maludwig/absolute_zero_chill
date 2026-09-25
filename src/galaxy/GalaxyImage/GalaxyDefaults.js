// GalaxyDefaults.js
// Single source of truth for the galaxy model's default values. The renderer,
// <GalaxyImage />, the dartboard overlay, and GalacticLogistics all read from
// this, so editing a value here changes the default everywhere.
import { SOL_TO_SGR_A_LY } from "../../shared/model.js";
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
  solDistance: SOL_TO_SGR_A_LY,
  galaxyRadius: 50000,
  showLabels: false,
  showSol: false,
  showRulers: false,
  exportScale: 2,
};
