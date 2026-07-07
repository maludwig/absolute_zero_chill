import { describe, it, expect } from "vitest";
import { fmt, fmtPeople, fmtTemp, fmtTempTriple, fmtEnergy, fmtPower } from "./prelude.js";

// mirrors fmt's padding: left-pad to a minimum width of 7 with nbsp
const NBSP = "\u00A0";
const pad = (s) => (s.length >= 7 ? s : NBSP.repeat(7 - s.length) + s);

describe("fmtTempTriple", () => {
  it("shows K / °C / °F at one decimal each", () => {
    expect(fmtTempTriple(273.15)).toBe("273.1K / 0.0°C / 32.0°F"); // freezing
    expect(fmtTempTriple(287)).toBe("287.0K / 13.9°C / 56.9°F");   // temperate
    expect(fmtTempTriple(5000)).toBe("5000.0K / 4726.9°C / 8540.3°F"); // hot core
    expect(fmtTempTriple(2.7)).toBe("2.7K / -270.4°C / -454.8°F");  // the CMB floor
  });
  it("keeps the sub-Kelvin prefixes on the Kelvin part", () => {
    expect(fmtTempTriple(0.5)).toBe("500.0mK / -272.6°C / -458.8°F");
    expect(fmtTempTriple(5e-4)).toBe("500.0µK / -273.1°C / -459.7°F");
  });
  it("handles zero and non-finite", () => {
    expect(fmtTempTriple(0)).toBe("0.0K / -273.1°C / -459.7°F");
    expect(fmtTempTriple(Infinity)).toBe("— K");
  });
});

describe("fmtPower", () => {
  it("formats via fmt (SI prefix + padding) and appends W", () => {
    expect(fmtPower({ kW: 50 })).toBe(pad("50.00k") + "W");
    expect(fmtPower({ kW: 10 })).toBe(pad("10.00k") + "W");
    expect(fmtPower({ W: 10000 })).toBe(pad("10.00k") + "W");
    expect(fmtPower({ W: 5 })).toBe(pad("5") + "W");
    expect(fmtPower({ W: 0 })).toBe(pad("0") + "W");
    expect(fmtPower({ W: 2.45e6 })).toBe(pad("2.45M") + "W");
    expect(fmtPower({ kW: 2.45e6 })).toBe(pad("2.45G") + "W");
    expect(fmtPower({ Jpd: 86400000 })).toBe(pad("1.00k") + "W"); // 1 kWd/day = 1 kW
  });
});

describe("fmtEnergy", () => {
  it("formats via fmt (SI prefix + padding) and appends J", () => {
    expect(fmtEnergy({ joules: 5 })).toBe(pad("5") + "J");
    expect(fmtEnergy({ joules: 5000 })).toBe(pad("5.00k") + "J");
    expect(fmtEnergy({ kWd: 1 })).toBe(pad("86.40M") + "J");
    expect(fmtEnergy({ kWh: 1 })).toBe(pad("3.60M") + "J");
    expect(fmtEnergy({ joules: 0 })).toBe(pad("0") + "J");
    expect(fmtEnergy({ joules: 2.45e9 })).toBe(pad("2.45G") + "J");
  });
});

