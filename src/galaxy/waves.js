/* galaxy/waves — pure geometry of a colonization wave.

   A wave is fired from Sol at a wedge (s, b) on some day. Seeds fly outward at a
   fraction of c; c = 1 ly/yr by definition, so a wave's leading edge after
   `daysElapsed` sits at `frontLy`. A wedge's stars are seeded as the front
   crosses that ring's radial band [b·BIN_LY, (b+1)·BIN_LY].

   The Insight a seeded star produces does NOT count until its signal has made the
   round trip back to Sol. With seeds at ~c that return front sits at half the
   outbound distance — so the "heard" fraction uses frontLy/2. No replication: a
   wave seeds only its destination wedge, nothing it passes through. */

import { BIN_LY } from "./lut.js";
import { DAYS_PER_YEAR } from "../shared/model.js";

// Leading-edge distance from Sol, in ly. speedC is a fraction of c.
export function frontLy(speedC, daysElapsed) {
  if (daysElapsed <= 0) return 0;
  return speedC * (daysElapsed / DAYS_PER_YEAR);
}

// Fraction of ring b's radial band that a front at `frontLy` has crossed (0..1).
export function bandFrac(front, b) {
  const near = b * BIN_LY;
  return Math.max(0, Math.min(1, (front - near) / BIN_LY));
}

// Fraction of the destination wedge that is seeded (outbound front reached it).
export function seededFrac(speedC, daysElapsed, b) {
  return bandFrac(frontLy(speedC, daysElapsed), b);
}

// Fraction of the destination wedge whose Insight has returned to Sol.
//
// A star at radius r is reached at r/v, then beams Insight home at c, arriving
// r/c later — so its signal returns at r/v + r/c = r·(1 + v/c)/v. Inverting, the
// returned-signal front sits at  R_heard = frontLy / (1 + speedC).  This makes the
// ramp begin exactly when the first signals return (t = rNear·(1/v + 1/c)) and
// finish when the last do (t = rFar·(1/v + 1/c)).
//   v → c   : R_heard → frontLy/2   (return leg as slow as the outbound)
//   v = 0.1c: R_heard → frontLy/1.1 (slow outbound dominates; heard trails seeded only slightly)
export function heardFrac(speedC, daysElapsed, b) {
  return bandFrac(frontLy(speedC, daysElapsed) / (1 + speedC), b);
}

// Return-trip timestamps (in days) for the near/far edges of ring b — the window
// over which this wedge's Insight ramps from 0 to full.
export function returnWindowDays(speedC, b) {
  const factor = (1 / speedC + 1) * DAYS_PER_YEAR; // (1/v + 1/c) years → days, c = 1 ly/yr
  return [b * BIN_LY * factor, (b + 1) * BIN_LY * factor];
}
