/* PhaseBar — a dumb meter for the harvest lifecycle. `fraction` (0..1) is the
   filled width, anchored left. `tone` is "build" (cyan) or "metal" (amber);
   `dim` greys it out (a completed fleet sitting idle). The same component, fed
   different fractions/tones by the clock, plays all four beats:
     build  → tone=build, fraction rises 0→1 (exponential)
     done   → tone=build, dim, fraction 1 (grey, full)
     harvest→ tone=metal, fraction falls 1→0 (drain)
     recycle→ tone=metal, fraction falls 1→0 (reverse-exponential) */

export function PhaseBar({ fraction, tone, label, dim }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  const cls = "phasebar " + (dim ? "phasebar-dim" : "phasebar-" + (tone || "build"));
  return (
    <div className={cls}>
      <div className="phasebar-fill" style={{ width: pct + "%" }} />
      {label ? <div className="phasebar-label">{label}</div> : null}
    </div>
  );
}
