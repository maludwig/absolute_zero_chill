"use client";
// GalaxyImage.jsx
// A controlled React component that renders the Milky Way model to a <canvas>.
// Pass any subset of the props below; everything has a sensible default. The
// component owns no slider/toggle state of its own — drive it from your parent.
//
// Imperative handle (via ref): getCanvas(), toDataURL(), toBlob(), downloadPNG().

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  VB,
  fmt,
  drawGalaxy,
  createStarFields,
  DEFAULT_STAR_POOL,
  DEFAULT_CORE_SEED,
  DEFAULT_EDGE_SEED,
} from "./galaxyRenderer";
import { MILKY_WAY_DEFAULTS } from "./GalaxyDefaults";

const GalaxyImage = forwardRef(function GalaxyImage(props, ref) {
  const {
    // structure
    numArms = MILKY_WAY_DEFAULTS.numArms,
    segments = MILKY_WAY_DEFAULTS.segments,
    windingAngle = MILKY_WAY_DEFAULTS.windingAngle, // arm pitch angle, in degrees
    curvedArms = MILKY_WAY_DEFAULTS.curvedArms,
    // scale + Sun placement
    solDistance = MILKY_WAY_DEFAULTS.solDistance, // light-years from Sgr A*
    galaxyRadius = MILKY_WAY_DEFAULTS.galaxyRadius, // light-years
    // random star fields
    coreDensity = MILKY_WAY_DEFAULTS.coreDensity, // dots, 0..starPool
    edgeDensity = MILKY_WAY_DEFAULTS.edgeDensity, // dots, 0..starPool
    starMinSize = MILKY_WAY_DEFAULTS.starMinSize, // px
    starMaxSize = MILKY_WAY_DEFAULTS.starMaxSize, // px
    // appearance
    glow = MILKY_WAY_DEFAULTS.glow, // base glow intensity, 0..100
    transparent = MILKY_WAY_DEFAULTS.transparent,
    showLabels = MILKY_WAY_DEFAULTS.showLabels,
    showSol = MILKY_WAY_DEFAULTS.showSol,
    showRulers = MILKY_WAY_DEFAULTS.showRulers,
    // rendering
    exportScale = MILKY_WAY_DEFAULTS.exportScale, // intrinsic canvas = 680 * exportScale
    coreSeed = DEFAULT_CORE_SEED,
    edgeSeed = DEFAULT_EDGE_SEED,
    starPool = DEFAULT_STAR_POOL, // size of each generated dot pool
    className,
    style,
    ...rest
  } = props;

  const canvasRef = useRef(null);

  // Regenerated only when a seed or the pool size changes — not on every redraw.
  const fields = useMemo(
    () => createStarFields(coreSeed, edgeSeed, starPool),
    [coreSeed, edgeSeed, starPool]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / headless: no 2D context — skip drawing
    drawGalaxy(
      ctx,
      {
        numArms,
        segments,
        windingAngle,
        curvedArms,
        coreDensity,
        edgeDensity,
        starMinSize,
        starMaxSize,
        glow,
        transparent,
        solDistance,
        galaxyRadius,
        showLabels,
        showSol,
        showRulers,
        exportScale,
      },
      fields
    );
  }, [
    numArms,
    segments,
    windingAngle,
    curvedArms,
    coreDensity,
    edgeDensity,
    starMinSize,
    starMaxSize,
    glow,
    transparent,
    solDistance,
    galaxyRadius,
    showLabels,
    showSol,
    showRulers,
    exportScale,
    fields,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      getCanvas: () => canvasRef.current,
      toDataURL: (type = "image/png", quality) =>
        canvasRef.current ? canvasRef.current.toDataURL(type, quality) : null,
      toBlob: (cb, type = "image/png", quality) =>
        canvasRef.current && canvasRef.current.toBlob(cb, type, quality),
      downloadPNG: (
        filename = `milky-way_${numArms}arms_${fmt(galaxyRadius)}ly.png`
      ) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        }, "image/png");
      },
    }),
    [numArms, galaxyRadius]
  );

  return (
    <canvas
      ref={canvasRef}
      width={VB * exportScale}
      height={VB * exportScale}
      className={className}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
      role="img"
      aria-label={`Top-down model of a ${numArms}-arm spiral galaxy, radius ${fmt(
        galaxyRadius
      )} light-years, Sun ${fmt(solDistance)} light-years from the core`}
      {...rest}
    />
  );
});

export default GalaxyImage;
