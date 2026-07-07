import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ProbeTravelProgressBar } from "./ProbeTravelProgressBar.jsx";

describe("ProbeTravelProgressBar", () => {
  it("positions the fill at current/total", () => {
    const html = renderToString(<ProbeTravelProgressBar total_distance={10} current_distance={5} speed={0.1} />);
    expect(html).toContain("ptpb-track");
    expect(html).toContain("width:50%");
  });
});
