import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { SolArrival } from "./SolArrival.jsx";

describe("SolArrival", () => {
  it("renders the sun plus the variant overlay", () => {
    const html = renderToString(<SolArrival variant="orbit" size={48} />);
    expect(html).toContain("solarr-orbit");
    expect(html).toContain("solarr-sun");
    expect(html).toContain("solarr-ring");
  });
});
