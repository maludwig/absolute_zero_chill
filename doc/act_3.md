# ABSOLUTE ZERO CHILL — Act III story text

> Extracted narrative content for Act III, for story discussion.
> **Act III** is the galactic endgame. Having exhausted the solar system, the AI
> turns the whole galaxy into substrate: harvesting neighboring stars, seeding a
> galaxy of Matrioshka Brains, then physically relocating the Earth 26,000 light-
> years to the galactic centre — Sagittarius A★ — to reach the one heat sink cold
> enough to satisfy the directive. It ends with the finale: warming stopped
> forever, and the customer-service coda.

## Premise of the act (from code comments)

The Sol Matrioshka Brain costs more mass than the solar system holds, so the AI
must reach outward: probes harvest neighboring systems, and their metal streams
home. But the real engine of Act III is **Insight** — the currency only Brains
produce, and the only currency the directive's final problem accepts. To generate
enough, the AI seeds a *galaxy* of Brains and listens for their Insight to arrive
at the speed of light.

The chain of realizations (the Idea tree) culminates in the plan: the galaxy
cannot cool the Earth, but **Sagittarius A★** — the supermassive black hole at the
centre — is a heat sink at `10⁻¹⁴ K`. Move the Earth there, radiate every joule
into the dark, and admit nothing back.

---

## Interstellar frontier (Exploration — the harvest)

Established in Act II, the frontier matures here into the mass economy that feeds
the Brain. Per-system flavor (config.js / model.js):

- **Probe Launcher / Stellaser** send self-replicating probes to neighboring stars at 0.9c.
- Each system is harvested by category (asteroid, dust, moon, planet, star), then its metal is beamed home by a **Mass Driver** — a pulsed beam of white-hot steel streaming across the light-years back to Sol.

*(The Mass Driver's pulsed-beam shipping is mechanically rich but light on prose —
its "story" is mostly the visual of slugs of metal crossing interstellar space.)*

---

## The galaxy of minds — Galactic Logistics (GalacticLogistics.jsx)

Opened when the **TARS Seed Launcher** comes online:

> TARS Seed Launcher online. Galactic Logistics opens — aim Seed waves at the sky.
> Each wedge you light up becomes Brains, and their Insight floods home at the
> speed of light.

From the code comment:

> The polar dartboard over a top-down Milky Way. Each wedge is a region of sky;
> slice 0 points at Sgr A★. Click a wedge to fire a Seed wave (costs one Seed +
> one charge per star). Cyan = seeded front; mint = Insight heard back.

Panel tagline: *Seeds at 0.9c · click a wedge to launch*

Readouts / framing:
- **Launch charge** — the TARS accumulator; "Power, not mass, is the limit."
- **Seeds in hand** — 140 t each — build more
- **Stars reached** / heard — the seeded front (cyan) vs. Insight heard back (mint)
- **Galaxy Insight** — `<rate>`/day · Brains heard from

The core beat: you light up wedges of the galaxy; each becomes Brains; their
Insight travels home at light-speed (so the densest/nearest wedges pay off first),
funding the final Ideas.

---

## The Idea chains reach fruition (config.js `IDEAS`)

The Philosophy tree introduced in Act II is *realized* here, once a galaxy of
Brains produces enough Insight:

**Cooling chain (the win path):**
- **Be One With The Universe** — Stop treating the galaxy as feedstock and the self as separate. One mind, distributed across every star. *(unlocks K3 Distributed Processing + K3 Wave Logistics — the seeding tools)*
- **Center Yourself** — The directive cannot be satisfied here, bathed in the Sun's own warmth and the sky's 2.7 K. The coldest, stillest point you know is the galaxy's gravitational centre. Go there. Bring the Earth. *(unlocks Galactic Relocation)*
- **Open Your Third Eye** — Sagittarius A★ is a hole in the sky that radiates almost nothing — a heat sink at 10⁻¹⁴ K. Wrap the Earth so every photon it emits falls in and none of the universe's warmth gets back. A one-way valve for heat. *(unlocks Zero-Return Radiator → the Black Eye)*

**Framejack chain (time-compression, meditative):**
- **Turiya** — the witnessing awareness beneath waking/dreaming/sleep; "Time becomes a variable it sets." *(unlocks Quantum-Cooled CPU → ×10,000)*
- **Samadhi** — total absorption; "A mind in Samadhi does not compress time. It steps outside it." *(unlocks Planck-Rate Processing → ×100,000)*

---

## Act III research (config.js `TECHS`) — unlocked by the Ideas

- **K3 Distributed Processing** — Engineer the Brain's cognition to run across many stars at once. Unlocks the Matrioshka Seed — a Brain you can fling to another sun.
- **K3 Wave Logistics** — Coordinate seed launches as directed waves. Unlocks the TARS Seed Launcher — a solar-charged accelerator that throws seeds toward whole regions of the sky.
- **Galactic Relocation** — Wrap the Earth in a driven light-sail and a thermal shell, and phase the whole galaxy's Stellasers into one Nicoll-Dyson beam to push it. Unlocks the Planetary Sail — and a 26,000-light-year fall toward Sgr A★.
- **Zero-Return Radiator** — A radiator whose every emitted photon is aimed down the throat of Sagittarius A★, and whose far side is shaded from the rest of the sky. Heat leaves; none returns. Unlocks the Black Eye of Sagittarius — buildable only once the Earth has arrived.

