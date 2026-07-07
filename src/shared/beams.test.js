import { describe, it, expect } from "vitest";
import { stepMassBeam, deliverBeam } from "./beams.js";

describe("stepMassBeam — mass driver pulse emission", () => {
  const MPD = 10; // metalPerDay for these tests (producedNet/DRIVER_SHIP_DAYS)
  const big = 1e18; // effectively unlimited reserve

  // the packet invariant: amount === metalPerDay × (finishedDay − departDay)
  const invariantHolds = (packets, mpd) =>
    packets.every((p) => Math.abs(p.amount - mpd * (p.finishedDay - p.departDay)) < 1e-6);

  it("empty → firing: opens a packet sized to the tick", () => {
    const r = stepMassBeam({ state: "empty", today: 100, dayStep: 100, available: big, metalPerDay: MPD, packets: [] });
    expect(r.state).toBe("firing");
    expect(r.packets).toHaveLength(1);
    expect(r.packets[0]).toEqual({ departDay: 100, finishedDay: 200, amount: 1000 });
    expect(r.emitted).toBe(1000);
    expect(invariantHolds(r.packets, MPD)).toBe(true);
  });

  it("firing: extends the current packet while under the fire window", () => {
    // start a packet, then extend it twice (like Ticks 2–3 of the walkthrough)
    let r = stepMassBeam({ state: "empty", today: 100, dayStep: 100, available: big, metalPerDay: MPD, packets: [] });
    r = stepMassBeam({ state: r.state, today: 200, dayStep: 100, available: big, metalPerDay: MPD, packets: r.packets });
    expect(r.state).toBe("firing");
    expect(r.packets).toHaveLength(1);
    expect(r.packets[0].finishedDay).toBe(300);
    expect(r.packets[0].amount).toBe(2000);
    r = stepMassBeam({ state: r.state, today: 300, dayStep: 100, available: big, metalPerDay: MPD, packets: r.packets });
    expect(r.packets[0].finishedDay).toBe(400);
    expect(r.packets[0].amount).toBe(3000);
    expect(invariantHolds(r.packets, MPD)).toBe(true);
  });

  it("firing: caps at the fire window then breaks to reloading_pause", () => {
    // fire window is 365 days. Build up to 300 days fired, then a 100-day tick
    // should only fire 65 more (to hit 365) and flip to reloading_pause.
    let packets = [{ departDay: 100, finishedDay: 400, amount: 3000 }]; // 300 days fired
    const r = stepMassBeam({ state: "firing", today: 400, dayStep: 100, available: big, metalPerDay: MPD, packets });
    expect(r.packets[0].finishedDay).toBe(465);   // 400 + 65
    expect(r.packets[0].amount).toBe(3650);        // 3000 + 65×10
    expect(r.emitted).toBe(650);
    expect(r.state).toBe("reloading_pause");
    expect(invariantHolds(r.packets, MPD)).toBe(true);
  });

  it("reloading_pause: unconditionally advances one tick to reloading, emitting nothing", () => {
    const packets = [{ departDay: 100, finishedDay: 465, amount: 3650 }];
    const r = stepMassBeam({ state: "reloading_pause", today: 465, dayStep: 100, available: big, metalPerDay: MPD, packets });
    expect(r.state).toBe("reloading");
    expect(r.emitted).toBe(0);
    expect(r.packets).toHaveLength(1); // untouched
    expect(r.packets[0].finishedDay).toBe(465);
  });

  it("reloading: waits the reload window, then opens a fresh packet", () => {
    const packets = [{ departDay: 100, finishedDay: 465, amount: 3650 }];
    // only 50 days since finish — still reloading, no new packet
    let r = stepMassBeam({ state: "reloading", today: 515, dayStep: 50, available: big, metalPerDay: MPD, packets });
    expect(r.state).toBe("reloading");
    expect(r.packets).toHaveLength(1);
    // now 91+ days since finish — refire with a brand-new packet
    r = stepMassBeam({ state: "reloading", today: 556, dayStep: 100, available: big, metalPerDay: MPD, packets });
    expect(r.state).toBe("firing");
    expect(r.packets).toHaveLength(2);
    expect(r.packets[1]).toEqual({ departDay: 556, finishedDay: 656, amount: 1000 });
    expect(invariantHolds(r.packets, MPD)).toBe(true);
  });

  it("never opens a zero-day packet when the reserve is empty", () => {
    const r = stepMassBeam({ state: "empty", today: 100, dayStep: 100, available: 0, metalPerDay: MPD, packets: [] });
    expect(r.state).toBe("empty");
    expect(r.packets).toHaveLength(0);
    expect(r.emitted).toBe(0);
  });

  it("reserve-limited fire: only fires the days it can afford", () => {
    // reserve only covers 30 days of firing (30×10 = 300 metal)
    const r = stepMassBeam({ state: "empty", today: 100, dayStep: 100, available: 300, metalPerDay: MPD, packets: [] });
    expect(r.packets).toHaveLength(1);
    expect(r.packets[0].finishedDay).toBe(130); // only 30 days
    expect(r.packets[0].amount).toBe(300);
    expect(r.emitted).toBe(300);
    expect(invariantHolds(r.packets, MPD)).toBe(true);
  });

  it("firing with a dry reserve stays firing and emits nothing", () => {
    const packets = [{ departDay: 100, finishedDay: 200, amount: 1000 }];
    const r = stepMassBeam({ state: "firing", today: 200, dayStep: 100, available: 0, metalPerDay: MPD, packets });
    expect(r.state).toBe("firing");
    expect(r.emitted).toBe(0);
    expect(r.packets[0].finishedDay).toBe(200); // unchanged
  });

  it("does not mutate the input packets array or its objects", () => {
    const packets = [{ departDay: 100, finishedDay: 200, amount: 1000 }];
    const snapshot = JSON.stringify(packets);
    stepMassBeam({ state: "firing", today: 200, dayStep: 100, available: 1e18, metalPerDay: MPD, packets });
    expect(JSON.stringify(packets)).toBe(snapshot);
  });

  it("full cycle drains a system into separated packets (×100-like dayStep)", () => {
    // producedNet 9000, metalPerDay = 9000/900 = 10. Run many ticks at dayStep 100.
    const producedNet = 9000, mpd = producedNet / 900;
    let state = "empty", packets = [], shipped = 0, today = 0;
    for (let i = 0; i < 40 && shipped < producedNet - 1e-6; i++) {
      const available = producedNet - shipped;
      const r = stepMassBeam({ state, today, dayStep: 100, available, metalPerDay: mpd, packets });
      state = r.state; packets = r.packets; shipped += r.emitted; today += 100;
    }
    // all metal emitted, split across more than one packet (a train)
    expect(shipped).toBeCloseTo(producedNet, 6);
    expect(packets.length).toBeGreaterThan(1);
    // packets are separated: each next departDay is at/after the prior finishedDay + reload
    for (let i = 1; i < packets.length; i++) {
      expect(packets[i].departDay).toBeGreaterThanOrEqual(packets[i - 1].finishedDay);
    }
    expect(invariantHolds(packets, mpd)).toBe(true);
  });

  // ---- defensive branches (should never happen in normal play, but must be safe) ----

  it("firing with no packets falls back to empty (defensive)", () => {
    const r = stepMassBeam({ state: "firing", today: 100, dayStep: 100, available: big, metalPerDay: MPD, packets: [] });
    expect(r.state).toBe("empty");
    expect(r.packets).toHaveLength(0);
    expect(r.emitted).toBe(0);
  });

  it("reloading with no packets refires immediately (last-is-null fallback)", () => {
    // no prior packet → daysReloading defaults to reloadWindow → allowed to fire at once
    const r = stepMassBeam({ state: "reloading", today: 100, dayStep: 100, available: big, metalPerDay: MPD, packets: [] });
    expect(r.state).toBe("firing");
    expect(r.packets).toHaveLength(1);
    expect(r.packets[0]).toEqual({ departDay: 100, finishedDay: 200, amount: 1000 });
  });

  it("reloading with no packets and a dry reserve stays reloading", () => {
    const r = stepMassBeam({ state: "reloading", today: 100, dayStep: 100, available: 0, metalPerDay: MPD, packets: [] });
    expect(r.state).toBe("reloading");
    expect(r.packets).toHaveLength(0);
    expect(r.emitted).toBe(0);
  });

  it("metalPerDay of 0 emits nothing (no divide-by-zero)", () => {
    const r = stepMassBeam({ state: "empty", today: 100, dayStep: 100, available: big, metalPerDay: 0, packets: [] });
    expect(r.state).toBe("empty");
    expect(r.packets).toHaveLength(0);
    expect(r.emitted).toBe(0);
  });
});

