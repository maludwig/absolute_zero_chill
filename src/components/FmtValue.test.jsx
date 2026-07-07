import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { FmtValue, FmtPower, FmtEnergy } from "./FmtValue.jsx";
import { fmt, fmtPower, fmtEnergy } from "../prelude.js";

describe("FmtValue", () => {
  it("renders value + unit in a .fmt-value span, unpadded by default", () => {
    const html = renderToString(<FmtValue value={1234} unit="J" />);
    expect(html).toContain('class="fmt-value"');
    expect(html).toContain(">1.23kJ<"); // no nbsp padding
  });

  it("treats the unit as optional", () => {
    expect(renderToString(<FmtValue value={42} />)).toContain(">42<");
  });

  it("merges an extra className", () => {
    expect(renderToString(<FmtValue value={5} unit="W" className="dim" />)).toContain('class="fmt-value dim"');
  });

  it("pad reserves a fixed 7-wide footprint", () => {
    expect(renderToString(<FmtValue value={1234} unit="J" pad />)).toContain(fmt(1234) + "J"); // "  1.23kJ"
    expect(renderToString(<FmtValue value={5} pad />)).toContain(fmt(5));                       // "      5"
  });

  it("forceSign prefixes +/-/± (unpadded by default)", () => {
    expect(renderToString(<FmtValue value={5} forceSign />)).toContain(">+5<");
    expect(renderToString(<FmtValue value={0} forceSign />)).toContain(">±0<");
    expect(renderToString(<FmtValue value={-3430} forceSign />)).toContain(">-3.43k<");
  });
});

describe("FmtPower / FmtEnergy", () => {
  it("convert and label W / J, unpadded by default", () => {
    expect(renderToString(<FmtPower power={{ kW: 50 }} />)).toContain(">50.00kW<");
    expect(renderToString(<FmtPower power={{ W: 1543 }} />)).toContain(">1.54kW<");
    expect(renderToString(<FmtEnergy energy={{ kWh: 1200 }} />)).toContain(">4.32GJ<");
    expect(renderToString(<FmtEnergy energy={{ kWd: 1 }} />)).toContain(">86.40MJ<");
  });

  it("match the padded prelude formatters when pad is set", () => {
    expect(renderToString(<FmtPower power={{ kW: 50 }} pad />)).toContain(fmtPower({ kW: 50 }));
    expect(renderToString(<FmtEnergy energy={{ kWh: 1200 }} pad />)).toContain(fmtEnergy({ kWh: 1200 }));
  });

  it("forceSign shows the grid-contribution sign", () => {
    expect(renderToString(<FmtPower power={{ kW: 12 }} forceSign />)).toContain(">+12.00kW<");
    expect(renderToString(<FmtPower power={{ kW: -12 }} forceSign />)).toContain(">-12.00kW<");
  });
});
