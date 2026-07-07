import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ProbeArrivedBar } from "./ProbeArrivedBar.jsx";

describe("ProbeArrivedBar", () => {
  it("defaults to engraved ARRIVED", () => {
    const html = renderToString(<ProbeArrivedBar />);
    expect(html).toContain("arr-engraved");
    expect(html).toContain("ARRIVED");
  });
  it("honors a custom label", () => {
    expect(renderToString(<ProbeArrivedBar variant="engraved" label="DELIVERED" />)).toContain("DELIVERED");
  });
  it("bracketed variant wraps label in bracket spans", () => {
    const html = renderToString(<ProbeArrivedBar variant="bracketed" label="HERE" />);
    expect(html).toContain("arr-bracketed");
    expect(html).toContain("arr-brk");
    expect(html).toContain("HERE");
  });
  it("unknown variant renders label without dot or bracket decorations", () => {
    const html = renderToString(<ProbeArrivedBar variant="plain" label="DONE" />);
    expect(html).toContain("arr-plain");
    expect(html).toContain("DONE");
    expect(html).not.toContain("arr-brk");
    expect(html).not.toContain("·");
  });
  it("outer div carries the correct arr-<variant> class", () => {
    expect(renderToString(<ProbeArrivedBar variant="engraved" />)).toContain("arr arr-engraved");
    expect(renderToString(<ProbeArrivedBar variant="bracketed" />)).toContain("arr arr-bracketed");
  });
});
