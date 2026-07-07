import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Resources, Depletions } from "./Resources.jsx";
import { store } from "../store.js";
import { runInAction } from "mobx";

describe("Resources", () => {
  it("renders the live readout chips with formatted metal", () => {
    store.metal = 2500;
    const html = renderToString(<Resources />);
    expect(html).toContain("Metal");
    expect(html).toContain("2.50k"); // fmt(2500)
    expect(html).toContain("Build power");
  });
});

describe("Depletions", () => {
  it("renders a belt row with its tint class", () => {
    const html = renderToString(<Depletions />);
    expect(html).toContain("Bodies");
    expect(html).toContain("depletion-row belt");
  });

  it("shows a body row with its palette class once mining has begun", () => {
    runInAction(() => {
      store.owned.uranian_mine = 5;
      store.mined.uranian_moons = 1e18;
    });
    const html = renderToString(<Depletions />);
    expect(html).toContain("depletion-row uranian_moons");
    expect(html).toContain("mined");
  });

  it("groups moons under a Moons header with the shared word pulled out", () => {
    runInAction(() => {
      store.owned.uranian_mine = 5;
      store.mined.uranian_moons = 1e18;
      store.owned.lunar_mine = 5;   // Earth's Moon
      store.mined.moon = 1e18;
    });
    const html = renderToString(<Depletions />);
    expect(html).toContain("Belt");                 // section headers
    expect(html).toContain("Moons");
    expect(html).toContain("Uranians");             // shortened, pluralised
    expect(html).toContain("Luna");                 // Earth's Moon renamed
    expect(html).not.toContain("Uranian Moons");    // the long per-row label is gone
  });
});
