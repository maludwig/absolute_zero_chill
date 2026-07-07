import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { Philosophy } from "./Philosophy.jsx";
import { store } from "../store.js";

describe("Philosophy", () => {
  it("renders nothing until the panel is revealed", () => {
    runInAction(() => { store.revealed.philosophy = false; });
    expect(renderToString(<Philosophy />)).toBe("");
  });

  it("shows the first Idea and a Contemplate control once revealed", () => {
    runInAction(() => {
      store.revealed.philosophy = true;
      store.owned.sol_matrioshka_brain = 1; // gives a non-zero Insight/day in the tag
    });
    const html = renderToString(<Philosophy />);
    expect(html).toContain("Philosophy");
    expect(html).toContain("Be One With The Universe");
    expect(html).toContain("Contemplate");
    expect(html).toContain("Insight");
  });

  it("shows progress in Insight once contemplating", () => {
    runInAction(() => {
      store.revealed.philosophy = true;
      store.philosophy.selected = "be_one_with_the_universe";
      store.philosophy.progress.be_one_with_the_universe = 1200;
    });
    const html = renderToString(<Philosophy />);
    expect(html).toContain("Contemplating");
    expect(html).toContain("Insight");
    expect(html).toContain("1.20k"); // fmt(1200)
  });
});
