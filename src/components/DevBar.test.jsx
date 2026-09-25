import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { DevBar } from "./DevBar.jsx";
import { store } from "../store.js";

describe("DevBar", () => {
  it("renders nothing when dev mode is off", () => {
    runInAction(() => { store.devMode = false; });
    expect(renderToString(<DevBar />)).toBe("");
  });
  it("renders the toolbar with the timing button when dev mode is on", () => {
    runInAction(() => { store.devMode = true; });
    const html = renderToString(<DevBar />);
    expect(html).toContain("Log tick timing");
    expect(html).toContain("telemetry");
    runInAction(() => { store.devMode = false; }); // restore
  });
  it("offers the Framejack unlock until it's used, then disables it", () => {
    runInAction(() => { store.devMode = true; store.devFramejack = false; });
    expect(renderToString(<DevBar />)).toContain("Unlock all Framejack");
    runInAction(() => { store.devFramejack = true; });
    const html = renderToString(<DevBar />);
    expect(html).toContain("Framejack unlocked");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Framejack unlocked/);
    runInAction(() => { store.devMode = false; store.devFramejack = false; }); // restore
  });
});
