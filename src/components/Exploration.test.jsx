import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { Exploration } from "./Exploration.jsx";
import { store } from "../store.js";

describe("Exploration", () => {
  it("renders nothing until a Probe Launcher exists", () => {
    runInAction(() => { store.owned.probe_launcher = 0; });
    expect(renderToString(<Exploration />)).toBe("");
  });
  it("renders the frontier panel once the launcher is built", () => {
    runInAction(() => { store.owned.probe_launcher = 1; });
    const html = renderToString(<Exploration />);
    expect(html).toContain("Exploration");
    expect(html).toContain("returned"); // the "T returned" tag
  });
});
