import { describe, it, expect } from "vitest";
import { chordHalfWidth, drawScanBar } from "./scanBar.js";

/* A recording stand-in for a 2D canvas context. drawScanBar only ever calls a
   handful of methods and reads/writes a few style props, so we log every call
   as { name, args } and let gradient factories hand back a stub whose
   addColorStop is likewise logged. Node is the default test env (no real
   canvas), which is exactly why scanBar.js keeps its drawing pure — mirroring
   the galaxy overlay.js / waves.js split. */
function makeMockCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push({ name, args }); };
  const gradient = () => ({ addColorStop: rec("addColorStop") });
  return {
    calls,
    save: rec("save"),
    restore: rec("restore"),
    beginPath: rec("beginPath"),
    arc: rec("arc"),
    clip: rec("clip"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    clearRect: rec("clearRect"),
    fillRect: rec("fillRect"),
    createLinearGradient: (...args) => { calls.push({ name: "createLinearGradient", args }); return gradient(); },
    createRadialGradient: (...args) => { calls.push({ name: "createRadialGradient", args }); return gradient(); },
    // writable style props — assignment is a no-op we don't need to observe
    lineCap: "",
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
  };
}

const count = (ctx, name) => ctx.calls.filter((c) => c.name === name).length;
// Dots are the only thing that uses a radial gradient; its first arg is the
// dot's centre x. So the radial-gradient call log IS the painted-dot log.
const paintedDotXs = (ctx) =>
  ctx.calls.filter((c) => c.name === "createRadialGradient").map((c) => c.args[0]);

// Full seam look, matching the constants EarthScanner locks in (512 space).
const LOOK = { dotGlowRadius: 10, lineHeight: 2.8, lineGlowRadius: 15 };
const frame = (over) => ({ size: 512, timeMs: 0, dotCount: 10, ...LOOK, ...over });

describe("chordHalfWidth", () => {
  it("is the full radius at the centre and zero at the rim", () => {
    expect(chordHalfWidth(256, 0)).toBe(256); // equator: chord spans the diameter
    expect(chordHalfWidth(256, 256)).toBe(0);  // touching the pole: no width
    expect(chordHalfWidth(256, -256)).toBe(0); // symmetric in sign
  });

  it("matches the Pythagorean chord (6-8-10 triangle)", () => {
    expect(chordHalfWidth(10, 6)).toBeCloseTo(8, 9);
    expect(chordHalfWidth(10, -6)).toBeCloseTo(8, 9); // sign of dy doesn't matter
  });

  it("clamps past the rim to 0 rather than returning NaN", () => {
    expect(chordHalfWidth(10, 25)).toBe(0);
    expect(Number.isNaN(chordHalfWidth(10, 25))).toBe(false);
  });
});

describe("drawScanBar — clearing", () => {
  it("clears the whole canvas first, exactly once, on every frame", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5 }));
    expect(count(ctx, "clearRect")).toBe(1);
    expect(ctx.calls[0]).toEqual({ name: "clearRect", args: [0, 0, 512, 512] });
  });
});

describe("drawScanBar — degenerate seam positions draw nothing but the clear", () => {
  // In all three the seam isn't a real chord across the globe, so the function
  // bails right after clearing: no save(), no clip, no strokes, no dots.
  const onlyCleared = (scannedFraction) => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction }));
    expect(count(ctx, "clearRect")).toBe(1);
    expect(count(ctx, "save")).toBe(0);
    expect(ctx.calls).toHaveLength(1);
  };

  it("does nothing when fully unscanned (fraction 0)", () => onlyCleared(0));
  it("does nothing when fully scanned (fraction 1)", () => onlyCleared(1));
  it("does nothing for a sub-pixel sliver near a pole (fraction > 0 but half ≤ 1)", () => {
    // 1e-6 clears the fraction<=0 guard, so reaching the cleared-only state
    // here specifically exercises the half<=1 sliver guard.
    onlyCleared(1e-6);
  });
});

