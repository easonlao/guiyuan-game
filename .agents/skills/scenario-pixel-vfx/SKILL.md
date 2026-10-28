---
name: scenario-pixel-vfx
description: Use when someone wants pixel-art VFX for a game or a post, such as explosions, sword slashes, spells, portals, beams, auras, hit sparks, heals, level ups, weather or loot, as sprite sheets, GIFs or frames, optionally staged on their own pixel character made or uploaded through Scenario MCP. Turns a plain description into a layered effect recipe, renders it locally with the bundled engine (free, deterministic, no GPU), checks the frames, and iterates.
---

# Pixel VFX from a description

## Overview

A pixel VFX is a short stack of layers (a fireball, a shockwave, sparks, smoke, a one-frame flash) that each write a heat field. The renderer cuts heat into 4 to 7 hard colour bands, which is what makes the result read as hand-made pixel art rather than a blurred glow. You describe the effect as a JSON recipe, render it with `scripts/render.mjs`, look at the output, and adjust. Rendering is local and costs nothing, so iterate freely.

Scenario MCP supplies what the effect lives with: a pixel-art character, enemy or scene at the same pixel density as the effect, generated with a pixel-art model or uploaded from the user's own files. Preview the effect on that art before calling it done.

The same engine runs the Pixel VFX Forge exploration on scenario.com, so recipes move freely between the web tool (Paste JSON) and this skill.

## Quick reference

```bash
node scripts/render.mjs --prompt "huge purple lightning nova" --out vfx      # quick start from words
node scripts/render.mjs --prompt "fire tornado" --describe                    # see how a prompt is read
node scripts/render.mjs effect.recipe.json --out vfx --scale 4 --frames       # render your own recipe
node scripts/render.mjs effect.recipe.json --backdrop hero.png --at 120,150   # preview on a character
node scripts/render.mjs --list                                                # layer types, ramps, palettes
```

`--prompt` reads a fixed vocabulary: the forms printed by `--list`, plus element, size, speed, colour and style words. It stops with an error when it finds no form or element word, so for anything outside that vocabulary write the recipe yourself.

Outputs: `<name>.png` (sprite sheet, one row when it fits), `<name>.json` (atlas with frame rects, fps, loop, impact frame and pivot), `<name>@4x.gif`, optional `frames/` and `<name>-preview@4x.gif`. Existing files are never overwritten without `--force`. Node 18 or newer, no install step.

Recipe skeleton (full reference in [references/recipe.md](references/recipe.md)):

```json
{
  "name": "Frost Nova", "w": 64, "h": 64, "frames": 16, "fps": 15, "loop": false, "seed": 4,
  "ramps": { "main": "ice", "spark": "frost", "smoke": "frost" },
  "outline": "none", "dither": 0, "pivot": [0.5, 0.5],
  "layers": [
    { "type": "rays", "ramp": "$main", "count": 12, "r": 0.9, "t1": 0.6, "gain": 0.7 },
    { "type": "ring", "ramp": "$main", "r0": 0.1, "r1": 0.96, "th": 0.22, "breakup": 0.6 },
    { "type": "particles", "ramp": "$spark", "mode": "burst", "count": 16, "speed": [2, 3.2], "drag": 2.4, "shape": "streak", "size": 2 },
    { "type": "flash", "ramp": "$main", "r": 0.4, "dur": 0.1 }
  ]
}
```

Units: positions and sizes are in half-canvas units (1 reaches the edge of the shorter side; y grows downward). Time: `t0`/`t1` place a layer inside the effect (0 to 1).

| Want | Layers to stack |
| --- | --- |
| Explosion | puffs (smoke, late) + burst + ring + particles burst streak + flash |
| Sword slash | slash (thick) + slash (thin, inner, slightly later) + particles at the arc end |
| Hit spark | ring + star + particles streak + flash, 8 to 10 frames at 18 fps |
| Beam (loop) | beam + orb at the origin + particles burst along the beam, wide canvas such as 128x48 |
| Projectile (loop) | comet + particles trailing behind, 8 frames |
| Aura (loop) | flame with `hollow` + particles rise; draw it behind the character |
| Portal or black hole (loop) | vortex with `core: "dark"` + particles implode |
| Lightning strike | bolt `mode: strike` + ground burst + ring squashed + sparks + flash |
| Ground slam | ring squashed (`squash` 0.3) x2 + cracks + particles chunk with gravity + puffs |
| Heal, level up | ring on the ground + pillar (low gain) + particles rise with `cross`, `chevron` or `star` shapes |
| Weather (loop) | particles `fall`, `rise` or `ambient` across a 128x96 canvas |

## Worked example: a frost nova for the user's own wizard

1. Find a pixel-art model. Call `recommend` with the task, or `search` with `{ "target": "models", "query": "pixel art character", "public": true }`. The Pixel VFX Forge stage art was made with Retro Diffusion Plus, which renders on a real pixel grid; any model that does is a good choice. Read its inputs with `model_schema_get` (look for native width and height, a style option and background removal).
2. Price it first: `model_run` with `dry_run: true`, for example `{ "prompt": "16-bit side-view battle sprite of a frost wizard facing right, full body, limited palette", "width": 96, "height": 96, "numOutputs": 4, "removeBg": true }`. Tell the user the cost, then run it for real and wait with `jobs_wait`.
3. If the user already has a sprite, upload it with `upload_asset` instead and pass it as the model's reference image to make matching art, or use the file as is.
4. `asset_download` the chosen sprite and save it as `wizard.png`. Keep effect and character at the same pixel density: a 96x96 character pairs with a 64x64 effect.
5. Write `frost-nova.recipe.json` (the skeleton above), then render it on the character: `node scripts/render.mjs frost-nova.recipe.json --backdrop wizard.png --at 48,60 --frames`.
6. Open `frost-nova@4x.gif` and `frost-nova-preview@4x.gif` and look at them. Check the first frames (anticipation and flash), the impact frame printed by the script, and the last frames (the effect should break apart, not just shrink). Adjust and render again with `--force`.
7. Hand over the sheet, the atlas JSON and the GIF. In Godot, an AnimatedSprite2D with a SpriteFrames resource sliced on the sheet's grid; in Unity, Sprite Mode Multiple, Filter Mode Point, Compression None, then slice by cell size.

## Common mistakes

- Smooth gradients. Keep ramps to 4 to 7 colours, hue-shifted (cool shadows, warm highlights). Use the named ramps or `"hue:<degrees>"` before inventing lists.
- No timing. A good one-shot has a one or two frame flash, a fast expansion (ease out), then a slower break-up. Put the flash at `t0: 0`, smoke later (`t0` around 0.2), and let `erode` or `dissolve` eat the shapes at the end.
- Everything at full heat. If every layer has `gain` 1 the effect turns into a white blob. Give the core the hot colours and let secondary layers live in the middle of the ramp (`gain` 0.5 to 0.8).
- Wrong size for the stage. Effects much larger than the character look like a different game. Match the character's pixel density; scale by changing `w` and `h`, never by resampling the output.
- Non-integer previews. Scale GIFs and videos only by whole numbers (`--scale 2`, `4`, `8`).
- Loops that pop. For `loop: true`, use `flame`, `beam`, `comet`, `vortex`, `orb`, `tornado`, `bubble` and particles with `life` under 1; keep `speed`, `spin` and `turns` as whole numbers so the last frame meets the first.
- Paying before asking. Every paid Scenario call is priced with `dry_run` and confirmed with the user first. Rendering effects never costs anything.

More craft notes: [references/vfx-craft.md](references/vfx-craft.md).