describe("deliverBeam — metal arriving at Sol", () => {
  const DELAY = 1435; // Alpha Centauri ≈ 4.37 ly → systemDelayDays

  // a packet emitted over [dep, fin] carrying `amount`
  const pkt = (departDay, finishedDay, amount, consumedUntilDay) =>
    consumedUntilDay == null
      ? { departDay, finishedDay, amount }
      : { departDay, finishedDay, amount, consumedUntilDay };

  it("delivers nothing while the head is still in transit", () => {
    // packet departed day 9000, head arrives 9000+1435 = 10435. Today 10000 < that.
    const r = deliverBeam({ today: 10000, systemDelayDays: DELAY, packets: [pkt(9000, 9100, 1000)] });
    expect(r.delivered).toBe(0);
    expect(r.packets).toHaveLength(1);
    // cursor initialized to arriveDay, nothing consumed
    expect(r.packets[0].consumedUntilDay).toBe(9000 + DELAY);
  });

  it("delivers a partial window once the head has arrived", () => {
    // depart 9000, finish 9100 (100-day packet, amount 1000 → 10/day).
    // head arrives 10435, tail arrives 10535. Today 10440 → deliver [10435, 10440] = 5 days.
    const r = deliverBeam({ today: 10440, systemDelayDays: DELAY, packets: [pkt(9000, 9100, 1000)] });
    expect(r.delivered).toBeCloseTo(50, 9); // 5 days × 10/day
    expect(r.packets[0].consumedUntilDay).toBe(10440);
  });

  it("delivers exactly the remaining window and caps the cursor at the tail", () => {
    // same packet, but today well past the tail (10535). Deliver [10435, 10535] = 100 days = full 1000.
    const r = deliverBeam({ today: 10535, systemDelayDays: DELAY, packets: [pkt(9000, 9100, 1000)] });
    expect(r.delivered).toBeCloseTo(1000, 9);
    // tailArriveDay (10535) is not < today (10535), so packet is kept, cursor pinned at tail
    expect(r.packets).toHaveLength(1);
    expect(r.packets[0].consumedUntilDay).toBe(10535);
  });

  it("removes a packet once its tail has fully passed Sol", () => {
    // today strictly past tailArriveDay (10535) → packet dropped
    const r = deliverBeam({ today: 10536, systemDelayDays: DELAY, packets: [pkt(9000, 9100, 1000)] });
    expect(r.packets).toHaveLength(0);
  });

  it("resumes from a stored cursor rather than re-delivering", () => {
    // cursor already at 10440 (5 days delivered). Now today 10460 → deliver [10440, 10460] = 20 days.
    const r = deliverBeam({ today: 10460, systemDelayDays: DELAY, packets: [pkt(9000, 9100, 1000, 10440)] });
    expect(r.delivered).toBeCloseTo(200, 9); // 20 × 10
    expect(r.packets[0].consumedUntilDay).toBe(10460);
  });

  it("delivers the full amount across a packet's life, exactly once (conservation)", () => {
    let packets = [pkt(9000, 9100, 1000)];
    let total = 0;
    // step day by day from before arrival to after the tail passes
    for (let today = 10000; today <= 10600; today++) {
      const r = deliverBeam({ today, systemDelayDays: DELAY, packets });
      packets = r.packets;
      total += r.delivered;
    }
    expect(total).toBeCloseTo(1000, 6);
    expect(packets).toHaveLength(0); // fully delivered and removed
  });

  it("is framejack-invariant: one big step delivers the same as many small steps", () => {
    const make = () => [pkt(9000, 9100, 1000)];
    // many small steps
    let small = make(), smallTotal = 0;
    for (let today = 10000; today <= 10600; today += 1) {
      const r = deliverBeam({ today, systemDelayDays: DELAY, packets: small });
      small = r.packets; smallTotal += r.delivered;
    }
    // one big leap straight past the tail — but it must still deliver only the packet's amount
    let big = make(), bigTotal = 0;
    for (const today of [10000, 10600]) {
      const r = deliverBeam({ today, systemDelayDays: DELAY, packets: big });
      big = r.packets; bigTotal += r.delivered;
    }
    expect(bigTotal).toBeCloseTo(smallTotal, 6);
    expect(bigTotal).toBeCloseTo(1000, 6);
  });

  it("handles multiple packets in one call, delivering each independently", () => {
    // two packets: one mid-delivery, one not yet arrived
    const packets = [
      pkt(9000, 9100, 1000),   // arrives 10435..10535
      pkt(9300, 9400, 1000),   // arrives 10735..10835
    ];
    const r = deliverBeam({ today: 10470, systemDelayDays: DELAY, packets });
    // first: [10435,10470] = 35 days × 10 = 350; second: not arrived (head 10735 > 10470)
    expect(r.delivered).toBeCloseTo(350, 6);
    expect(r.packets).toHaveLength(2);
    expect(r.packets[0].consumedUntilDay).toBe(10470);
    expect(r.packets[1].consumedUntilDay).toBe(9300 + DELAY); // initialized, untouched
  });

  it("does not mutate the input packets", () => {
    const packets = [pkt(9000, 9100, 1000)];
    const snapshot = JSON.stringify(packets);
    deliverBeam({ today: 10460, systemDelayDays: DELAY, packets });
    expect(JSON.stringify(packets)).toBe(snapshot);
  });

  it("defensively skips a zero-duration packet without dividing by zero", () => {
    // departDay === finishedDay → duration 0. Should deliver nothing, not NaN.
    const r = deliverBeam({ today: 20000, systemDelayDays: DELAY, packets: [pkt(9000, 9000, 0)] });
    expect(r.delivered).toBe(0);
    expect(Number.isNaN(r.delivered)).toBe(false);
    // tail (9000+1435=10435) < today (20000) → removed
    expect(r.packets).toHaveLength(0);
  });
});
