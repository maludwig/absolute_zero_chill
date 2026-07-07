import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { PhaseBar } from "./PhaseBar.jsx";

describe("PhaseBar", () => {
  it("renders tone, fill width, and label", () => {
    const html = renderToString(<PhaseBar fraction={0.5} tone="build" label="Building" />);
    expect(html).toContain("phasebar-build");
    expect(html).toContain("width:50%");
    expect(html).toContain("Building");
  });
  it("dim overrides the tone class", () => {
    expect(renderToString(<PhaseBar fraction={1} tone="build" dim />)).toContain("phasebar-dim");
  });
  it("renders phasebar-metal for tone=\"metal\"", () => {
    expect(renderToString(<PhaseBar fraction={0.5} tone="metal" />)).toContain("phasebar-metal");
  });
  it("clamps fraction below 0 to width:0% and above 1 to width:100%", () => {
    expect(renderToString(<PhaseBar fraction={-0.5} tone="build" />)).toContain("width:0%");
    expect(renderToString(<PhaseBar fraction={1.5} tone="build" />)).toContain("width:100%");
  });
  it("omits the label element when no label is provided", () => {
    const html = renderToString(<PhaseBar fraction={0.5} tone="build" />);
    expect(html).not.toContain("phasebar-label");
  });
});
