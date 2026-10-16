"""Skeletal 2D Attack Engine: Articulated limbs, true martial bow lunge, two-handed spear thrust."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

# 7 frames matching Guan Yu guanyu_08 attack timing (total 540ms)
SKELETAL_ATTACK_KEYFRAMES = [
    # F0: 蓄力引枪 (Wind-up / Coiling) - 80ms
    # Weight back, torso leaned back -6°, spear pulled back behind hip
    {
        "dur": 80,
        "hip_dx": -30, "hip_dy": -5, "torso_rot": -6.0, "head_rot": -4.0,
        "back_leg_angle": -15.0, "front_leg_angle": 10.0, "lunge_span": 180,
        "spear_angle": -18.0, "spear_ext": -80, "spear_y": 20,
        "fx": 0.0
    },
    # F1: 顺势起步 (Drive / Stepping in) - 60ms
    # Front foot steps forward, knees bend, spear leveling out
    {
        "dur": 60,
        "hip_dx": 15, "hip_dy": 15, "torso_rot": 4.0, "head_rot": 2.0,
        "back_leg_angle": -25.0, "front_leg_angle": 25.0, "lunge_span": 240,
        "spear_angle": -6.0, "spear_ext": 20, "spear_y": 10,
        "fx": 0.2
    },
    # F2: 弓步大疾刺 (Full Lunge Launch) - 60ms
    # Deep bow lunge! Front knee bent 90°, back leg stretched, spear driving forward
    {
        "dur": 60,
        "hip_dx": 65, "hip_dy": 35, "torso_rot": 15.0, "head_rot": 10.0,
        "back_leg_angle": -45.0, "front_leg_angle": 45.0, "lunge_span": 320,
        "spear_angle": 0.0, "spear_ext": 170, "spear_y": 0,
        "fx": 0.8
    },
    # F3: 极值贯穿破空 (Peak Penetration Reach) - 60ms
    # Maximum reach! Body fully locked into driving diagonal, massive shockwave at tip!
    {
        "dur": 60,
        "hip_dx": 85, "hip_dy": 32, "torso_rot": 18.0, "head_rot": 12.0,
        "back_leg_angle": -50.0, "front_leg_angle": 48.0, "lunge_span": 350,
        "spear_angle": 0.0, "spear_ext": 240, "spear_y": -5,
        "fx": 1.0
    },
    # F4: 震颤受力 (Impact Hold & Settle) - 100ms
    # Absorbing recoil, holding impact extension
    {
        "dur": 100,
        "hip_dx": 75, "hip_dy": 30, "torso_rot": 14.0, "head_rot": 9.0,
        "back_leg_angle": -48.0, "front_leg_angle": 44.0, "lunge_span": 335,
        "spear_angle": 0.0, "spear_ext": 220, "spear_y": -2,
        "fx": 0.6
    },
    # F5: 抽枪收势 (Retraction Pullback) - 100ms
    # Pushing back off front foot, arms pulling spear back
    {
        "dur": 100,
        "hip_dx": 35, "hip_dy": 15, "torso_rot": 6.0, "head_rot": 4.0,
        "back_leg_angle": -30.0, "front_leg_angle": 25.0, "lunge_span": 260,
        "spear_angle": -8.0, "spear_ext": 90, "spear_y": 8,
        "fx": 0.0
    },
    # F6: 归架稳立 (Recovery / Ready Guard) - 80ms
    # Feet returning to ready stance, balanced center
    {
        "dur": 80,
        "hip_dx": 5, "hip_dy": 2, "torso_rot": 0.0, "head_rot": 0.0,
        "back_leg_angle": -15.0, "front_leg_angle": 15.0, "lunge_span": 200,
        "spear_angle": -12.0, "spear_ext": 10, "spear_y": 15,
        "fx": 0.0
    }
]

def draw_limb_segment(draw: ImageDraw.ImageDraw, p0, p1, width: int, main_color, border_color=None, gold_trim=False):
    """Draw a smooth shaded limb segment (arm or leg) with optional gold embroidery."""
    x0, y0 = p0
    x1, y1 = p1
    draw.line([(x0, y0), (x1, y1)], fill=main_color, width=width)
    if border_color:
        draw.line([(x0, y0), (x1, y1)], fill=border_color, width=max(1, width // 6))
    if gold_trim:
        # Draw gold wave filigree along edge
        dx = x1 - x0
        dy = y1 - y0
        dist = math.hypot(dx, dy)
        if dist > 1:
            nx = -dy / dist * (width // 2 - 2)
            ny = dx / dist * (width // 2 - 2)
            draw.line([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny)], fill=(225, 185, 45, 255), width=3)

def solve_2bone_ik(p_start, p_end, len1, len2, bend_positive=True):
    """Analytic 2-bone IK solver for elbows and knees."""
    x0, y0 = p_start
    x1, y1 = p_end
    dx = x1 - x0
    dy = y1 - y0
    dist = math.hypot(dx, dy)
    dist = max(1e-4, min(dist, (len1 + len2) * 0.999))

    # Law of cosines
    cos_angle1 = (len1**2 + dist**2 - len2**2) / (2 * len1 * dist)
    cos_angle1 = max(-1.0, min(1.0, cos_angle1))
    angle1 = math.acos(cos_angle1)

    base_angle = math.atan2(dy, dx)
    joint_angle = base_angle + (angle1 if bend_positive else -angle1)

    jx = x0 + len1 * math.cos(joint_angle)
    jy = y0 + len1 * math.sin(joint_angle)
    return (jx, jy)

def render_true_attack_frame(
    master_img: Image.Image,
    kf: dict,
    canvas_size=(1000, 800),
    weapon_type='spear',
    is_guanyu=False
) -> Image.Image:
    """Render a single frame of the character with real articulated 2D skeletal lunge and thrust."""
    W, H = canvas_size
    frame = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)

    # Palette
    if not is_guanyu:
        robe_dark = (26, 26, 32, 255)
        robe_light = (242, 242, 245, 255)
        gold = (225, 185, 45, 255)
        boot_dark = (20, 20, 25, 255)
        skin = (250, 235, 220, 255)
        skin_border = (185, 145, 115, 255)
    else:
        robe_dark = (28, 92, 48, 255)
        robe_light = (240, 242, 245, 255)
        gold = (235, 195, 45, 255)
        boot_dark = (20, 20, 25, 255)
        skin = (235, 160, 140, 255) # Guan Yu red face tone
        skin_border = (165, 90, 75, 255)

    # Base coordinates
    ground_y = H - 120
    base_hip_x = 360 + kf['hip_dx']
    base_hip_y = ground_y - 230 + kf['hip_dy']

    lunge_span = kf['lunge_span']
    back_foot_x = base_hip_x - int(lunge_span * 0.48)
    front_foot_x = base_hip_x + int(lunge_span * 0.52)

    # 1. Ground Shadow (dynamic stretching with lunge span)
    shadow_w = lunge_span + 140
    shadow_h = 32
    draw.ellipse([
        base_hip_x - shadow_w // 2, ground_y - shadow_h // 2,
        base_hip_x + shadow_w // 2, ground_y + shadow_h // 2
    ], fill=(12, 15, 22, 170))

    # 2. Rear Leg (Left Leg): Hip -> Knee -> Ankle (Back foot planted firmly)
    rear_hip = (base_hip_x - 30, base_hip_y + 35)
    rear_ankle = (back_foot_x, ground_y - 12)
    rear_knee = solve_2bone_ik(rear_hip, rear_ankle, 110, 110, bend_positive=False)

    # Draw rear thigh and shin (white silk pants)
    draw_limb_segment(draw, rear_hip, rear_knee, width=42, main_color=robe_light, border_color=(200, 200, 210, 255))
    draw_limb_segment(draw, rear_knee, rear_ankle, width=36, main_color=robe_light, border_color=(200, 200, 210, 255))
    # Rear Boot
    draw.polygon([
        (rear_ankle[0] - 22, rear_ankle[1] - 20),
        (rear_ankle[0] + 28, rear_ankle[1] - 20),
        (rear_ankle[0] + 35, rear_ankle[1] + 12),
        (rear_ankle[0] - 26, rear_ankle[1] + 12)
    ], fill=boot_dark)
    draw.line([(rear_ankle[0] - 26, rear_ankle[1] + 12), (rear_ankle[0] + 35, rear_ankle[1] + 12)], fill=gold, width=3)

    # 3. Flowing Lower Robes (split athletic combat skirt)
    robe_pts = [
        (base_hip_x - 45, base_hip_y + 10),
        (base_hip_x + 45, base_hip_y + 10),
        (front_foot_x - 30, base_hip_y + 110),
        (base_hip_x, base_hip_y + 140),
        (back_foot_x + 40, base_hip_y + 100),
        (back_foot_x + 10, base_hip_y + 40)
    ]
    draw.polygon(robe_pts, fill=robe_dark)
    draw.line([(back_foot_x + 10, base_hip_y + 40), (back_foot_x + 40, base_hip_y + 100), (base_hip_x, base_hip_y + 140)], fill=gold, width=3)

    # 4. Front Leg (Right Leg): Hip -> Knee -> Ankle (Deep athletic bend)
    front_hip = (base_hip_x + 25, base_hip_y + 35)
    front_ankle = (front_foot_x, ground_y - 12)
    front_knee = solve_2bone_ik(front_hip, front_ankle, 110, 110, bend_positive=True)

    draw_limb_segment(draw, front_hip, front_knee, width=44, main_color=robe_light, border_color=(200, 200, 210, 255))
    draw_limb_segment(draw, front_knee, front_ankle, width=38, main_color=robe_light, border_color=(200, 200, 210, 255))
    # Front Boot
    draw.polygon([
        (front_ankle[0] - 26, front_ankle[1] - 20),
        (front_ankle[0] + 28, front_ankle[1] - 20),
        (front_ankle[0] + 40, front_ankle[1] + 12),
        (front_ankle[0] - 30, front_ankle[1] + 12)
    ], fill=boot_dark)
    draw.line([(front_ankle[0] - 30, front_ankle[1] + 12), (front_ankle[0] + 40, front_ankle[1] + 12)], fill=gold, width=3)

    # 5. Extract & Rotate Torso
    if not is_guanyu:
        torso_crop = master_img.crop((280, 365, 488, 580))
    else:
        torso_crop = master_img.crop((260, 350, 508, 580))

    t_rot = kf['torso_rot']
    torso_img = torso_crop.rotate(-t_rot, resample=Image.BICUBIC, expand=True)
    tx = int(base_hip_x - torso_img.width // 2 + t_rot * 1.5)
    ty = int(base_hip_y - torso_img.height + 40)
    frame.alpha_composite(torso_img, (tx, ty))

    # 6. Extract & Rotate Head
    if not is_guanyu:
        head_crop = master_img.crop((225, 55, 545, 375))
    else:
        head_crop = master_img.crop((235, 43, 535, 365))

    h_rot = kf['head_rot']
    head_img = head_crop.rotate(-h_rot, resample=Image.BICUBIC, expand=True)
    hx = int(tx + torso_img.width // 2 - head_img.width // 2 + h_rot * 2.5 + 10)
    hy = int(ty - head_img.height + 85)
    frame.alpha_composite(head_img, (hx, hy))

    # 7. Shoulder Joint Anchors on Rotated Torso
    # Angle in radians
    rad_t = math.radians(t_rot)
    sh_y_offset = 65
    rear_sh = (base_hip_x - 55 * math.cos(rad_t) + sh_y_offset * math.sin(rad_t),
               ty + 55)
    front_sh = (base_hip_x + 55 * math.cos(rad_t) + sh_y_offset * math.sin(rad_t),
                ty + 75)

    # 8. Spear Trajectory Line
    spear_ext = kf['spear_ext']
    spear_angle = kf['spear_angle']
    rad_sp = math.radians(spear_angle)

    # Front hand is the primary guide along the spear
    # Hand 1 (Rear Hand) near rear hip/waist
    hand_rear_x = base_hip_x - 30 + int(spear_ext * 0.40)
    hand_rear_y = base_hip_y - 25 + kf['spear_y']

    # Hand 2 (Front Hand) extending forward along thrust vector
    front_reach = 145 + int(spear_ext * 0.65)
    hand_front_x = base_hip_x + front_reach * math.cos(rad_sp)
    hand_front_y = hand_rear_y + front_reach * math.sin(rad_sp) - 10

    # Spear endpoints
    shaft_len = 460
    spear_butt_x = hand_rear_x - 120 * math.cos(rad_sp)
    spear_butt_y = hand_rear_y - 120 * math.sin(rad_sp)
    spear_tip_x = spear_butt_x + shaft_len * math.cos(rad_sp)
    spear_tip_y = spear_butt_y + shaft_len * math.sin(rad_sp)

    # 9. Solve IK for Rear Arm (Rear Shoulder -> Rear Elbow -> Hand Rear)
    rear_elbow = solve_2bone_ik(rear_sh, (hand_rear_x, hand_rear_y), 75, 75, bend_positive=False)
    draw_limb_segment(draw, rear_sh, rear_elbow, width=32, main_color=robe_dark, border_color=(15, 15, 20, 255), gold_trim=True)
    draw_limb_segment(draw, rear_elbow, (hand_rear_x, hand_rear_y), width=28, main_color=robe_dark, border_color=(15, 15, 20, 255), gold_trim=True)
    # Rear Hand gripping pole
    draw.ellipse([hand_rear_x - 14, hand_rear_y - 14, hand_rear_x + 14, hand_rear_y + 14], fill=skin, outline=skin_border, width=2)

    # 10. Draw Spear Shaft Passing through Rear Hand
    shaft_color = (45, 50, 65, 255) if weapon_type == 'spear' else (70, 20, 20, 255)
    inlay_color = (120, 205, 245, 255) if weapon_type == 'spear' else (225, 185, 45, 255)
    draw.line([(spear_butt_x, spear_butt_y), (spear_tip_x - 70, spear_tip_y)], fill=shaft_color, width=8)
    draw.line([(spear_butt_x, spear_butt_y - 1), (spear_tip_x - 70, spear_tip_y - 1)], fill=inlay_color, width=2)

    # 11. Solve IK for Front Arm (Front Shoulder -> Front Elbow -> Hand Front)
    front_elbow = solve_2bone_ik(front_sh, (hand_front_x, hand_front_y), 85, 85, bend_positive=True)
    # Billowing sleeve underneath
    draw.polygon([
        (front_sh[0], front_sh[1]),
        (front_elbow[0], front_elbow[1]),
        (front_elbow[0] - 35, front_elbow[1] + 90),
        (front_sh[0] - 25, front_sh[1] + 70)
    ], fill=(20, 20, 26, 255) if not is_guanyu else (22, 75, 38, 255))

    draw_limb_segment(draw, front_sh, front_elbow, width=34, main_color=robe_dark, border_color=(15, 15, 20, 255), gold_trim=True)
    draw_limb_segment(draw, front_elbow, (hand_front_x, hand_front_y), width=30, main_color=robe_dark, border_color=(15, 15, 20, 255), gold_trim=True)

    # Front Hand gripping pole firmly with wrapped fingers
    draw.ellipse([hand_front_x - 15, hand_front_y - 15, hand_front_x + 15, hand_front_y + 15], fill=skin, outline=skin_border, width=2)
    for fx_off in [-7, 0, 7]:
        draw.ellipse([hand_front_x + fx_off - 5, hand_front_y - 14, hand_front_x + fx_off + 5, hand_front_y - 2], fill=skin, outline=skin_border, width=1)

    # 12. Draw Weapon Blade Head (Spear Point or Green Dragon Crescent)
    hx = spear_tip_x - 70
    hy = spear_tip_y

    if weapon_type == 'spear':
        # Taoist Qi Spear Razor Blade
        gold_collar = (235, 195, 50, 255)
        draw.polygon([(hx - 12, hy - 14), (hx + 15, hy - 16), (hx + 25, hy), (hx + 15, hy + 16), (hx - 12, hy + 14)], fill=gold_collar)
        spear_blade = [
            (hx + 20, hy - 14),
            (hx + 85, hy - 16),
            (spear_tip_x, hy),
            (hx + 85, hy + 16),
            (hx + 20, hy + 14)
        ]
        draw.polygon(spear_blade, fill=(225, 245, 255, 255))
        draw.line([(hx + 20, hy), (spear_tip_x, hy)], fill=(255, 255, 255, 255), width=3)
        # Cyan tassel fluttering back
        draw.polygon([(hx, hy + 12), (hx - 18, hy + 42), (hx - 6, hy + 46), (hx + 8, hy + 14)], fill=(35, 190, 235, 250))
    else:
        # Green Dragon Crescent Blade
        gold_dragon = (235, 185, 45, 255)
        draw.polygon([(hx - 14, hy - 18), (hx + 20, hy - 24), (hx + 34, hy), (hx + 20, hy + 24), (hx - 14, hy + 18)], fill=gold_dragon)
        draw.ellipse([hx + 10, hy - 8, hx + 22, hy + 8], fill=(195, 20, 20, 255))
        blade_pts = [
            (hx + 26, hy - 8),
            (hx + 65, hy - 38),
            (hx + 115, hy - 48),
            (hx + 152, hy - 40),
            (hx + 168, hy - 18),
            (spear_tip_x + 30, hy),
            (hx + 145, hy + 20),
            (hx + 85, hy + 14),
            (hx + 26, hy + 6)
        ]
        draw.polygon(blade_pts, fill=(185, 220, 245, 255))
        draw.line([(hx + 65, hy - 38), (hx + 115, hy - 48), (hx + 152, hy - 40), (spear_tip_x + 30, hy)], fill=(255, 255, 255, 255), width=4)
        draw.line([(hx + 26, hy), (hx + 130, hy)], fill=(235, 185, 45, 255), width=2)
        draw.polygon([(hx + 5, hy + 14), (hx - 18, hy + 46), (hx - 4, hy + 52), (hx + 14, hy + 16)], fill=(225, 20, 40, 250))

    # 13. Directional Thrust Speed Lines & Piercing Shockwave
    fx_val = kf['fx']
    if fx_val > 0.05:
        alpha = int(255 * fx_val)
        glow_c = (80, 220, 255, int(alpha * 0.75)) if weapon_type == 'spear' else (255, 215, 50, int(alpha * 0.75))
        core_c = (255, 255, 255, alpha)

        # Speed lines
        for dy_s, l_s, w_s in [(-12, 220, 2), (-4, 310, 3), (0, 350, 4), (4, 300, 3), (12, 210, 2)]:
            p_s = (spear_tip_x - 140, hy + dy_s)
            p_e = (spear_tip_x + int(l_s * fx_val), hy + dy_s)
            draw.line([p_s, p_e], fill=glow_c, width=w_s)
            draw.line([(spear_tip_x - 40, hy + dy_s), p_e], fill=core_c, width=max(1, w_s - 1))

        # Conical shockwave
        cone_tip_x = spear_tip_x + int(240 * fx_val)
        cone = [
            (cone_tip_x, hy),
            (cone_tip_x - 90, hy - 50),
            (cone_tip_x - 60, hy),
            (cone_tip_x - 90, hy + 50)
        ]
        draw.polygon(cone, fill=glow_c)
        draw.polygon([(cone_tip_x, hy), (cone_tip_x - 55, hy - 25), (cone_tip_x - 35, hy), (cone_tip_x - 55, hy + 25)], fill=core_c)

    return frame

def generate_full_rigged_sequence(master_path: Path, out_dir: Path, out_gif_path: Path, weapon_type='spear', is_guanyu=False):
    out_dir.mkdir(parents=True, exist_ok=True)
    master_img = Image.open(master_path).convert('RGBA')

    frames = []
    durations = []

    for i, kf in enumerate(SKELETAL_ATTACK_KEYFRAMES):
        f = render_true_attack_frame(master_img, kf, canvas_size=(1024, 768), weapon_type=weapon_type, is_guanyu=is_guanyu)
        f_p = out_dir / f"attack_{i:02d}.png"
        f.save(f_p)
        frames.append(f)
        durations.append(kf['dur'])
        print(f"Rendered Rigged Frame {i:02d} ({kf['dur']}ms): hip_dx={kf['hip_dx']}, spear_ext={kf['spear_ext']}, lunge_span={kf['lunge_span']}")

    # Save animated GIF
    frames[0].save(
        out_gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2
    )
    print(f"[+] Saved True Rigged Attack GIF: {out_gif_path}")
    return frames, durations