describe("drawScanBar — the full seam at the equator", () => {
  it("balances save/restore and clips to the globe circle before drawing", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5 }));
    expect(count(ctx, "save")).toBe(1);
    expect(count(ctx, "restore")).toBe(1);
    // clip is an arc over the full disc, and clip() follows the arc
    const arc = ctx.calls.find((c) => c.name === "arc");
    expect(arc.args).toEqual([256, 256, 256, 0, Math.PI * 2]);
    const iArc = ctx.calls.findIndex((c) => c.name === "arc");
    const iClip = ctx.calls.findIndex((c) => c.name === "clip");
    expect(iClip).toBeGreaterThan(iArc);
  });

  it("draws the seam line spanning the full equatorial chord", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5 }));
    // at fraction 0.5 the chord is the whole width: x0=0, x1=size, y=size/2
    expect(ctx.calls).toContainEqual({ name: "moveTo", args: [0, 256] });
    expect(ctx.calls).toContainEqual({ name: "lineTo", args: [512, 256] });
    expect(count(ctx, "stroke")).toBe(1);
  });
});

describe("drawScanBar — seam styling toggles", () => {
  it("omits the crisp line when lineHeight is 0", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5, lineHeight: 0 }));
    expect(count(ctx, "stroke")).toBe(0);
  });

  it("omits the soft glow (linear gradient) when lineGlowRadius is 0", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5, lineGlowRadius: 0 }));
    expect(count(ctx, "createLinearGradient")).toBe(0);
  });

  it("still marches dots even with both line and glow disabled", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5, lineHeight: 0, lineGlowRadius: 0 }));
    expect(count(ctx, "stroke")).toBe(0);
    expect(count(ctx, "createLinearGradient")).toBe(0);
    expect(paintedDotXs(ctx).length).toBeGreaterThan(0);
  });
});

describe("drawScanBar — marching dots", () => {
  it("only paints dots whose centre sits over the globe chord", () => {
    const ctx = makeMockCtx();
    // a narrow chord high up on the disc, so many dots fall off-globe
    const scannedFraction = 0.05;
    drawScanBar(ctx, frame({ scannedFraction, dotCount: 40 }));
    const r = 256;
    const y = scannedFraction * 512;
    const half = chordHalfWidth(r, y - 256);
    const [x0, x1] = [256 - half, 256 + half];
    const xs = paintedDotXs(ctx);
    expect(xs.length).toBeGreaterThan(0);
    for (const px of xs) {
      expect(px).toBeGreaterThanOrEqual(x0);
      expect(px).toBeLessThanOrEqual(x1);
    }
    // every dot sits exactly on the seam line
    for (const c of ctx.calls.filter((c) => c.name === "createRadialGradient")) {
      expect(c.args[1]).toBeCloseTo(y, 9); // centre y == seam y
    }
  });

  it("paints more dots over a wide chord than a narrow one (density is by disc width)", () => {
    const wide = makeMockCtx();
    drawScanBar(wide, frame({ scannedFraction: 0.5, dotCount: 40 }));  // full-width equator
    const narrow = makeMockCtx();
    drawScanBar(narrow, frame({ scannedFraction: 0.05, dotCount: 40 })); // slim chord near pole
    expect(paintedDotXs(wide).length).toBeGreaterThan(paintedDotXs(narrow).length);
  });

  it("never paints more dots than the requested count", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5, dotCount: 10 }));
    expect(paintedDotXs(ctx).length).toBeLessThanOrEqual(10);
  });

  it("keeps at least one dot lane even when dotCount is 0 (max(1, …))", () => {
    const ctx = makeMockCtx();
    drawScanBar(ctx, frame({ scannedFraction: 0.5, dotCount: 0 }));
    // n is forced to 1, so at most a single dot can ever paint
    expect(paintedDotXs(ctx).length).toBeLessThanOrEqual(1);
  });

  it("marches the dots along as time advances", () => {
    const t0 = makeMockCtx();
    drawScanBar(t0, frame({ scannedFraction: 0.5, dotCount: 10, timeMs: 0 }));
    const t1 = makeMockCtx();
    drawScanBar(t1, frame({ scannedFraction: 0.5, dotCount: 10, timeMs: 10000 }));
    // same seam, later time → the whole dot train has shifted to new x positions
    const a = paintedDotXs(t0).slice().sort((m, n) => m - n);
    const b = paintedDotXs(t1).slice().sort((m, n) => m - n);
    expect(b).not.toEqual(a);
  });
});
