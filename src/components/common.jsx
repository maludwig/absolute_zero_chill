/* common — small presentational building blocks shared across panels.
   ProgressBar's colour comes from CSS context (.trow .qbar > i is violet), so
   no variant prop is needed. */

import { observer } from "mobx-react-lite";
import { store } from "../store.js";

/* PoweredButton — a <button> that goes dead when the grid is down. It ORs the
   caller's own `disabled` with store.powerFailed and adds a `.power-off` class
   for the greyed-out look, so any button built from it stops working during a
   power failure. All other props (onClick, className, children, title, …) pass
   straight through. NOTE: the breaker toggle and the reboot bar deliberately use
   a plain <button>, since those are how you recover from a failure. */
export const PoweredButton = observer(function PoweredButton({ disabled, className, ...rest }) {
  const off = store.powerFailed;
  return (
    <button
      disabled={disabled || off}
      className={(className || "") + (off ? " power-off" : "")}
      {...rest}
    />
  );
});

/* SelfPoweredButton — the counterpart: a button that ignores the grid entirely
   and stays live even during a power failure. Used for the controls that let you
   recover (unpacking a Collector from cargo, etc.). Tagged with `.self-powered`
   so a failure stylesheet can make these stand out against the darkened site. */
export function SelfPoweredButton({ className, ...rest }) {
  return <button className={"self-powered" + (className ? " " + className : "")} {...rest} />;
}

export function ProgressBar({ value, max, small }) {
  const pct = (!max || max <= 0) ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={"qbar" + (small ? " small" : "")}>
      <i style={{ width: pct + "%" }} />
    </div>
  );
}

export function Panel({ title, tag, className, children }) {
  return (
    <section className={"panel" + (className ? " " + className : "")}>
      <h2>{title}{tag ? <span className="tag">{tag}</span> : null}</h2>
      {children}
    </section>
  );
}
