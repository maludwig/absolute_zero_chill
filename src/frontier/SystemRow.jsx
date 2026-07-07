/* SystemRow — the layout primitive for the Exploration view. Every bar (travel,
   arrived, build, harvest, recycle, mass-stream) flows through this so they all
   share one skeleton and end up identical width:

     [ Sol slot ] [ bar — flex:1 ] [ Dest slot ] [ right label ]

   The sol/dest slots are FIXED width, so passing an icon or passing null (the
   slot stays empty but still reserves its width) keeps every row aligned —
   that's the fix for the alignment fight, no invisible re-rendered icons. */

export function SystemRow({ solIcon, destIcon, right, children, className }) {
  return (
    <div className={"sysrow" + (className ? " " + className : "")}>
      <div className="sysrow-sol">{solIcon || null}</div>
      <div className="sysrow-bar">{children}</div>
      <div className="sysrow-dest">{destIcon || null}</div>
      <div className="sysrow-right">{right || null}</div>
    </div>
  );
}
