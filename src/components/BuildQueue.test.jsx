import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { BuildQueue } from "./BuildQueue.jsx";
import { store } from "../store.js";

describe("BuildQueue", () => {
  it("shows the empty state with no jobs", () => {
    runInAction(() => {
      store.buildQueue.replace ? store.buildQueue.replace([]) : (store.buildQueue.length = 0);
    });
    expect(renderToString(<BuildQueue />)).toContain("Build queue empty");
  });
  it("renders a job row with an Assist button", () => {
    runInAction(() => {
      store.buildQueue.push({ id: "asteroid_mine", count: 1, progress: 0, uid: 99 });
    });
    const html = renderToString(<BuildQueue />);
    expect(html).toContain("Asteroid Mine");
    expect(html).toContain("Assist");
  });

  it("hides Assist once the job's total workload is huge", () => {
    runInAction(() => {
      store.buildQueue.replace ? store.buildQueue.replace([]) : (store.buildQueue.length = 0);
      // 200 × workload 10 = 2000 build points, well past ASSIST_MAX_WORKLOAD (1000)
      store.buildQueue.push({ id: "asteroid_mine", count: 200, progress: 0, uid: 7 });
    });
    const html = renderToString(<BuildQueue />);
    expect(html).toContain("Asteroid Mine"); // the row still renders
    expect(html).not.toContain("Assist");    // but no pointless hand-click button
  });

  it("shows a recycle button per job once Resource Realignment is researched", () => {
    runInAction(() => {
      store.buildQueue.replace ? store.buildQueue.replace([]) : (store.buildQueue.length = 0);
      store.buildQueue.push({ id: "asteroid_mine", count: 1, progress: 0, uid: 42 });
      store.research.done.resource_realignment = true;
    });
    const html = renderToString(<BuildQueue />);
    expect(html).toContain("qrecycle");
    runInAction(() => { store.research.done.resource_realignment = false; });
  });

  it("has no recycle button before the tech is researched", () => {
    runInAction(() => {
      store.buildQueue.replace ? store.buildQueue.replace([]) : (store.buildQueue.length = 0);
      store.research.done.resource_realignment = false;
      store.buildQueue.push({ id: "asteroid_mine", count: 1, progress: 0, uid: 43 });
    });
    const html = renderToString(<BuildQueue />);
    expect(html).not.toContain("qrecycle");
  });
});
