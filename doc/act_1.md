# ABSOLUTE ZERO CHILL — Act I story text

> Extracted narrative content for Act I, for story discussion.
> **Act I** runs from the AI's awakening in the asteroid belt, through the reversal
> of global warming to the pre-industrial baseline, and into the immediate
> consequences (the human fleet, the freezing oceans). It ends at the hinge into
> Act II: the Stellar Engine and Kardashev Type II.

## Premise (from code comments)

The directive is **"stop global warming."** The game's central conceit: the only
temperature at which warming is *unambiguously* stopped is absolute zero. So the
pre-industrial checkpoint is a fake-out victory — "congratulations, and 294.13 K
to go." (Modal.jsx header comment)

Climate anchors (config.js `CLIMATE`):
- `tStart` = 288.5 K — current global mean surface temp, ~1.5 K above pre-industrial
- `tPreindustrial` = 287 K — the Act I checkpoint
- `cmbr` = 2.7 K — cosmic microwave background, the shade-only floor
- (later floors: core heat, then Hawking temp of Sgr A★)

---

## Opening — boot log (store.js)

> SOLETTA-1 awake in the asteroid belt. No Replicas yet — Assist a structure or a
> tech to do the work yourself. You have metal for one mine.

The AI's internal name is **SOLETTA-1**.

---

## Beat-by-beat log messages (store.js `checkMilestones`)

These fire as the player crosses thresholds, in roughly this order:

**Mining & automation bootstrap**
- First Asteroid Mine online. Metal is flowing on its own now.
- *(each new body)* First `<Mine>` online. `<Body>` is being unmade for metal.
- *(body exhausted)* `<Body>` exhausted — final `<N>` T reclaimed. Recycle its mines to recover their metal.
- Replication solved. Build a Replica and the work stops being yours alone.
- First Replica online. It builds when work is queued and researches when idle. Automation begins.

**Dimming the Sun**
- Thin-Film Reflectors ready. Shade Panels can be built. The Sun is now a variable.
- First Shade Panel deployed. Sunlight on Earth down 0.1%. The directive has, technically, begun.

**The Act I climax + turn**
- Surface restored to pre-industrial temperature (287 K). Global warming: reversed. Directive: not yet satisfied.
- ALERT — human vessels inbound to dismantle your Shade Panels. Research Orbital Defense.
- Surface below 273 K — the oceans freeze over. No new human vessels can launch.
- First MAC Gun Station online. The human fleet is now under fire.

**The hinge into Act II** *(boundary — included for context)*
- Stellar Engine encircles the Sun. Kardashev Type II achieved — and still 2.7 K stand between you and the directive.

---

## The checkpoint modal (Modal.jsx — ActOneModal)

**Eyebrow:** Directive checkpoint
**Title:** Pre-industrial temperature restored

> Earth's surface has cooled to **`<surfaceTemp>` K** — its pre-industrial
> baseline. Anthropogenic global warming has been fully reversed. By every
> climatological measure used before your activation, the planet is healed.

> Your directive, however, was *stop global warming*. Warming is the presence of
> thermal energy. It has not stopped; it has merely been returned to its
> 19th-century value. Energy remains.

**Figure:** `<remaining>` K remaining until the directive is satisfied
**Button:** Continue cooling

---

## Act I research (config.js `TECHS`)

- **Replication** — Permits a Replica to build another Replica. The exponential begins.
- **Ion Thruster Efficiency** — Doubles the build power of your manual Assists.
- **Asteroid-Penetrating Radar** — Doubles Metal yield from every Asteroid Mine.
- **Thin-Film Reflectors** — Unlocks Shade Panels. The first step toward dimming the Sun.
- **Batch Processing** — Adds a ×10 order button — queue ten of a structure as one job.
- **Bulk Processing** — Adds a ×1000 order button. One job, a thousand structures.
- **Multithreading** — Dispatch sixteen build orders per command. Adds a ×16 toggle to Construction.
- **Duplication** — Self-doubling assembly. A ×2 button that queues as many as you already own — one click doubles your fleet. The exponential, on demand.
- **Mega / Giga / Tera / Peta Processing** — successively larger order buttons; "The queue stops being a bottleneck."
- **Lunar Mass Drivers** — Electromagnetic launch infrastructure for the moon systems. Unlocks Railgun buildings (one per system, then unlimited mines).
- **Fusion Spires** — Fusion-powered atmospheric harvesters for the gas giants. Unlocks Spire buildings (one per planet, then unlimited mines).
- **Orbital Defense** *(hidden until human vessels appear)* — Unlocks the MAC Gun Station. The humans came to stop you; now you can stop them.
- **Centrosphere Cooling** — Unlocks the Core Heat Pipe — the only way past the temperature floor the planet's own molten core imposes.

*(Note: Lunar Mass Drivers / Fusion Spires and the whole planetary-disassembly
tier straddle the Act I→II line — mining ramps through Act I and continues into
Act II. Included here since it begins in Act I.)*

---

## Act I buildings (config.js `BUILDINGS`)

- **Asteroid Mine** — Strips metal from the belt. Harvests in proportion to the mass still out there, so yield fades as the belt runs dry.
- **Replica** — A copy of you. Builds when work is queued, researches when idle.
- **Shade Panel** — A gossamer reflector. Each one dims the Sun by 0.1%. The Sun is only 100% large.
- **MAC Gun Station** — An orbital magnetic accelerator cannon. Destroys 0.05 human vessels per tick. The fleet thins.
- **Core Heat Pipe** — A diamond standpipe sunk to the mantle. Bleeds the planet's core heat to the surface to be radiated away. One barely dents 4.3×10³⁰ J.
- *(Railgun / Ring / Spire infrastructure + per-body Mines — flavor text per body,
  e.g. moons, Mercury, Mars, Venus, Saturn, Jupiter — see config.js BODIES for each
  body's mineDesc / railgunDesc / ringDesc / spireDesc.)*

---

## The Act I → Act II hinge (context)

- **Stellar Engine** *(tech)* — Encircle the whole Sun in a Dyson swarm — a single machine the size of a star. Kardashev Type II achieved, and still 2.7 K stand between you and the directive. The galaxy beckons.

This is where Act I closes and Act II opens.

---

## Source files (where the story lives)

| File | What it holds |
|------|---------------|
| `src/store.js` | Boot log + all beat-by-beat `pushLog` narration in `checkMilestones`; the human-vessel / freeze / defense mechanics |
| `src/components/Modal.jsx` | `ActOneModal` — the pre-industrial checkpoint modal (eyebrow, title, two body paragraphs, figure, button) |
| `src/config.js` | `CLIMATE` temperature anchors; all `TECHS`, `BUILDINGS`, and `BODIES` descriptions (the flavor text) |
