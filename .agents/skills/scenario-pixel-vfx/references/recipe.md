# Recipe reference

A recipe is JSON. Unknown fields are ignored, so you can keep notes in it.

## Recipe fields

| Field | Default | Meaning |
| --- | --- | --- |
| `name` | `"Untitled effect"` | Display and file name |
| `w`, `h` | 64, 64 | Canvas size in pixels (8 to 512). Size and position units scale with the shorter side. |
| `frames` | 16 | Frame count (1 to 120) |
| `fps` | 15 | Playback speed (1 to 60) |
| `loop` | false | Seamless loop. One-shots run time 0 to 1 over the frames; loops wrap. |
| `seed` | 1 | Changes every random choice. Same recipe and seed give identical frames. |
| `ramps` | main fire, alt fire, smoke smoke, spark white | Colour ramps that layers reference as `$main`, `$alt`, `$smoke`, `$spark` |
| `hue`, `sat` | 0, 1 | Rotate every ramp's hue in degrees; scale saturation |
| `outline` | `"none"` | `"outside"`, `"outside8"` (with diagonals) or `"inside"`; uses each layer's darkest colour |
| `outlineColor` | null | Fixed outline colour such as `"#1a1020"` |
| `dither` | 0 | 0 to 1. Ordered dithering on band edges and the alpha cut. |
| `palette` | null | Lock to `"pico8"`, `"sweetie16"`, `"endesga32"`, `"gameboy"`, `"onebit"` or a list of hex colours |
| `cleanup` | true | Removes isolated pixels and one-pixel holes from shape layers (particles are kept) |
| `pivot` | [0.5, 0.5] | Canvas point (0 to 1) that sits on the anchor when placed in a scene |
| `impact` | auto | Force the impact frame, as a 0 to 1 time |

A ramp is a name (`fire`, `lava`, `ice`, `frost`, `lightning`, `thunder`, `poison`, `holy`, `dark`, `void`, `arcane`, `nature`, `water`, `blood`, `earth`, `smoke`, `dust`, `ash`, `wind`, `plasma`, `energy`, `gold`, `solar`, `shadow`, `steel`, `white`, `rainbow`), `"hue:<degrees>"`, or a list of hex colours from dark to light.

## Fields every layer accepts

| Field | Default | Meaning |
| --- | --- | --- |
| `type` | required | One of the types below |
| `ramp` | `"$main"` | Ramp name, `$main`/`$alt`/`$smoke`/`$spark`, hue or hex list |
| `t0`, `t1` | 0, 1 | When the layer plays, as a fraction of the effect |
| `x`, `y` | 0, 0 | Anchor, in half-canvas units from the centre (y down) |
| `angle` | 0 | Rotation in degrees (shape layers) |
| `squash` | 1 | Vertical scale. 0.3 to 0.45 lays a ring or circle flat on the ground. |
| `gain` | about 1 | Heat multiplier. Lower values use the darker half of the ramp. |
| `cut` | 0.1 | Heat below this is transparent |
| `gamma` | 1 | Heat curve |
| `dither` | recipe value | Per-layer dither |
| `glow` | 0 | 1 to 3 pixels of stepped halo |
| `blend` | `"over"` | `"under"` paints only where nothing is drawn yet |
| `hidden` | false | Skip the layer |
| `seed` | 0 | Offset this layer's randomness |

## Layer types

Defaults in brackets.

