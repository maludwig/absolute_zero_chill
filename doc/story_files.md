# ABSOLUTE ZERO CHILL — story files map

A reference for **where the narrative lives** in the codebase. The story is not in
one place; it's distributed across modals, log messages, and flavor text on techs,
buildings, and ideas. This document maps each source to what it holds.

See `doc/act_1.md`, `doc/act_2.md`, `doc/act_3.md` for the extracted prose
itself, act by act.

---

## The five sources at a glance

| File | Role in the story | Acts |
|------|-------------------|------|
| `src/components/Modal.jsx` | The three act-boundary **modals** — the big dramatic set-pieces | I, II, III |
| `src/store.js` | The **boot log** + all beat-by-beat `pushLog` narration in `checkMilestones` | I, II, III |
| `src/config.js` | **Flavor text** on every tech, building, body, and idea; the temperature stakes | I, II, III |
| `src/components/Philosophy.jsx` | The **Insight / Idea** panel framing ("contemplate to spend it") | II, III |
| `src/components/GalacticLogistics.jsx` | The **galaxy-seeding** dartboard framing | III |

---

## By source — what each file holds

### `src/components/Modal.jsx`
The three narrative set-pieces, each firing once at an act boundary:
- **`ActOneModal`** — "Pre-industrial temperature restored." The fake-victory
  checkpoint that reframes the directive (warming reversed, but *energy remains*).
- **`ActTwoModal`** — "Kardashev Type II / A star at your command." Mass and mirrors
  are exhausted; the 2.7 K sky can't be out-built; you must leave.
- **`FinaleModal`** — "Global warming has stopped." The ending, plus the
  customer-service coda ("Thank you for using SOLETTA…") — the game's punchline.
- Header comments in this file also state the central conceit of each act.

### `src/store.js`
The moment-to-moment narration. Two places:
- **Boot log** (bottom of `createStore`) — "SOLETTA-1 awake in the asteroid belt…"
- **`checkMilestones`** — every `pushLog(...)` call, fired as the player crosses a
  threshold. This is the single densest source of story beats: mining bootstrap,
  Replication, Shade Panels, the pre-industrial climax, the human fleet, oceans
  freezing, MAC guns, Stellar Engine, core heat, probing, framejack CPUs, the
  Matrioshka Brain, TARS/Galactic Logistics, Planetary Sail, arrival at Sgr A★, the
  Black Eye, and the directive satisfied.
- Also holds the **mechanics** that carry story stakes (human-vessel spawning, the
  ocean-freeze cutoff, relocation timing).

### `src/config.js`
All the **flavor text**, plus the numbers that define the stakes:
- **`CLIMATE`** — the temperature anchors (288.5 K start, 287 K pre-industrial,
  2.7 K CMB floor, Hawking temp of Sgr A★).
- **`TECHS`** — description strings for every research (Replication "the exponential
  begins," Stellar Engine, Nicoll-Dyson Beaming, the framejack CPUs, the K3/
  relocation/radiator techs).
- **`BUILDINGS`** — description strings for every structure (Shade Panel "the Sun is
  only 100% large," Core Heat Pipe, Matrioshka Brain, Planetary Sail, the Black Eye).
- **`BODIES`** — per-body mining flavor (`mineDesc`, `railgunDesc`, `ringDesc`,
  `spireDesc`) for the belt, moons, and planets.
- **`IDEAS`** — the Philosophy tree blurbs (Be One With The Universe, Center
  Yourself, Open Your Third Eye, Turiya, Samadhi).
- **`HEAT_PIPES`** — the core-cooling upgrade descriptions.
- **`CONFIG`** — relocation constants (0.9c, 26,000 ly to the galactic centre).

### `src/components/Philosophy.jsx`
The framing for the **Insight / Idea** mechanic — the contemplative register that
arrives with the Matrioshka Brain. Panel tagline "Insight …/day · contemplate to
spend it" and the code comment explaining Ideas vs. Research. The blurbs themselves
live in `config.js` `IDEAS`.

### `src/components/GalacticLogistics.jsx`
The **galaxy-seeding** endgame framing — the polar dartboard over the Milky Way,
the Seed-wave mechanic, and the line "each wedge you light up becomes Brains, and
their Insight floods home at the speed of light." Readout labels (Launch charge,
Seeds in hand, Stars reached / heard, Galaxy Insight).

---

## The three-act spine (for orientation)

The same joke escalates across all three acts: **a floor the AI cannot out-build.**

1. **Act I** — cool Earth to pre-industrial. *But that isn't zero; energy remains.*
   → climaxes in `ActOneModal`; beats in `store.js`; flavor in `config.js`.
2. **Act II** — Kardashev II, dismantle the inner system, fight the planet's core.
   *But neither a whole star nor mirrors beat the 2.7 K sky.* → `ActTwoModal`;
   introduces Philosophy (`Philosophy.jsx` + `IDEAS`).
3. **Act III** — seed a galaxy of minds, move the Earth to Sagittarius A★, radiate
   into the black hole forever. *The directive, taken to its literal end.* →
   `FinaleModal` + coda; `GalacticLogistics.jsx`; the K3/relocation techs.

---

## Notes on act boundaries (judgment calls)

The acts blur at the edges; a few beats straddle boundaries:
- **Mining tiers** (Lunar Mass Drivers → Fusion Spires, planetary disassembly)
  begin in Act I and continue through Act II.
- **The Idea tree** is *introduced* in Act II (first Matrioshka Brain opens
  Philosophy) but mostly *realized* in Act III, once a galaxy of Brains funds the
  Insight. Documented in both act files with cross-notes.
- **The Stellar Engine** is treated as the Act I→II hinge; **the first Matrioshka
  Brain + Philosophy** as the Act II→III hinge.
