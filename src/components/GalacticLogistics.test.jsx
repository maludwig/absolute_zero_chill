import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { GalacticLogistics } from "./GalacticLogistics.jsx";
import { store } from "../store.js";

/* Canvas drawing can't run under jsdom (no 2D context), so these use SSR
   (renderToString): effects don't fire, so we verify structure + readouts.
   The interactive path is covered elsewhere — pixelToCell in galaxy/overlay.test.js
   and seedWedge in store.test.js. */

describe("GalacticLogistics", () => {
  it("renders nothing until the panel is revealed", () => {
    runInAction(() => { store.revealed.galaxy = false; });
    expect(renderToString(<GalacticLogistics />)).toBe("");
  });

  it("renders the readouts and the galaxy stage once revealed", () => {
    runInAction(() => {
      store.revealed.galaxy = true;
      store.owned.tars_seed_launcher = 1;
      store.owned.matrioshka_seed = 1e9;
      store.galaxy.charge = 1e9;
    });
    const html = renderToString(<GalacticLogistics />);
    expect(html).toContain("Galactic Logistics");
    expect(html).toContain("Launch charge");
    expect(html).toContain("Seeds in hand");
    expect(html).toContain("Galaxy Insight");
    // both canvases present: the spiral art + the interactive overlay
    expect(html).toContain("galaxy-stage");
    expect(html).toContain("galaxy-overlay");
    expect((html.match(/<canvas/g) || []).length).toBe(2);
  });
});
