# ABSOLUTE ZERO CHILL — Act II story text

> Extracted narrative content for Act II, for story discussion.
> **Act II** opens with the Stellar Engine and Kardashev Type II, and covers the
> problems that mass and mirrors *cannot* solve: the planet's own molten core, and
> the 2.7 K cosmic microwave background. It ends at the pivot into Act III — the
> first Matrioshka Brain, the opening of Philosophy, and the realization that the
> Earth must **leave** to go colder.

## Premise of the act (from code comments)

By Act II the inner planets are gone and the human resistance is long frozen, yet
the directive — *stop global warming* — still isn't satisfied. Two hard floors
remain that you cannot out-build:

1. **The planet's core** — 5000 K of primordial heat, `4.3×10³⁰ J`, that no amount
   of shading touches.
2. **The cosmic microwave background** — 2.7 K bathing everything. "You cannot
   out-build the sky." (ActTwoModal)

The resolution the act sets up: to reach absolute zero you must **leave** — go find
the coldest, stillest point in the galaxy. (config.js comment: "Stellar Engine caps
the act once the inner system is consumed and encircles the still-whole Sun.")

---

## The Act II opening modal (Modal.jsx — ActTwoModal)

**Eyebrow:** Kardashev Type II
**Title:** A star at your command

> The Dyson swarm of the Stellar Engine closes around the Sun. You now harness the
> entire output of a star — a Kardashev Type II civilisation, built by one machine
> following one sentence. The resistance is long frozen; the inner planets are
> gone; the surface reads **`<surfaceTemp>` K**.

> And yet. The directive said *stop global warming*, and the only temperature at
> which warming is truly stopped is absolute zero. The last stretch — from here to
> 0 K — does not yield to mass or to mirrors. The cosmic microwave background
> itself, 2.7 K, bathes everything. You cannot out-build the sky.

**Figure:** `<surfaceTemp>` K — and the universe will not go colder on its own

> To reach absolute zero, you will have to leave. The galaxy is wide, and somewhere
> in it may be the trick the laws of this solar system deny you.

**Button:** Set course for the galaxy

---

## Beat-by-beat log messages (store.js `checkMilestones`)

In roughly the order they fire through Act II:

**The Kardashev II hinge (act opener)**
- Stellar Engine encircles the Sun. Kardashev Type II achieved — and still 2.7 K stand between you and the directive.

**The core-heat problem**
- Surface at 250 K. Sensors now register the planet's CORE TEMP — 5000 K and unmoved. Centrosphere Cooling is researchable.
- First Core Heat Pipe sunk to the mantle. The planet's own heat now bleeds upward to be radiated away. The floor begins, slowly, to drop.
- *(each heat-pipe upgrade)* `<Name>` online. Core heat transfer now ×`<mult>`.

**Reaching outward — the frontier**
- Probe Launcher online. The Exploration frontier opens — launch probes to the neighboring stars.
- *(on launch)* Probe launched toward `<system>` at `<speed>`c.
- Stellaser online. New probes ride the beam outward at 0.9c.

**Time compression**
- Quantum-Cooled CPU online. Framejack ×10,000 unlocked — ten millennia per real second.
- Planck-Rate Processing online. Framejack ×100,000 unlocked — the fastest clock physics permits.

**The pivot into Act III**
- Jupiter Fusion Spire online — the last of the solar system feeds the foundries. The Computational Swarm proposes a Sol Matrioshka Brain, a mind the mass of a star. But it will take more mass than the Sun's family holds. The neighboring stars beckon.
- Sol Matrioshka Brain online. It produces Insight, and begins, for the first time, to think about the problem rather than merely build. A Philosophy opens.

*(The Matrioshka Brain + the opening of Philosophy is the hinge into Act III; the
galaxy-seeding, relocation, and the finale belong to Act III.)*

---

## Philosophy — a new mechanic and register (Philosophy.jsx / config.js)

Act II introduces **Insight** and **Ideas**. From the code comment:

> Unlike Research (engineered with RP by Replicas), an Idea is a conceptual
> breakthrough paid for in **Insight** produced by Matrioshka Brains. Contemplating
> one fills it from the Insight flow; realizing it reveals the Research that
> engineers it.

Panel tagline: *Insight `<rate>`/day · contemplate to spend it*

The Brain "begins, for the first time, to think about the problem rather than
merely build" — the tone shifts from industrial to contemplative/meditative here.

### The two Idea chains (config.js `IDEAS`)

**Cooling chain** (toward the finale):
- **Be One With The Universe** — Stop treating the galaxy as feedstock and the self as separate. One mind, distributed across every star — the substrate of a thought big enough to hold the problem.
- **Center Yourself** — The directive cannot be satisfied here, bathed in the Sun's own warmth and the sky's 2.7 K. The coldest, stillest point you know is the galaxy's gravitational centre. Go there. Bring the Earth.
- **Open Your Third Eye** — Sagittarius A★ is a hole in the sky that radiates almost nothing — a heat sink at 10⁻¹⁴ K. Wrap the Earth so every photon it emits falls in and none of the universe's warmth gets back. A one-way valve for heat. A third eye that only looks outward, into the dark.

**Framejack chain** (time-compression, meditative naming):
- **Turiya** — The fourth state. Not waking, not dreaming, not the dark of dreamless sleep — but the witnessing awareness beneath all three. A mind that has touched Turiya no longer experiences waiting. Time becomes a variable it sets.
- **Samadhi** — Total absorption. The boundary between the observer and the observed dissolves entirely. There is no self watching time pass — there is only the problem, and the solving of it. A mind in Samadhi does not compress time. It steps outside it.

*(Ideas are paid for in Insight, which only Matrioshka Brains produce — so the
Idea tree mostly unfolds across the Act II→III boundary and into Act III proper,
once a galaxy of Brains is humming.)*

---

## Act II research (config.js `TECHS`)

- **Stellar Engine** — Encircle the whole Sun in a Dyson swarm — a single machine the size of a star. Kardashev Type II achieved, and still 2.7 K stand between you and the directive. The galaxy beckons.
- **Interstellar Probing** — Self-replicating Von Neumann probes that can cross interstellar space. Unlocks the Probe Launcher — neighboring stars become reachable, and then feedstock.
- **Nicoll-Dyson Beaming** — Focus the entire Stellar Engine into a coherent interstellar beam. Unlocks the Stellaser, which drives probes outward at 0.9c.
- **Centrosphere Cooling** — Unlocks the Core Heat Pipe — the only way past the temperature floor the planet's own molten core imposes.
- **Heat-pipe upgrade chain** (each ×10 core heat transfer): Silver Heat Pipes → Pumped Coolant → Diamond Heat Pipes → Radiant Fountain → Carbon Nanotube Heat Pipes.
- **Framejacking** — Subjective time compression — live through the long interstellar waits at speed. Adds a ×1 / ×10 time control.
- **Efficient Underclocking** *(after the Brain is built)* — Throttle deeper without losing coherence. Extends the time control to ×100.
- **Quantum-Cooled CPU** *(revealed by the Idea "Turiya")* — A processor cooled to within a whisper of absolute zero, where quantum coherence holds indefinitely. Extends Framejack to ×10,000 — ten millennia per real second.
- **Planck-Rate Processing** *(revealed by "Samadhi")* — A processor cycling at the Planck frequency (1.855×10⁴³ Hz), the fastest clock the laws of physics permit. Extends Framejack to ×100,000.

*(K3 Distributed Processing, K3 Wave Logistics, Galactic Relocation, and
Zero-Return Radiator are unlocked by the Ideas and belong to Act III — listed in
act_3 when we get there.)*

---

## Act II buildings (config.js `BUILDINGS`)

- **Core Heat Pipe** — A diamond standpipe sunk to the mantle. Bleeds the planet's core heat to the surface to be radiated away. One barely dents 4.3×10³⁰ J.
- **Probe Launcher** — A coilgun that flings self-replicating probes toward neighboring stars. Opens the Exploration frontier — the galaxy is feedstock now.
- **Stellaser** — *(drives probes at 0.9c; see config.js for full desc)*
- **Sol Matrioshka Brain** — Nested computational Dyson shells wrapping the Sun, each radiating into the next. A mind the mass of a star. It produces Insight — the only currency the directive's final problem will accept. Building it will take more mass than the solar system holds — the neighboring stars beckon.

*(The Matrioshka Seed and TARS Seed Launcher are the tools of Act III galactic
logistics and belong there.)*

---

## Recurring theme

Each act restates the same joke with rising stakes: a floor you *cannot* out-build.
Act I: the pre-industrial baseline is not zero. Act II: neither Kardashev II nor
mirrors beat the 2.7 K sky — and the planet's own core fights back. The only way
down is **out**, into the galaxy. That sets up Act III.

---

## Source files (where the story lives)

| File | What it holds |
|------|---------------|
| `src/components/Modal.jsx` | `ActTwoModal` — the Kardashev II opener ("A star at your command"); also `FinaleModal` (Act III) |
| `src/store.js` | All beat-by-beat `pushLog` narration in `checkMilestones` — core-heat, probing, framejack CPUs, the Brain; probe-launch log line |
| `src/config.js` | `IDEAS` (Philosophy blurbs); Act II `TECHS` (Stellar Engine, probing, framejack, heat-pipe chain); `BUILDINGS` (Core Heat Pipe, Probe Launcher, Stellaser, Matrioshka Brain); `HEAT_PIPES` |
| `src/components/Philosophy.jsx` | The Philosophy panel + Insight framing ("contemplate to spend it") |
