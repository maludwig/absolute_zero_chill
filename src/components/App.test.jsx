import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { App } from "./App.jsx";

describe("App", () => {
  it("composes the whole screen (SSR: no game loop side effects)", () => {
    const html = renderToString(<App />);
    for (const s of ["ABSOLUTE", "Construction", "Research", "Telemetry", "build", "Save", "Load"]) {
      expect(html).toContain(s);
    }
  });
});
