import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Log } from "./Log.jsx";

describe("Log", () => {
  it("renders the telemetry panel with the boot line", () => {
    const html = renderToString(<Log />);
    expect(html).toContain("Telemetry");
    expect(html).toContain("SOLETTA-1");
  });
});