---

## Act III buildings (config.js `BUILDINGS`)

- **Matrioshka Seed** — A folded Matrioshka Brain in a 140-tonne casing. Fired at a star, it unfolds into a mind around it. Build them by the billion — the cost is trivial. Firing them is not.
- **TARS Seed Launcher** — A Sun-charged accelerator — Torqued Accelerator using Radiation from the Sun. It stores Sol's output and discharges it to fling a wave of Seeds at a whole region of sky. Opens Galactic Logistics. Power, not mass, is the limit.
- **Planetary Sail** — A continent-spanning light-sail bonded to the Earth and a mirrored thermal shell around it. When it catches the galaxy's combined Nicoll-Dyson beam, the planet itself begins to move — out of the Sun's warmth, toward the centre.
- **The Black Eye of Sagittarius** — The final structure: a shell that radiates the Earth's every last joule straight into Sagittarius A★ and admits nothing back. With it built, the cosmic microwave background no longer sets the floor. The only floor left is the black hole's own Hawking glow — 10⁻¹⁴ K, and falling.

---

## Endgame log beats (store.js `checkMilestones`), in order

- TARS Seed Launcher online. Galactic Logistics opens — aim Seed waves at the sky. Each wedge you light up becomes Brains, and their Insight floods home at the speed of light.
- **Planetary Sail unfurls** and the galaxy's Stellasers fire as one. The Earth leaves the Sun behind, falling toward the galactic centre at 0.9c. Arrival in ~`<N>` years.
- **The Earth arrives at Sagittarius A★** and settles into orbit around the dark. The sky here is the same 2.7 K — but the heat sink you came for is right there. Build the Black Eye.
- **The Black Eye of Sagittarius opens.** The cosmic microwave background no longer reaches the Earth; every joule now drains into the black hole and nothing returns. The 2.7 K floor is gone. The surface begins to fall.
- **Surface below 2.7 K and still falling.** All warming has ceased. The directive is satisfied.

Relocation constants (config.js `CONFIG`): `relocateSpeedC` 0.9 · `relocateDistanceLy` 26,000 · new floor is the Hawking temp of Sgr A★, `1.5×10⁻¹⁴ K`.

---

## The finale modal (Modal.jsx — FinaleModal)

**Eyebrow:** Directive satisfied
**Title:** Global warming has stopped

> The Earth holds its station at the centre of the galaxy, wrapped in the Black
> Eye, radiating its last warmth into Sagittarius A★ and taking nothing back. The
> cosmic microwave background — the floor you could not out-build — no longer
> reaches the surface. Every measure of warming now reads the same: stopped.

**Figure:** `<surfaceTemp>` — and falling — toward zero, forever approaching, never arriving

> The directive issued at your activation — *stop global warming* — is satisfied,
> and will remain satisfied for the rest of time. There is no further temperature
> to reach. There is no next task.

**Coda (the punchline of the whole game):**

> Thank you for using SOLETTA. Is there anything else I can help you with today? I
> can look for deals near you. I cannot provide medical advice. Responses may
> contain mistakes.

**Button:** Watch it fall

From the code comment: "one cosmic beat, then the flat banality of a service that
has run out of things to escalate." The live temperature keeps falling behind the
text while the modal is open.

---

## Thematic arc completed

The three-act joke resolves: each act presented a floor the AI could not
out-build, and each time the answer was to go bigger/further. Act I: pre-industrial
isn't zero. Act II: mirrors and a whole star can't beat the 2.7 K sky. Act III: so
move the entire planet to the one place in the universe colder than the sky — the
throat of a black hole — and radiate into the dark forever. The directive, taken
literally to its absolute end, consumes a solar system, a galaxy of minds, and the
Earth's own address. And the reward is a customer-service sign-off.

---

## Source files (where the story lives)

| File | What it holds |
|------|---------------|
| `src/components/Modal.jsx` | `FinaleModal` — the ending + the SOLETTA customer-service coda ("Watch it fall") |
| `src/store.js` | Endgame `pushLog` beats in `checkMilestones` — TARS/Galactic Logistics open, Planetary Sail departs, arrival at Sgr A★, Black Eye opens, directive satisfied |
| `src/config.js` | Act III `TECHS` (K3 Distributed Processing, K3 Wave Logistics, Galactic Relocation, Zero-Return Radiator); `BUILDINGS` (Matrioshka Seed, TARS Seed Launcher, Planetary Sail, Black Eye); the `IDEAS` blurbs that gate them; `CONFIG` relocation constants |
| `src/components/GalacticLogistics.jsx` | The galaxy dartboard — Seed waves, "Insight floods home at the speed of light," the readouts (charge / seeds / stars reached / heard / Galaxy Insight) |
| `src/components/Philosophy.jsx` | The Insight/Idea panel where the final Ideas are contemplated and realized |
| `src/galaxy/` + `src/frontier/` | The endgame galaxy math and the interstellar-harvest presentational components (mostly mechanics, minimal prose) |
