import React from "react";
import { observer } from "mobx-react-lite";
import { store } from "../store.js";
import { BUILDINGS, ASSIST_MAX_WORKLOAD } from "../config.js";
import { ProgressBar, SelfPoweredButton } from "./common.jsx";
import { FmtValue } from "./FmtValue.jsx";
import { RecycleIcon } from "./RecycleIcon.jsx";

/* BuildQueue — live jobs, each with its own progress bar and Assist button.
   Keyed by uid so React keeps each row's DOM node stable as it fills (no
   flicker, no lost clicks). */

const QueueRow = observer(function QueueRow({ job }) {
  const b = BUILDINGS[job.id];
  const total = b.workload * job.count;
  // Assist adds build points by hand — only worth offering when the job is small
  // enough that clicking meaningfully moves it. A mega-structure hides it.
  const showAssist = total <= ASSIST_MAX_WORKLOAD;
  // Resource Realignment adds a recycle control: cancel the job, refund its Metal.
  const showRecycle = store.techDone("resource_realignment");
  return (
    <div className="qrow">
      <div className="qinfo">
        <span>{b.name}{job.count > 1 ? <> ×<FmtValue value={job.count} /></> : ""}</span>
        <span className="qpct"><FmtValue value={job.progress} /> / <FmtValue value={total} /></span>
      </div>
      <ProgressBar value={job.progress} max={total} />
      {(showRecycle || showAssist) && (
        <div className="qactions">
          {showRecycle && (
            <button
              className="qrecycle"
              onClick={() => store.cancelBuild(job.uid)}
              title="Cancel this order and refund its Metal"
              aria-label="Cancel order and refund Metal"
            >
              <RecycleIcon size={13} />
            </button>
          )}
          {showAssist && (
            <SelfPoweredButton className="btn assist" onClick={() => store.assist(job.uid)}>Assist</SelfPoweredButton>
          )}
        </div>
      )}
    </div>
  );
});

export const BuildQueue = observer(function BuildQueue() {
  if (!store.buildQueue.length) {
    const msg = store.owned.replica > 0
      ? "Build queue empty — idle Replicas are researching."
      : "Build queue empty — Assist a structure to build it yourself.";
    return <div className="empty">{msg}</div>;
  }
  return (
    <React.Fragment>
      {store.buildQueue.map((job) => <QueueRow key={job.uid} job={job} />)}
    </React.Fragment>
  );
});
