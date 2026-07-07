import { describe, it, expect } from "vitest";
import {
  convertEnergy, convertPower,
  J_PER_KWH, J_PER_KWD, SECONDS_PER_DAY, HOURS_PER_DAY,
} from "./power_helpers.js";
import { escapeEnergy } from "./physics.js";

describe("convertEnergy", () => {
  it("knows the base unit relationships", () => {
    expect(J_PER_KWH).toBe(3.6e6);
    expect(J_PER_KWD).toBe(8.64e7);
    expect(J_PER_KWD).toBe(J_PER_KWH * HOURS_PER_DAY);
  });

  it("converts joules <-> kWh <-> kWd", () => {
    expect(convertEnergy("kWh", { joules: 3.6e6 })).toBe(1);
    expect(convertEnergy("joules", { kWh: 1 })).toBe(3.6e6);
    expect(convertEnergy("kWd", { kWh: 24 })).toBe(1);
    expect(convertEnergy("kWh", { kWd: 1 })).toBe(24);
    expect(convertEnergy("joules", { kWd: 1 })).toBe(8.64e7);
  });

  it("is identity when target unit equals input unit", () => {
    expect(convertEnergy("joules", { joules: 12345 })).toBe(12345);
    expect(convertEnergy("kWh", { kWh: 7 })).toBe(7);
    expect(convertEnergy("kWd", { kWd: 2.5 })).toBe(2.5);
  });

  it("round-trips through an intermediate unit without drift", () => {
    const j = 5.0e9;
    const kWh = convertEnergy("kWh", { joules: j });
    const kWd = convertEnergy("kWd", { kWh });
    expect(convertEnergy("joules", { kWd })).toBeCloseTo(j, 3);
  });

  it("matches the chained pipeline from the escapeEnergy example", () => {
    // escapeEnergy(m_body, 1000 kg payload, r_body) -> J per tonne, then to kWd
    const eJ = escapeEnergy(7.342e22, 1000, 1.7374e6); // the Moon, per stellar_bodies.json
    const eKWh = convertEnergy("kWh", { joules: eJ });
    const eKWd = convertEnergy("kWd", { kWh: eKWh });
    expect(eKWh).toBeCloseTo(eJ / 3.6e6, 6);
    expect(eKWd).toBeCloseTo(eJ / 8.64e7, 9);
  });

  it("rejects unknown units and malformed inputs", () => {
    expect(() => convertEnergy("BTU", { joules: 1 })).toThrow(/unknown target unit/);
    expect(() => convertEnergy("kWh", { furlongs: 1 })).toThrow(/exactly one known unit/);
    expect(() => convertEnergy("kWh", { joules: 1, kWh: 2 })).toThrow(/exactly one known unit/);
    expect(() => convertEnergy("kWh", { joules: "lots" })).toThrow(/finite number/);
    expect(() => convertEnergy("kWh", { joules: Infinity })).toThrow(/finite number/);
    expect(() => convertEnergy("kWh", null)).toThrow(/tagged object/);
    expect(() => convertEnergy("kWh", 5)).toThrow(/tagged object/);
  });
});

describe("convertPower", () => {
  it("converts W <-> kW", () => {
    expect(convertPower("kW", { W: 1000 })).toBe(1);
    expect(convertPower("W", { kW: 1 })).toBe(1000);
    expect(convertPower("W", { W: 42 })).toBe(42);
    expect(convertPower("kW", { kW: 3.5 })).toBe(3.5);
  });

  it("rejects unknown units and malformed inputs", () => {
    expect(() => convertPower("horsepower", { W: 1 })).toThrow(/unknown target unit/);
    expect(() => convertPower("W", { kelvin: 1 })).toThrow(/exactly one known unit/);
    expect(() => convertPower("W", { W: 1, kW: 1 })).toThrow(/exactly one known unit/);
    expect(() => convertPower("W", { W: NaN })).toThrow(/finite number/);
  });
});

describe("convertPower — Jpd (joules per game-day)", () => {
  it("gives the joules a sustained power delivers over one game-day", () => {
    expect(convertPower("Jpd", { kW: 1 })).toBe(J_PER_KWD); // 1 kW for a day = 1 kWd
    expect(convertPower("Jpd", { W: 1000 })).toBe(J_PER_KWD);
    expect(convertPower("Jpd", { W: 1 })).toBe(SECONDS_PER_DAY);
  });

  it("round-trips Jpd back into W and kW", () => {
    expect(convertPower("kW", { Jpd: J_PER_KWD })).toBe(1);
    expect(convertPower("W", { Jpd: SECONDS_PER_DAY })).toBe(1);
    expect(convertPower("Jpd", { Jpd: 5 })).toBe(5);
  });

  it("is consistent with the energy helpers", () => {
    const p = { kW: 12.5 };
    const viaEnergy = convertEnergy("joules", { kWd: convertPower("kW", p) });
    expect(convertPower("Jpd", p)).toBeCloseTo(viaEnergy, 3);
  });

  it("closes the loop: power (kW) == energy-in-kWd-per-tonne x tonnes/day", () => {
    // The identity the mine power draw relies on: kWd/tonne * tonnes/day = kW.
    const eKWdPerTonne = convertEnergy("kWd", { joules: 2.82e9 }); // Moon, J/tonne
    const tonnesPerDay = 1468.4;
    const drawKW = eKWdPerTonne * tonnesPerDay;
    const jPerDay = 2.82e9 * tonnesPerDay;
    // convertPower("Jpd", {kW: drawKW}) recovers the J/day directly
    expect(convertPower("Jpd", { kW: drawKW })).toBeCloseTo(jPerDay, -3);
  });
});
