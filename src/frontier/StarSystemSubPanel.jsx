import React from "react";

/* StarSystemSubPanel — a dumb box for one destination system: a header (name +
   sub-line + optional collapse toggle) and a vertical stack of SystemRows passed
   as children. When `collapsed`, only the first child (the matter-stream row) is
   shown; the rest (reserve bar, harvester rows) are hidden. */

export function StarSystemSubPanel({ name, sub, collapsed, onToggle, children }) {
  const kids = React.Children.toArray(children);
  return (
    <div className={"sys" + (collapsed ? " is-collapsed" : "")}>
      <div className="sys-head">
        <span className="sys-name">{name}</span>
        <div className="sys-head-right">
          {sub ? <span className="sys-sub">{sub}</span> : null}
          {onToggle ? (
            <button className="sys-toggle" onClick={onToggle}
              aria-label={collapsed ? "Expand system" : "Collapse system"}
              title={collapsed ? "Expand" : "Collapse"}>{collapsed ? "\u25B8" : "\u25BE"}</button>
          ) : null}
        </div>
      </div>
      <div className="sys-rows">{collapsed ? kids.slice(0, 1) : kids}</div>
    </div>
  );
}
