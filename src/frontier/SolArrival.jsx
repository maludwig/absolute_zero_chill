/* SolArrival — what Sol does as the mass stream's head lands and steel pours in.
   A handful of styles to choose from; pass `variant`. Each renders a small Sol
   disc plus an animation overlay. Built so the stream's head appears to "tuck
   into" the activity around the sun.
     orbit   — a thin ring with a white-hot dot circling it (the head, captured)
     intake  — concentric rings collapsing inward, matter pulled into Sol
     flare   — Sol throbs hotter, heat pulses radiating out as it receives
     swirl   — an accretion-disc arc spinning around Sol
     charge  — a comet-bright sweep circling like a loading ring */

export function SolArrival({ variant, size, speed }) {
  const v = variant || "orbit";
  const S = size || 48;
  let overlay = null;
  if (v === "orbit") {
    overlay = <><div className="solarr-ring" /><div className="solarr-orbiter"><div className="solarr-odot" /></div></>;
  } else if (v === "intake") {
    overlay = <><span className="solarr-iring" /><span className="solarr-iring" /><span className="solarr-iring" /></>;
  } else if (v === "flare") {
    overlay = <><span className="solarr-fpulse" /><span className="solarr-fpulse" /></>;
  } else if (v === "swirl") {
    overlay = <div className="solarr-swirl" />;
  } else if (v === "charge") {
    overlay = <div className="solarr-charge" />;
  } else if (v === "intakecharge") {
    overlay = <><div className="solarr-charge" /><span className="solarr-iring" /><span className="solarr-iring" /><span className="solarr-iring" /></>;
  }
  return (
    <div className={"solarr solarr-" + v} style={{ width: S, height: S, "--ss": speed || 1 }}>
      <div className="solarr-sun" />
      {overlay}
    </div>
  );
}
