import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { runInAction } from "mobx";
import { Header } from "./Header.jsx";
import { store } from "../store.js";

describe("Header", () => {
  it("shows the title, Act I by default, and the year", () => {
    const html = renderToString(<Header />);
    expect(html).toContain("ABSOLUTE");
    expect(html).toContain("Act I");
    expect(html).toContain("Year");
  });

  it("renders the surface temperature in sub-Kelvin (with °C/°F) once it drops below 1 K", () => {
    runInAction(() => { store.surfaceTemp = 2.7e-6; });
    const html = renderToString(<Header />);
    expect(html).toContain("2.7µK");        // Kelvin keeps its sub-Kelvin prefix
    expect(html).toContain("°C");           // and Celsius/Fahrenheit are shown too
    expect(html).toContain("°F");
  });

  it("shows the relocation banner while the Earth is in transit", () => {
    expect(renderToString(<Header />)).not.toContain("in transit");
    runInAction(() => { store.galaxy.relocateDay0 = store.explore.day; }); // progress 0 → relocating
    expect(renderToString(<Header />)).toContain("in transit to Sagittarius");
  });
});
