import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { Panel } from "./common.jsx";

/* Log — the narrative telemetry ticker. */

export const Log = observer(function Log() {
  return (
    <div className="log">
      <Panel title="Telemetry">
        <div id="log">
          {store.log.map((e) => (
            <div key={e.id} className={"logline" + (e.cls ? " " + e.cls : "")}>
              <span className="log-year">{e.year}</span>
              {e.msg}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
});
