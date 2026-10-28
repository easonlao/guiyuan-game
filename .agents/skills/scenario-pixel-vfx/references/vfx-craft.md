# Pixel VFX craft notes

How hand-animated pixel effects are built, and how each rule maps to recipe settings.

## Shape before colour

Every effect has one dominant shape that reads at 1x on a phone: a disc, a ring, a crescent, a column, a cone. Decide it first, then add secondary motion (sparks, smoke, debris) that never competes with it. If the effect still reads with every secondary layer hidden, it is built right.

## Timing

- Anticipation (optional, 2 to 4 frames): energy gathers. `particles` with `mode: implode`, a contracting `ring` (`r0` large, `r1` small, `ease: inQuad`).
- Impact (1 to 2 frames): the brightest frames, often a white `flash`. The renderer reports the frame with the biggest jump in coverage as the impact frame; games use it for hit-stop and screen shake.
- Expansion (3 to 6 frames): fast, eased out (`ease: outCubic` or `outQuart`).
- Dissipation (the rest): slower. Shapes break into chunks (`erode` on burst, `breakup` on ring, `dissolve` on puffs) and cool down the ramp (`cool`).
- Frame counts that read well: hits 8 to 10 at 18 fps, slashes 12 at 18 fps, explosions 16 to 20 at 15 fps, loops 8 to 24 at 12 fps.

## Colour

- Ramps run dark to light. The darkest step doubles as the outline colour, so `outline: "outside"` stays in palette.
- Hue-shift: shadows lean toward blue or purple, highlights toward yellow or white. `"hue:<degrees>"` builds such a ramp from any hue.
- Two colours at most per effect, plus smoke. `ramps.main` for the core, `ramps.spark` for particles, `ramps.smoke` for smoke and dust.
- Locking to a project palette (`"palette": "pico8"` or a list of hex colours) remaps every pixel to the nearest palette colour after rendering.

## Readability on a character

- Keep the effect's pixel density equal to the character's. Do not draw a 128 px effect over a 32 px character.
- Hit effects sit on the target's chest (`pivot` at the centre); ground effects (slam, heal, pillar, portal on the floor) put the pivot on the ground line and squash rings with `squash` around 0.3.
- Auras and shields usually draw behind the character's body, with flames rising around the silhouette (`flame` with `hollow` 0.8 to 1).
- A two-frame white silhouette on the target at the impact frame sells a hit better than a bigger explosion.

## Loops

Loops repeat seamlessly when every periodic setting completes whole cycles: `speed` on flame, beam and comet; `spin` on orb and vortex; `turns` on orbiting particles; `twinkle` on rays. Particles in loops are phase-spread automatically, so give them `life` below 1 for gaps.
