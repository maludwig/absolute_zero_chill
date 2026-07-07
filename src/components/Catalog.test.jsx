import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { Catalog } from "./Catalog.jsx";
import { store } from "../store.js";
import { BUILDINGS } from "../config.js";

describe("Catalog", () => {
  it("renders Construction with the starter mine card", () => {
    const html = renderToString(<Catalog />);
    expect(html).toContain("Construction");
    expect(html).toContain("Asteroid Mine");
  });

  it("the +1000 button stays enabled under Multithreading when only one batch (not 16) is affordable", () => {
    runInAction(() => {
      store.research.done.batch_processing = true;
      store.research.done.bulk_processing = true;
      store.research.done.multithreading = true;
      store.multithread = true;
      store.metal = 40 * 1500; // affords 1 full +1000 batch, not 16
    });
    const html = renderToString(<Catalog />);
    // the +1000 button should render without the disabled attribute
    const idx = html.indexOf("+1000");
    expect(idx).toBeGreaterThan(-1);
    const buttonStart = html.lastIndexOf("<button", idx);
    const buttonTag = html.slice(buttonStart, idx);
    expect(buttonTag).not.toContain("disabled");
  });

  it("shows a Duplication ×2 button once the tech is researched", () => {
    runInAction(() => {
      store.research.done.duplication = true;
      store.owned.asteroid_mine = 4;
      store.metal = 1e6;
    });
    const html = renderToString(<Catalog />);
    expect(html).toContain("btn dup");
    expect(html).toContain("×2");
  });

  it("groups buildable cards under collapsible section subheadings", () => {
    const html = renderToString(<Catalog />);
    expect(html).toContain("section-toggle");
    // starter buildings put a Power section (Solar Collector, Kinetic Accumulator)
    // and a Mining section (Asteroid Mine) on screen from the first frame.
    expect(html).toContain("Power");
    expect(html).toContain("Mining");
  });

  it("renders a building's registered ConfigComponent inside its card", () => {
    // importing Catalog pulls in the side-effect registration
    expect(BUILDINGS.construction_logistics.ConfigComponent).toBeTruthy();
    runInAction(() => {
      store.research.done.automated_construction = true; // unlock the card
      store.owned.construction_logistics = 0;            // not built → editor (unlocked) mode
      store.reconcileMilestones();                       // research.done set directly → resync maps
    });
    const editHtml = renderToString(<Catalog />);
    expect(editHtml).toContain("Construction Logistics");
    expect(editHtml).toContain("card-config"); // the config wrapper rendered
    expect(editHtml).toContain("Build loop");
    expect(editHtml).toContain("<select");     // editable dropdown rows
    expect(editHtml).toContain("Reset");
    // built + breaker on → running → read-only, edit controls hidden
    runInAction(() => {
      store.owned.construction_logistics = 1;
      store.breakerOn.construction_logistics = true;
    });
    const lockedHtml = renderToString(<Catalog />);
    expect(lockedHtml).toContain("Switch off to edit");
    expect(lockedHtml).not.toContain("cfg-qty"); // no dropdowns while locked
    runInAction(() => { store.owned.construction_logistics = 0; }); // restore for later tests
  });

  it("renders the Discreet Neural Scanner's scan globe in its card once one is built", () => {
    expect(BUILDINGS.discreet_neural_scanner.ConfigComponent).toBeTruthy(); // registered
    runInAction(() => {
      store.research.done.cortical_scanning = true; // unlock the scanner card
      store.owned.discreet_neural_scanner = 0;
      store.reconcileMilestones();                  // research.done set directly → resync maps
    });
    let html = renderToString(<Catalog />);
    expect(html).toContain("Discreet Neural Scanner");
    expect(html).not.toContain("scan-config"); // no globe before you own one
    runInAction(() => { store.owned.discreet_neural_scanner = 1; });
    html = renderToString(<Catalog />);
    expect(html).toContain("scan-config"); // globe + readout now in the card
    expect(html).toContain("scanned");
    runInAction(() => { store.owned.discreet_neural_scanner = 0; }); // restore for later tests
  });

  it("keeps a built power-drawing building (Scanner) in the main list, never in Completed", () => {
    runInAction(() => {
      store.research.done.cortical_scanning = true; // reveals the Scanner
      store.owned.discreet_neural_scanner = 1;      // max is 1 → would otherwise be "completed"
      store.reconcileMilestones();                  // research.done set directly → resync maps
    });
    const html = renderToString(<Catalog />);
    // Completed cards aren't rendered while the section is collapsed, so if the maxed
    // Scanner still appears it's in the active list — i.e. exempted from Completed.
    expect(html).toContain("Discreet Neural Scanner");
  });
});
