/* beams.js — the Mass Driver's pulsed emission model (Act III interstellar shipping).

   A Mass Driver ships a system's harvested metal home in PULSES: it fires a beam
   for up to BEAM_FIRE_DAYS, then reloads for BEAM_RELOAD_DAYS before the next pulse,
   so the stream reads as a train of separated slugs rather than one continuous ribbon.

   This module is intentionally pure and dependency-free so the (edge-case-heavy)
   state machine can be exhaustively unit-tested in isolation. Delivery — the metal
   actually arriving at Sol across the interstellar gap — is a separate concern. */

// NOTE: beams.js is a pure leaf that shared/model.js re-exports FROM, so it must not
// import model (that would be a cycle). This 365 is the one DAYS_PER_YEAR site that
// stays a literal for that reason — it means "one game-year" and tracks DAYS_PER_YEAR
// by convention. If DAYS_PER_YEAR ever changes, update this too.
export const BEAM_FIRE_DAYS = 365;    // a pulse fires for up to one game-year (= DAYS_PER_YEAR)
export const BEAM_RELOAD_DAYS = 91;   // then reloads for ~a quarter-year before the next

/* stepMassBeam — the Mass Driver's emission state machine, advanced one tick.
   PURE: no store, no UI, no other-module imports.

   A beamPacket is { departDay, finishedDay, amount }, with the invariant
     amount === metalPerDay × (finishedDay − departDay)
   so metalPerDay is recoverable per packet and the packet's on-rail length is
   (finishedDay − departDay). The last packet is the one currently being extended.

   States:
     "empty"           — nothing firing; open a packet if metal allows → "firing"
     "firing"          — extend the last packet; at fireWindow → "reloading_pause"
     "reloading_pause" — unconditional one-tick beat (guarantees ≥1 visible reload tick) → "reloading"
     "reloading"       — wait reloadWindow since the last packet finished, then refire

   `available` is the metal in reserve we may emit this tick. We never emit more
   than that: actualDays = min(plannedDays, available / metalPerDay). A packet is
   only opened/extended when actualDays > 0 (never a zero-duration packet).

   Returns { state, packets, emitted } — emitted is the metal shipped this tick,
   so the caller can advance its shipped total. `packets` is always a fresh array
   of fresh objects; the inputs are never mutated. */
export function stepMassBeam({
  state, today, dayStep, available, metalPerDay,
  fireWindow = BEAM_FIRE_DAYS, reloadWindow = BEAM_RELOAD_DAYS, packets,
}) {
  const out = packets.map((p) => ({ ...p }));
  const last = out.length ? out[out.length - 1] : null;
  let st = state;
  let emitted = 0;

  // how many days we could fire this tick given the metal on hand
  const affordableDays = metalPerDay > 0 ? available / metalPerDay : 0;

  if (st === "reloading_pause") {
    // unconditional single-tick beat, no emission
    return { state: "reloading", packets: out, emitted: 0 };
  }

  if (st === "empty") {
    const days = Math.min(dayStep, affordableDays);
    if (days > 0) {
      out.push({ departDay: today, finishedDay: today + days, amount: metalPerDay * days });
      emitted = metalPerDay * days;
      st = "firing";
    }
    // else stay "empty" — nothing to send yet
    return { state: st, packets: out, emitted };
  }

  if (st === "reloading") {
    // wait until the gap since the last packet finished reaches the reload window
    const daysReloading = last ? today - last.finishedDay : reloadWindow;
    if (daysReloading >= reloadWindow) {
      const days = Math.min(dayStep, affordableDays);
      if (days > 0) {
        out.push({ departDay: today, finishedDay: today + days, amount: metalPerDay * days });
        emitted = metalPerDay * days;
        st = "firing";
      }
      // if we can't afford to fire yet, stay "reloading" (source is dry)
    }
    return { state: st, packets: out, emitted };
  }

  // st === "firing": extend the current packet, capped at the fire window
  if (!last) {
    // defensive: firing with no packet — treat as empty this tick
    return { state: "empty", packets: out, emitted: 0 };
  }
  const daysFiredSoFar = last.finishedDay - last.departDay;
  const windowLeft = Math.max(0, fireWindow - daysFiredSoFar);
  const days = Math.min(dayStep, windowLeft, affordableDays);
  if (days > 0) {
    last.finishedDay += days;
    last.amount += metalPerDay * days;
    emitted = metalPerDay * days;
  }
  // if we've filled the fire window, break for reload
  if (daysFiredSoFar + days >= fireWindow - 1e-9) {
    st = "reloading_pause";
  }
  // (if days === 0 because the reserve is dry, we stay "firing" and wait for metal)
  return { state: st, packets: out, emitted };
}

/* deliverBeam — the metal arriving at Sol as beamPackets cross the interstellar gap.
   PURE, and — unlike emission — framejack-INVARIANT: a per-packet cursor advanced by
   elapsed time gives the same total whether stepped once or many times.

   A packet departs its source across [departDay, finishedDay] and travels systemDelayDays
   to reach Sol, so at Sol it spans [arriveDay, tailArriveDay]:
     arriveDay     = departDay   + systemDelayDays   (head lands)
     tailArriveDay = finishedDay + systemDelayDays   (tail lands)
   Metal streams into the Sol pool between those, at the packet's own rate
     metalPerDay = amount / (finishedDay − departDay).
   consumedUntilDay is the cursor: the day up to which this packet has been delivered.
   It starts at arriveDay (nothing lands before the head) and never exceeds tailArriveDay.
   `amount` is immutable — the cursor is the single source of truth for what's left.

   Each call delivers the window [consumedUntilDay, min(today, tailArriveDay)] (clamped
   to ≥ 0), advances the cursor, and drops any packet fully past Sol
   (tailArriveDay < today). Returns { packets, delivered } with fresh, un-mutated inputs. */
export function deliverBeam({ today, systemDelayDays, packets }) {
  const out = [];
  let delivered = 0;

  for (const p of packets) {
    const arriveDay = p.departDay + systemDelayDays;
    const tailArriveDay = p.finishedDay + systemDelayDays;
    const duration = p.finishedDay - p.departDay;
    let cursor = p.consumedUntilDay == null ? arriveDay : p.consumedUntilDay;

    // deliver whatever has crossed Sol since the cursor, up to the tail
    const windowEnd = Math.min(today, tailArriveDay);
    const windowDays = windowEnd - cursor;
    if (windowDays > 0 && duration > 0) {
      const metalPerDay = p.amount / duration;
      delivered += metalPerDay * windowDays;
      cursor = windowEnd;
    }

    // drop packets whose tail has fully passed Sol; keep the rest with the advanced cursor
    if (tailArriveDay < today) continue;
    out.push({ ...p, consumedUntilDay: cursor });
  }

  return { packets: out, delivered };
}
