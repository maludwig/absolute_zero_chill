/* ProbeArrivedBar — the dumb middle bar shown once a probe reaches its system.
   `variant` selects the style (we picked "engraved"). */

export function ProbeArrivedBar({ variant, label }) {
  const v = variant || "engraved";
  const text = label || "ARRIVED";
  return (
    <div className={"arr arr-" + v}>
      {v === "bracketed" ? (
        <span className="arr-txt"><span className="arr-brk">[</span>{text}<span className="arr-brk">]</span></span>
      ) : v === "engraved" ? (
        <span className="arr-txt">· {text} ·</span>
      ) : (
        <span className="arr-txt">{text}</span>
      )}
    </div>
  );
}
