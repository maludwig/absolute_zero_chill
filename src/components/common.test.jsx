import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { ProgressBar, Panel, PoweredButton } from "./common.jsx";
import { store } from "../store.js";

describe("ProgressBar", () => {
  it("renders a clamped fill width", () => {
    expect(renderToString(<ProgressBar value={50} max={100} />)).toContain("width:50%");
    expect(renderToString(<ProgressBar value={200} max={100} />)).toContain("width:100%");
    expect(renderToString(<ProgressBar value={-5} max={100} />)).toContain("width:0%");
  });
  it("adds the small modifier", () => {
    expect(renderToString(<ProgressBar value={1} max={2} small />)).toContain("qbar small");
  });
  it("renders 0% when max is zero or negative (no NaN% in DOM)", () => {
    expect(renderToString(<ProgressBar value={5} max={0} />)).toContain("width:0%");
    expect(renderToString(<ProgressBar value={5} max={-10} />)).toContain("width:0%");
  });
});

describe("Panel", () => {
  it("renders title, optional tag, and children", () => {
    const html = renderToString(
      <Panel title="Research" tag="info"><span>body</span></Panel>
    );
    expect(html).toContain("Research");
    expect(html).toContain("tag");
    expect(html).toContain("info");
    expect(html).toContain("body");
  });
  it("omits the tag span when no tag given", () => {
    const html = renderToString(<Panel title="X"><i>k</i></Panel>);
    expect(html).toContain("X");
    expect(html).not.toContain('class="tag"');
  });
});

describe("PoweredButton", () => {
  it("is live when power is up, honouring the caller's own disabled", () => {
    runInAction(() => { store.powerFailed = false; });
    const up = renderToString(<PoweredButton className="btn">Build</PoweredButton>);
    expect(up).not.toContain("power-off");
    expect(up).not.toContain("disabled");
    const ownDisabled = renderToString(<PoweredButton className="btn" disabled>Build</PoweredButton>);
    expect(ownDisabled).toContain("disabled");
  });

  it("is disabled and greyed while power has failed", () => {
    runInAction(() => { store.powerFailed = true; });
    const down = renderToString(<PoweredButton className="btn">Build</PoweredButton>);
    expect(down).toContain("power-off");
    expect(down).toContain("disabled");
    runInAction(() => { store.powerFailed = false; }); // restore shared store
  });
});