- `burst`: expanding fireball that cools and erodes into chunks. `r0` [0.08], `r1` [0.8], `grow` [0.5] (share of time to reach `r1`), `rough` [0.55], `freq` [2.4], `evolve` [1.6], `cool` [0.6], `erode` [1], `erodeStart` [0.3], `wobble` [0.3] (silhouette lumps), `hollow` [0], `ease` [outCubic].
- `ring`: shockwave. `r0` [0.1], `r1` [0.95], `th` [0.2] thickness, `thEnd` [0.03], `breakup` [0.7], `freq` [3], `fade` [0.35], `inner` [0] faint fill, `ease` [outQuart].
- `flame`: rising flame anchored at its base; loops. `w` [0.42], `hgt` [1.2], `taper` [1.1], `freq` [2.6], `rough` [0.75], `speed` [1] whole cycles, `flick` [0.35] sway, `hollow` [0] (0.8 to 1 for a body aura).
- `beam`: horizontal beam from the anchor (rotate with `angle`). `len` [1.8], `th` [0.16], `cap` [0.26] origin flare, `wob` [0.5], `speed` [2], `grow` [0.15] (one-shots).
- `slash`: crescent sword arc. `r` [0.72], `th` [0.2], `a0` [-160] and `a1` [40] start and end angles in degrees (direction from their order), `sweep` [0.3] share of time for the swing, `trail` [0.9], `erode` [0.6].
- `orb`: energy ball with a swirling core; loops. `r` [0.32], `pulse` [0.08], `pulseRate` [2], `spin` [1], `freq` [2.8], `rim` [0.35].
- `comet`: projectile head and streaming tail pointing along `angle`. `r` [0.2], `len` [1.1], `speed` [2], `rough` [0.6]. Add `from: [x, y]` and `until` [0.45] to fly from `from` to the anchor.
- `vortex`: spiral disc; loops. `r` [0.85], `rIn` [0.18], `arms` [3], `twist` [2.2], `spin` [1], `dir` [1], `core` (`"dark"` for a void centre).
- `pillar`: column rising from a ground anchor. `w` [0.28], `hgt` [1.8], `speed` [2], `rough` [0.5], `grow` [0.18].
- `rays`: radial light rays. `count` [10], `r` [0.9], `width` [0.2], `jitter` [0.45], `inner` [0.08], `spin`, `twinkle` [1].
- `glyph`: magic circle drawn on, then spinning. `r` [0.8], `rings` [[1, 0.84, 0.5]], `star` [5] points (0 for none), `step` [2], `ticks` [24], `runes` [8], `draw` [0.35], `spin` [1], `fill` [0].
- `puffs`: smoke, dust, gas, or a breath cone. `count` [7], `spread` [0.4], `flat` [0.6], `rise` [0.5], `r0` [0.12], `r1` [0.3], `life` [[0.55, 1]], `emit` [0.25], `dir` [-90], `cone` [0], `speed` [[0, 0]], `drift` [0.3], `dissolve` [1], `decay` [0.5], `freq` [3.2].
- `particles`: `mode` (`burst`, `spray`, `rise`, `fall`, `ambient`, `orbit`, `implode`), `count` [16], `speed` [[0.8, 1.6]], `life` [[0.5, 1]], `emit` [0] spawn window, `dir` [0] and `spread` [360] in degrees, `area` [0.05] spawn radius (`areaX`, `areaY` stretch it), `gravity` [0], `drag` [1.5], `ground` (y where particles stop), `shape` (`dot`, `square`, `plus`, `cross`, `star`, `diamond`, `ring`, `bubble`, `streak`, `drop`, `shard`, `leaf`, `petal`, `chevron`, `coin`, `chunk`, `circle`), `size` [[1, 1]] start and end in pixels, `heat` [[1, 0.35]] start and end, `twinkle`, `wiggle`, `orbitR`, `turns`, `implodeR`, `swirl`, `fadeIn`, `driftX`, `fallScale`, `spanX`, `spanY`.
- `bolt`: lightning, regenerated every `hold` [2] frames. `mode` (`radial` from the anchor, `strike` from the top edge down to the anchor, `line` from `x0,y0` to `x1,y1`), `count` [4], `len` [0.9], `jag` [0.35], `depth` [5], `branch` [0.3], `thick` [1], `flicker` [0], `fadeStart` [0.5].
- `cracks`: ground cracks from the anchor. `count` [6], `len` [0.9], `squash` [0.4], `grow` [0.2], `fadeStart` [0.55].
- `spikes`: faceted crystal or rock spikes erupting from a ground anchor. `count` [5], `spread` [0.75], `hgt` [[0.55, 1]], `width` [[0.1, 0.17]], `lean` [12], `fan` [14], `grow` [0.22], `hold` [0.55] (when they start to shatter).
- `star`: anime impact star that pops and hollows out. `points` [8], `r` [0.75], `inner` [0.22], `sharp` [1.6], `jitter` [0.45], `pop` [0.22], `hollow` [0.9].
- `streaks`: `mode` `claw` (`count` [3], `angle` [55], `len` [1.4], `gap` [0.22], `curve` [0.18], `th` [2] pixels, `stagger` [0.04]), `speed` (horizontal speed lines: `count`, `len`, `spanY`, `speed`, `angle` [180]) or `flow` (wind arcs: `count`, `r`, `squash`, `turns`, `dir`).
- `bubble`: shield dome with hex cells and a travelling highlight; loops. `r` [0.8], `th` [0.07], `hex` [0.4], `cell` [0.17], `fill` [0.16], `shimmer` [1].
- `flash`: white-hot disc for the first frames. `r` [0.6], `dur` [0.12].
- `text`: 3x5 pixel-font text that pops and floats (damage numbers, CRIT!, LEVEL UP). `text`, `scale` [1], `rise` [0.35], `pop` [true], `fadeStart` [0.7].
- `tornado`: funnel with wrapped bands; loops. `w0` [0.12], `w1` [0.6], `hgt` [1.8], `twist` [3], `spin` [2], `sway` [0.08], `rough` [0.5].

Layers paint in order, so put smoke first and flashes last. Positions outside the canvas are fine; anything off-canvas is clipped.
