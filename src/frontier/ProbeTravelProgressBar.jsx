import { probeColor } from "../shared/model.js";

/* ProbeTravelProgressBar — the dumb middle bar for a journey. A shining disc
   with a motion-trail crawls left→right; position = current/total. White at
   0.1c, blue at 0.9c (interpolated). Sol / Dest / ly are the SystemRow's job. */

export function ProbeTravelProgressBar({ total_distance, current_distance, speed }) {
  const frac = Math.max(0, Math.min(1, current_distance / total_distance));
  const pct = frac * 100;
  const color = probeColor(speed);
  return (
    <div className="ptpb-track">
      <div className="ptpb-rail" />
      <div className="ptpb-fill" style={{ width: pct + "%", background: color }} />
      <div className="ptpb-dotwrap" style={{ left: pct + "%" }}>
        <div className="ptpb-trail" style={{ background: "linear-gradient(to left, " + color + ", transparent)" }} />
        <div className="ptpb-dot" style={{ background: "radial-gradient(circle at 50% 50%, #fff, " + color + " 70%)", boxShadow: "0 0 10px 2px " + color }} />
      </div>
    </div>
  );
}
