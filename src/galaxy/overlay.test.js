import { describe, it, expect } from "vitest";
import { dartboardGeom, lyToPx, cellCenterPx, pixelToCell, wedgeBBox, wedgeOnScreen, applyScaleLog, normToColor } from "./overlay.js";
import { SLICE_COUNT, WEDGE_COUNT, PIE_RADIUS_LY } from "./lut.js";

const VB = 680;
const g = dartboardGeom(50000, 0); // realistic Sol placement (~52% out) — board overruns the frame

describe("dartboardGeom", () => {
  it("derives a consistent board geometry", () => {
    expect(g.sliceCount).toBe(SLICE_COUNT);
    expect(g.wedgeCount).toBe(WEDGE_COUNT);
    expect(g.pieRadiusLy).toBe(PIE_RADIUS_LY);
    expect(g.rmax).toBeGreaterThan(0);
    expect(g.anglePerSlice).toBeCloseTo((2 * Math.PI) / SLICE_COUNT, 9);
  });
});

describe("lyToPx", () => {
  it("maps the pie radius onto [RMIN, rmax]", () => {
    expect(lyToPx(0, g)).toBeCloseTo(14, 6);          // RMIN_PX
    expect(lyToPx(PIE_RADIUS_LY, g)).toBeCloseTo(g.rmax, 6);
  });
});

describe("pixelToCell ⟷ cellCenterPx round-trip", () => {
  it("every cell's centre pixel hit-tests back to that cell", () => {
    for (let s = 0; s < SLICE_COUNT; s++) {
      for (let b = 0; b < WEDGE_COUNT; b++) {
        const { x, y } = cellCenterPx(s, b, g);
        expect(pixelToCell(x, y, g)).toEqual({ s, b });
      }
    }
  });

  it("returns null outside the board", () => {
    expect(pixelToCell(g.solX, g.solY, g)).toBe(null);          // inside the dead zone
    expect(pixelToCell(g.solX + g.rmax + 50, g.solY, g)).toBe(null); // past the rim
  });
});

describe("density colormap", () => {
  it("applyScaleLog stays in [0,1] and normToColor yields rgba", () => {
    expect(applyScaleLog(1e8)).toBeGreaterThanOrEqual(0);
    expect(applyScaleLog(1e11)).toBeLessThanOrEqual(1);
    expect(normToColor(0.5, 0.8)).toMatch(/^rgba\(\d+,\d+,\d+,0\.8\)$/);
  });
});

describe("on-screen clipping (realistic Sol placement)", () => {
  it("wedgeBBox is a tight box; the innermost ring is always fully on-screen", () => {
    for (let s = 0; s < SLICE_COUNT; s++) {
      const bb = wedgeBBox(s, 0, g);
      expect(bb.maxX).toBeGreaterThanOrEqual(bb.minX);
      expect(bb.maxY).toBeGreaterThanOrEqual(bb.minY);
      expect(wedgeOnScreen(s, 0, g)).toBe(true);
    }
  });

  it("some outer wedges clip off-frame and are dropped — but not all", () => {
    let on = 0, off = 0;
    for (let s = 0; s < SLICE_COUNT; s++)
      for (let b = 0; b < WEDGE_COUNT; b++) (wedgeOnScreen(s, b, g) ? on++ : off++);
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(0); // realistic placement overruns the frame
    expect(on + off).toBe(SLICE_COUNT * WEDGE_COUNT);
  });

  it("an on-screen wedge's whole bbox lies within the canvas", () => {
    const onCell = [];
    for (let s = 0; s < SLICE_COUNT && !onCell.length; s++)
      for (let b = 0; b < WEDGE_COUNT; b++) if (wedgeOnScreen(s, b, g)) { onCell.push(s, b); break; }
    const bb = wedgeBBox(onCell[0], onCell[1], g);
    expect(bb.minX).toBeGreaterThanOrEqual(0);
    expect(bb.maxX).toBeLessThanOrEqual(VB);
    expect(bb.minY).toBeGreaterThanOrEqual(0);
    expect(bb.maxY).toBeLessThanOrEqual(VB);
  });
});
