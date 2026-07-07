/* MassStreamBar — the Mass Driver's output: bands of white-hot steel in flight
   from the destination (RIGHT) home to Sol (LEFT). Both edges of each band move
   left at the driver's speed.

   Each band is { head, tail } in progress-fractions Dest→Sol (0 at Dest, 1 at Sol):
   `head` is the leading edge (closer to Sol), `tail` the trailing edge. A progress
   p maps to x = (1-p)·W, so a band spans left = (1-head)·W with width (head-tail)·W.
   The leading band carries a shining head dot; the rest just fade like thinning steel.

   Passing multiple bands lets the rail show several clumps at once — e.g. a first
   stream still arriving while a second (from recycled harvesters) sets off behind it.

   Back-compat: also accepts headFrac / tailFrac for a single band. */

export function MassStreamBar({ bands, headFrac, tailFrac }) {
  let list = bands;
  if (!list) list = [{ head: headFrac, tail: tailFrac || 0 }];

  // clamp, drop empties; the band nearest Sol (largest head) carries the head dot
  const clean = list
    .map((b) => ({ head: Math.max(0, Math.min(1, b.head)), tail: Math.max(0, Math.min(1, b.tail || 0)) }))
    .filter((b) => b.head - b.tail > 0.0001);
  const leadHead = clean.length ? Math.max(...clean.map((b) => b.head)) : 0;

  return (
    <div className="mstream-track">
      <div className="mstream-rail" />
      {clean.map((b, i) => {
        const left = (1 - b.head) * 100;             // head = left edge of the band
        const width = Math.max(0, (b.head - b.tail) * 100);
        return <div key={i} className="mstream-band" style={{ left: left + "%", width: width + "%" }} />;
      })}
      {leadHead > 0 ? <div className="mstream-head" style={{ left: (1 - leadHead) * 100 + "%" }} /> : null}
    </div>
  );
}
