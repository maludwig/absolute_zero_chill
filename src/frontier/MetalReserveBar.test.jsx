import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MetalReserveBar } from "./MetalReserveBar.jsx";

describe("MetalReserveBar", () => {
  it("labels the formatted reserve", () => {
    const html = renderToString(<MetalReserveBar reserve={1000} totalMass={1e6} curveK={16} />);
    expect(html).toContain("reservebar");
    expect(html).toContain("Metal reserve");
    expect(html).toContain("1.00k"); // fmt(1000)
  });
});
