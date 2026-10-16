"""Attack Retargeting Engine: Continuous non-rigid 2D deformation field + Weapon & FX compositing."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

# 7 frames matching Guan Yu guanyu_08 attack timing
ATTACK_KEYFRAMES = [
    # F0: Anticipation / Wind-up (80ms) - body pulls back slightly, weapon retracted
    {"dur": 80, "lunge": -0.25, "drop": 0.05, "tilt": -0.05, "sleeve_lag": 0.35, "wpn_reach": -0.20, "fx": 0.0},
    # F1: Acceleration forward burst (60ms) - driving forward, knee bends
    {"dur": 60, "lunge": 0.35, "drop": 0.45, "tilt": 0.08, "sleeve_lag": -0.60, "wpn_reach": 0.30, "fx": 0.3},
    # F2: Full lunge thrust (60ms) - explosive reach forward
    {"dur": 60, "lunge": 0.85, "drop": 0.90, "tilt": 0.16, "sleeve_lag": -1.00, "wpn_reach": 0.85, "fx": 0.8},
    # F3: Peak impact penetration (60ms) - maximum extension, shockwave burst
    {"dur": 60, "lunge": 1.00, "drop": 0.80, "tilt": 0.18, "sleeve_lag": -0.80, "wpn_reach": 1.00, "fx": 1.0},
    # F4: Impact vibration & settle (100ms) - holding contact, energy dispersing
    {"dur": 100, "lunge": 0.88, "drop": 0.70, "tilt": 0.12, "sleeve_lag": -0.40, "wpn_reach": 0.92, "fx": 0.5},
    # F5: Retraction pullback (100ms) - pulling weapon back, weight shifting back
    {"dur": 100, "lunge": 0.45, "drop": 0.35, "tilt": 0.04, "sleeve_lag": 0.50, "wpn_reach": 0.40, "fx": 0.0},
    # F6: Recovery return to stance (80ms) - returning to ready baseline
    {"dur": 80, "lunge": 0.08, "drop": 0.10, "tilt": 0.01, "sleeve_lag": 0.15, "wpn_reach": 0.05, "fx": 0.0}
]

def draw_weapon_sprite(w_type: str = 'crescent_blade') -> Image.Image:
    """Crisp high-resolution weapon sprite with distinct silhouette."""
    length = 380
    im = Image.new('RGBA', (length + 80, 120), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    mid_y = 60

    if w_type == 'crescent_blade':
        # Green Dragon Crescent Blade (青龙偃月刀)
        # Deep crimson/ebony wooden shaft with gold rings
        draw.line([(25, mid_y), (length - 65, mid_y)], fill=(65, 18, 18, 255), width=9)
        draw.line([(25, mid_y - 1), (length - 65, mid_y - 1)], fill=(215, 175, 40, 255), width=3)
        # Gold bands along shaft
        for bx in [80, 160, 240]:
            draw.line([(bx, mid_y - 5), (bx, mid_y + 5)], fill=(245, 205, 60, 255), width=3)

        # Golden dragon head collar socket
        hx = length - 65
        gold = (235, 185, 45, 255)
        dragon_socket = [
            (hx - 14, mid_y - 18), (hx + 20, mid_y - 24), (hx + 34, mid_y),
            (hx + 20, mid_y + 24), (hx - 14, mid_y + 18)
        ]
        draw.polygon(dragon_socket, fill=gold)
        draw.ellipse([hx + 10, mid_y - 8, hx + 22, mid_y + 8], fill=(195, 20, 20, 255)) # ruby eye

        # Crescent blade steel body (steel-cyan core with white edge)
        blade_pts = [
            (hx + 26, mid_y - 8),
            (hx + 60, mid_y - 36),
            (hx + 105, mid_y - 45),
            (hx + 138, mid_y - 38),
            (hx + 152, mid_y - 18),
            (hx + 158, mid_y),     # razor tip
            (hx + 130, mid_y + 18),
            (hx + 80, mid_y + 12),
            (hx + 26, mid_y + 6)
        ]
        draw.polygon(blade_pts, fill=(180, 215, 240, 255))
        # Polished silver/white cutting edge
        draw.line([(hx + 60, mid_y - 36), (hx + 105, mid_y - 45), (hx + 138, mid_y - 38), (hx + 158, mid_y)], fill=(255, 255, 255, 255), width=4)
        draw.line([(hx + 26, mid_y), (hx + 120, mid_y)], fill=(235, 185, 45, 255), width=2) # engraved dragon line
        # Red flowing tassel
        draw.polygon([(hx + 5, mid_y + 14), (hx - 16, mid_y + 44), (hx - 4, mid_y + 50), (hx + 14, mid_y + 16)], fill=(225, 20, 40, 250))
    else:
        # Taoist Qi Spear (仙门飞羽破阵枪)
        draw.line([(25, mid_y), (length - 50, mid_y)], fill=(40, 45, 60, 255), width=7)
        draw.line([(25, mid_y - 1), (length - 50, mid_y - 1)], fill=(120, 200, 240, 255), width=2)

        hx = length - 50
        gold = (220, 190, 60, 255)
        draw.polygon([(hx - 10, mid_y - 14), (hx + 15, mid_y - 16), (hx + 24, mid_y), (hx + 15, mid_y + 16), (hx - 10, mid_y + 14)], fill=gold)

        spear_pts = [
            (hx + 20, mid_y - 14),
            (hx + 85, mid_y - 16),
            (hx + 136, mid_y),     # razor tip
            (hx + 85, mid_y + 16),
            (hx + 20, mid_y + 14)
        ]
        draw.polygon(spear_pts, fill=(185, 225, 255, 255))
        draw.line([(hx + 20, mid_y), (hx + 136, mid_y)], fill=(255, 255, 255, 255), width=3)
        # Cyan tassel
        draw.polygon([(hx, mid_y + 12), (hx - 14, mid_y + 36), (hx - 4, mid_y + 40), (hx + 8, mid_y + 14)], fill=(30, 190, 235, 240))

    return im

def draw_piercing_fx(intensity: float, w_type: str = 'crescent_blade') -> Image.Image:
    """Piercing shockwave and directional thrust trail."""
    fx_w, fx_h = 360, 160
    fx = Image.new('RGBA', (fx_w, fx_h), (0, 0, 0, 0))
    if intensity <= 0.05:
        return fx

    draw = ImageDraw.Draw(fx)
    mid_y = fx_h // 2
    alpha = int(255 * min(1.0, intensity))

    core = (255, 255, 255, alpha)
    glow = (255, 215, 50, int(alpha * 0.75)) if w_type == 'crescent_blade' else (80, 220, 255, int(alpha * 0.75))

    # Speed lines
    for dy, length, w in [(-10, 230, 2), (-4, 300, 3), (0, 330, 4), (4, 290, 3), (10, 220, 2)]:
        draw.line([(30, mid_y + dy), (30 + int(length * intensity), mid_y + dy)], fill=glow, width=w)
        draw.line([(90, mid_y + dy), (30 + int(length * intensity), mid_y + dy)], fill=core, width=max(1, w - 1))

    # Conical energy shockwave
    tip_x = 30 + int(310 * intensity)
    cone = [(tip_x, mid_y), (tip_x - 75, mid_y - 40), (tip_x - 50, mid_y), (tip_x - 75, mid_y + 40)]
    draw.polygon(cone, fill=glow)
    draw.polygon([(tip_x, mid_y), (tip_x - 50, mid_y - 20), (tip_x - 30, mid_y), (tip_x - 50, mid_y + 20)], fill=core)

    return fx.filter(ImageFilter.GaussianBlur(radius=1.5))

def generate_smooth_attack_animation(
    master_path: Path,
    out_dir: Path,
    out_gif_path: Path,
    out_sheet_path: Path,
    weapon_type: str = 'crescent_blade'
):
    """Deform single master with a continuous non-rigid displacement field, avoiding any horizontal tears."""
    out_dir.mkdir(parents=True, exist_ok=True)
    src_img = Image.open(master_path).convert('RGBA')
    W, H = src_img.size
    arr = np.array(src_img)

    alpha = arr[:, :, 3]
    y_idx, x_idx = np.where(alpha > 10)
    min_y, max_y = int(y_idx.min()), int(y_idx.max())
    min_x, max_x = int(x_idx.min()), int(x_idx.max())
    cx = (min_x + max_x) // 2
    char_h = max_y - min_y
    char_w = max_x - min_x

    print(f"Master stats: X=[{min_x}, {max_x}] W={char_w}, Y=[{min_y}, {max_y}] H={char_h}, FootY={max_y}")

    weapon_sprite = draw_weapon_sprite(weapon_type)

    frames = []
    durations = []

    # Extra canvas margins for the deep forward lunge and weapon thrust
    pad_left = 60
    pad_right = 320
    pad_top = 40
    pad_bottom = 20

    canvas_w = W + pad_left + pad_right
    canvas_h = H + pad_top + pad_bottom

    for i, kf in enumerate(ATTACK_KEYFRAMES):
        lunge = kf["lunge"]
        drop = kf["drop"]
        tilt = kf["tilt"]
        sleeve_lag = kf["sleeve_lag"]
        wpn_reach = kf["wpn_reach"]
        fx_val = kf["fx"]

        # 1. Generate deformed character body using a CONTINUOUS DISPLACEMENT FIELD
        out_body = np.zeros((H, W, 4), dtype=np.uint8)

        # Precompute coordinate grids
        for y in range(min_y, max_y + 1):
            rel_h = (max_y - y) / char_h # 0.0 at foot sole, 1.0 at top of head

            # Grounding: feet firmly planted at bottom (rel_h < 0.12)
            # Torso crouch: drop increases smoothly with rel_h
            if rel_h < 0.12:
                v_drop = 0.0
            else:
                v_drop = drop * 14.0 * math.sin((rel_h - 0.12) / 0.88 * math.pi)

            src_y = int(round(y - v_drop))
            if not (0 <= src_y < H):
                continue

            # Forward lunge progression: increases continuously with height
            if rel_h < 0.12:
                h_prog = 0.0
            elif rel_h < 0.45:
                p = (rel_h - 0.12) / 0.33
                h_prog = 0.5 * (1 - math.cos(p * math.pi))
            else:
                h_prog = 1.0

            base_dx = lunge * 52.0 * h_prog
            lean_dx = tilt * 60.0 * max(0.0, rel_h - 0.35)

            for x in range(min_x, max_x + 1):
                rel_x = (x - cx) / (char_w / 2)

                # Front foot slide
                if rel_h < 0.15 and rel_x > 0.1:
                    foot_slide = lunge * 20.0 * rel_x * (1.0 - rel_h / 0.15)
                else:
                    foot_slide = 0.0

                # Sleeves dynamic inertial lag
                sleeve_zone = math.exp(-((rel_h - 0.50) ** 2) / 0.03) * max(0.0, abs(rel_x) - 0.25)
                dx_sleeve = sleeve_lag * 22.0 * sleeve_zone

                total_dx = base_dx + lean_dx + foot_slide + dx_sleeve
                src_x = int(round(x - total_dx))

                if 0 <= src_x < W:
                    out_body[y, x] = arr[src_y, src_x]

        body_img = Image.fromarray(out_body, 'RGBA')

        # 2. Composite Character onto padded canvas
        frame = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        origin_x = pad_left
        origin_y = pad_top
        frame.alpha_composite(body_img, (origin_x, origin_y))

        # 3. Composite Weapon Sprite
        # Hand anchor position on 3.5-head chibi body
        base_hand_x = cx + 35
        base_hand_y = min_y + int(char_h * 0.54)

        hand_dx = lunge * 52.0 + tilt * 60.0 * 0.20
        hand_dy = drop * 14.0
        hand_x = origin_x + base_hand_x + int(hand_dx)
        hand_y = origin_y + base_hand_y + int(hand_dy)

        thrust_dist = int(wpn_reach * 165.0)

        # Rotate weapon slightly during anticipation / thrust
        wpn_angle = -10.0 * (1.0 - max(0.0, lunge))
        wpn_rot = weapon_sprite.rotate(-wpn_angle, resample=Image.BICUBIC, expand=True)

        grip_x = 75
        grip_y = wpn_rot.height // 2
        w_px = hand_x - grip_x + thrust_dist
        w_py = hand_y - grip_y

        frame.alpha_composite(wpn_rot, (w_px, w_py))

        # 4. Composite Piercing Energy Shockwave FX
        if fx_val > 0.05:
            fx_img = draw_piercing_fx(fx_val, weapon_type)
            tip_px = w_px + wpn_rot.width - 25
            tip_py = hand_y - fx_img.height // 2
            frame.alpha_composite(fx_img, (tip_px, tip_py))

        frame_path = out_dir / f"attack_{i:02d}.png"
        frame.save(frame_path)
        frames.append(frame)
        durations.append(kf["dur"])

    # 5. Save Animated GIF
    frames[0].save(
        out_gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2
    )
    print(f"[+] Saved Attack GIF: {out_gif_path} ({len(frames)} frames, total dur={sum(durations)}ms)")

    # 6. Save Horizontal Spritesheet
    sheet_w = len(frames) * canvas_w
    sheet_h = canvas_h
    sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
    for idx, f in enumerate(frames):
        sheet.paste(f, (idx * canvas_w, 0), f)
    sheet.save(out_sheet_path)
    print(f"[+] Saved Spritesheet: {out_sheet_path} ({sheet.size})")

    return frames, durations
