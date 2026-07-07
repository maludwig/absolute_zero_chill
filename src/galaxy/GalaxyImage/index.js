// index.js — public entry point for the GalaxyImage module.
export { default } from "./GalaxyImage";
export { default as GalaxyImage } from "./GalaxyImage";
export { MILKY_WAY_DEFAULTS } from "./GalaxyDefaults";
export {
  drawGalaxy,
  buildArms,
  createStarFields,
  galaxyStats,
  fmt,
  VB,
  DEFAULT_STAR_POOL,
  DEFAULT_CORE_SEED,
  DEFAULT_EDGE_SEED,
} from "./galaxyRenderer";
