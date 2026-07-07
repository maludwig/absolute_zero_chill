import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { Research } from "./Research.jsx";
import { store } from "../store.js";

describe("Research", () => {
  it("lists visible techs including Replication", () => {
    const html = renderToString(<Research />);
    expect(html).toContain("Research");
    expect(html).toContain("Replication");
  });
  it("makes actionable rows clickable and drops the Assist button", () => {
    const html = renderToString(<Research />);
    expect(html).toContain("clickable");      // rows are the click target now
    expect(html).not.toContain("btn assist"); // no Assist button
  });
  it("marks the focused tech as Focused", () => {
    runInAction(() => { store.research.selected = "replication"; });
    const html = renderToString(<Research />);
    expect(html).toContain("Focused");
    runInAction(() => { store.research.selected = null; });
  });
});