describe("fmt", () => {
  it("left-pads short values to a stable 7-char width with nbsp", () => {
    expect(fmt(5)).toBe(NBSP.repeat(6) + "5");
    expect(fmt(5).length).toBe(7);
    expect(fmt(999)).toBe(NBSP.repeat(4) + "999");
    expect(fmt(1234)).toBe(NBSP.repeat(2) + "1.23k"); // 5 wide → padded to 7
    expect(fmt(1e33)).toBe("1.00e33");                // exactly 7 → unpadded
  });

  it("handles small / edge values", () => {
    expect(fmt(Infinity)).toBe(pad("∞"));
    expect(fmt(0)).toBe(pad("0"));
    expect(fmt(5)).toBe(pad("5"));
    expect(fmt(5.5)).toBe(pad("5.5"));      // <10 and fractional → one decimal
    expect(fmt(42.4)).toBe(pad("42"));      // >=10 → rounded integer
    expect(fmt(999)).toBe(pad("999"));
    expect(fmt(-1234)).toBe(pad("-1.23k")); // negatives recurse
  });

  it("applies SI prefixes", () => {
    expect(fmt(1234)).toBe(pad("1.23k"));
    expect(fmt(1e6)).toBe(pad("1.00M"));
    expect(fmt(5e7)).toBe(pad("50.00M"));
    expect(fmt(1e9)).toBe(pad("1.00G"));
    expect(fmt(1e12)).toBe(pad("1.00T"));
    expect(fmt(1e15)).toBe(pad("1.00P"));
    expect(fmt(1e27)).toBe(pad("1.00R"));
    expect(fmt(1e30)).toBe(pad("1.00Q")); // last SI prefix (quetta)
  });

  it("falls back to e-notation beyond 1e33", () => {
    expect(fmt(1e33)).toBe(pad("1.00e33"));
    expect(fmt(5e40)).toBe(pad("5.00e40"));
  });
  it("formats exact SI boundary values with two decimals", () => {
    expect(fmt(1000)).toBe(pad("1.00k"));
    expect(fmt(1e6)).toBe(pad("1.00M"));
    expect(fmt(1e9)).toBe(pad("1.00G"));
  });
  it("treats 999.9 as a plain integer and 1000.0 as 1.00k", () => {
    expect(fmt(999.9)).toBe(pad("1000")); // rounds to 1000, still < threshold before dividing
    expect(fmt(1000.0)).toBe(pad("1.00k"));
  });

  it("force_sign prefixes +/-/± and pads the sign together with the number", () => {
    expect(fmt(3430, true)).toBe(pad("+3.43k"));
    expect(fmt(-3430, true)).toBe(pad("-3.43k"));
    expect(fmt(0, true)).toBe(pad("±0"));
    expect(fmt(5, true)).toBe(pad("+5"));
    expect(fmt(3430)).toBe(pad("3.43k"));   // default: positives unsigned
    expect(fmt(-3430)).toBe(pad("-3.43k")); // negatives always signed
  });

  it("keeps the sign adjacent to the digits — no interior padding gap", () => {
    // regression for "-    3.43kW": the pad must sit left of the sign, not between
    expect(fmt(-3430).trimStart()).toBe("-3.43k");
    expect(fmt(-3430, true).trimStart()).toBe("-3.43k");
    expect(fmt(3430, true).trimStart()).toBe("+3.43k");
  });

  it("min_width controls padding; 0 disables it, larger pads wider", () => {
    expect(fmt(5, false, 0)).toBe("5");
    expect(fmt(1234, false, 0)).toBe("1.23k");
    expect(fmt(-3430, true, 0)).toBe("-3.43k");
    expect(fmt(5, false, 10)).toBe(NBSP.repeat(9) + "5");
    expect(fmt(5, false, 99).length).toBe(99);
    expect(fmt(5)).toBe(pad("5")); // default is still 7
  });
});

describe("fmtTemp", () => {
  it("reads plain Kelvin at or above 1 K", () => {
    expect(fmtTemp(288.5)).toBe("288.50 K");
    expect(fmtTemp(2.7)).toBe("2.70 K");
    expect(fmtTemp(1)).toBe("1.00 K");
  });

  it("descends through the sub-Kelvin prefixes", () => {
    expect(fmtTemp(2.68e-1)).toBe("268.00 mK");
    expect(fmtTemp(2.7e-3)).toBe("2.70 mK");
    expect(fmtTemp(2.7e-6)).toBe("2.70 µK");
    expect(fmtTemp(2.7e-9)).toBe("2.70 nK");
    expect(fmtTemp(2.7e-12)).toBe("2.70 pK");
    expect(fmtTemp(1.5e-14)).toBe("15.00 fK"); // Sgr A★ Hawking floor
    expect(fmtTemp(2.7e-18)).toBe("2.70 aK");
  });

  it("handles zero, negatives, and the deep tail", () => {
    expect(fmtTemp(0)).toBe("0.00 K");
    expect(fmtTemp(-5)).toBe("0.00 K");
    expect(fmtTemp(1e-30)).toMatch(/e/); // colder than yoctokelvin → scientific
    expect(fmtTemp(Infinity)).toBe("— K");
  });
  it("covers the zK and yK prefix thresholds", () => {
    expect(fmtTemp(2.7e-21)).toBe("2.70 zK");
    expect(fmtTemp(2.7e-24)).toBe("2.70 yK");
  });
});

describe("fmtPeople", () => {
  it("uses B / M / k for a population head-count (not the SI 'G')", () => {
    expect(fmtPeople(8.1e9)).toBe("8.10B");
    expect(fmtPeople(8.9e9)).toBe("8.90B");
    expect(fmtPeople(4.5e8)).toBe("450.00M");
    expect(fmtPeople(1.2e7)).toBe("12.00M");
    expect(fmtPeople(2000)).toBe("2.00k");
  });
  it("shows whole numbers below 1000 and floors at 0", () => {
    expect(fmtPeople(512)).toBe("512");
    expect(fmtPeople(0)).toBe("0");
    expect(fmtPeople(-5)).toBe("0");   // population is floored upstream, but be safe
    expect(fmtPeople(999)).toBe("999");
  });
});
