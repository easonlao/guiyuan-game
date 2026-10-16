"""Test script to render a genuine 3.5-head Chibi 弓步双手出枪 (Bow Lunge Two-Handed Spear Thrust)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

W, H = 800, 700
canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

# Load master parts
master_p = Path("/home/easonlao/.gemini/antigravity-cli/brain/767ed4ac-a60e-4e94-86c3-c79c5e9dbb39/character_transparent.png")
master = Image.open(master_p).convert("RGBA")

# Extract Head & Neck
head_img = master.crop((235, 55, 535, 375))
# Extract Torso
torso_img = master.crop((285, 375, 485, 575))

# Baseline parameters for deep martial lunge (弓步)
ground_y = 620
hip_x = 320
hip_y = 390  # dropped down into crouch

# 1. Ground Shadow (stretched oblong under both feet)
draw.ellipse([160, ground_y - 15, 520, ground_y + 15], fill=(15, 18, 25, 160))

# 2. Rear Leg (Back foot planted at x=200, straight leg pushing forward)
back_foot_x = 210
back_foot_y = ground_y
# White baggy pants back leg
draw.polygon([
    (hip_x - 30, hip_y + 30),
    (hip_x - 10, hip_y + 30),
    (back_foot_x + 35, back_foot_y - 30),
    (back_foot_x - 15, back_foot_y - 30)
], fill=(235, 235, 238, 255))
# Boot
draw.polygon([
    (back_foot_x - 15, back_foot_y - 30),
    (back_foot_x + 35, back_foot_y - 30),
    (back_foot_x + 40, back_foot_y),
    (back_foot_x - 20, back_foot_y)
], fill=(20, 20, 26, 255))
draw.line([(back_foot_x - 20, back_foot_y), (back_foot_x + 40, back_foot_y)], fill=(215, 175, 40, 255), width=2)

# 3. Front Leg (Front foot stepped forward to x=430, knee deeply bent at x=410, y=510)
front_foot_x = 440
front_foot_y = ground_y
front_knee_x = 425
front_knee_y = 515

# Thigh (hip to bent knee)
draw.polygon([
    (hip_x + 10, hip_y + 25),
    (hip_x + 40, hip_y + 25),
    (front_knee_x + 25, front_knee_y),
    (front_knee_x - 15, front_knee_y)
], fill=(238, 238, 242, 255))
# Shin (bent knee down to foot)
draw.polygon([
    (front_knee_x - 15, front_knee_y),
    (front_knee_x + 25, front_knee_y),
    (front_foot_x + 25, front_foot_y - 30),
    (front_foot_x - 20, front_foot_y - 30)
], fill=(235, 235, 238, 255))
# Front Boot firmly planted
draw.polygon([
    (front_foot_x - 20, front_foot_y - 30),
    (front_foot_x + 25, front_foot_y - 30),
    (front_foot_x + 35, front_foot_y),
    (front_foot_x - 25, front_foot_y)
], fill=(20, 20, 26, 255))
draw.line([(front_foot_x - 25, front_foot_y), (front_foot_x + 35, front_foot_y)], fill=(215, 175, 40, 255), width=2)

# 4. Flowing Lower Robes (split between legs, billowing backward with momentum)
robe_pts = [
    (hip_x - 35, hip_y + 10),
    (hip_x + 35, hip_y + 10),
    (front_knee_x - 5, front_knee_y + 20),
    (hip_x, front_knee_y + 40),
    (back_foot_x + 40, hip_y + 90),
    (back_foot_x + 10, hip_y + 40)
]
draw.polygon(robe_pts, fill=(28, 28, 34, 255))
# Golden wave hem on robe
draw.line([(back_foot_x + 10, hip_y + 40), (back_foot_x + 40, hip_y + 90), (hip_x, front_knee_y + 40)], fill=(215, 175, 40, 255), width=3)

# 5. Torso (leaning forward 14° into the strike)
torso_rot = torso_img.rotate(-14, resample=Image.BICUBIC, expand=True)
torso_x = hip_x - torso_rot.width // 2 + 25
torso_y = hip_y - torso_rot.height + 45
canvas.alpha_composite(torso_rot, (torso_x, torso_y))

# 6. Head & Neck (tracking target, resolute martial expression)
head_rot = head_img.rotate(-8, resample=Image.BICUBIC, expand=True)
head_x = torso_x + torso_rot.width // 2 - head_rot.width // 2 + 25
head_y = torso_y - head_rot.height + 95
canvas.alpha_composite(head_rot, (head_x, head_y))

# 7. Rear Arm (Left hand gripping rear of spear shaft near hip)
rear_shoulder_x = torso_x + 45
rear_shoulder_y = torso_y + 70
rear_hand_x = hip_x + 20
rear_hand_y = hip_y - 20

# Rear sleeve
draw.line([(rear_shoulder_x, rear_shoulder_y), (rear_hand_x, rear_hand_y)], fill=(25, 25, 32, 255), width=24)
draw.line([(rear_shoulder_x, rear_shoulder_y), (rear_hand_x, rear_hand_y)], fill=(215, 175, 40, 255), width=3)
# Rear hand (fist gripping pole)
draw.ellipse([rear_hand_x - 12, rear_hand_y - 12, rear_hand_x + 12, rear_hand_y + 12], fill=(245, 230, 215, 255), outline=(180, 140, 110, 255), width=2)

# 8. Spear Shaft & Weapon passing through rear hand to front hand
spear_start_x = rear_hand_x - 80
spear_start_y = rear_hand_y + 15
spear_tip_x = 740
spear_tip_y = rear_hand_y - 15

# Spear pole
draw.line([(spear_start_x, spear_start_y), (spear_tip_x - 70, spear_tip_y)], fill=(45, 50, 65, 255), width=7)
draw.line([(spear_start_x, spear_start_y - 1), (spear_tip_x - 70, spear_tip_y - 1)], fill=(120, 205, 245, 255), width=2)

# 9. Front Arm (Right arm reaching straight forward, hand firmly gripping shaft)
front_shoulder_x = torso_x + 125
front_shoulder_y = torso_y + 85
front_hand_x = hip_x + 175
front_hand_y = spear_tip_y + 2

# Front extended sleeve (black silk with golden trim)
draw.line([(front_shoulder_x, front_shoulder_y), (front_hand_x - 10, front_hand_y)], fill=(28, 28, 36, 255), width=26)
draw.line([(front_shoulder_x, front_shoulder_y), (front_hand_x - 10, front_hand_y)], fill=(215, 175, 40, 255), width=3)
# Billowing sleeve trail hanging under arm
draw.polygon([
    (front_shoulder_x + 10, front_shoulder_y + 10),
    (front_hand_x - 30, front_hand_y + 10),
    (front_shoulder_x + 30, front_shoulder_y + 75)
], fill=(22, 22, 28, 255))

# Front hand gripping shaft
draw.ellipse([front_hand_x - 14, front_hand_y - 14, front_hand_x + 14, front_hand_y + 14], fill=(248, 232, 218, 255), outline=(180, 140, 110, 255), width=2)
# Fingers wrapping over pole
for fx in [-6, 0, 6]:
    draw.ellipse([front_hand_x + fx - 4, front_hand_y - 12, front_hand_x + fx + 4, front_hand_y - 2], fill=(245, 225, 210, 255))

# 10. Spear Head & Blade Tip
hx = spear_tip_x - 70
hy = spear_tip_y
gold = (235, 195, 50, 255)
draw.polygon([(hx - 12, hy - 14), (hx + 15, hy - 16), (hx + 25, hy), (hx + 15, hy + 16), (hx - 12, hy + 14)], fill=gold)
spear_blade = [
    (hx + 20, hy - 14),
    (hx + 80, hy - 16),
    (spear_tip_x, hy),
    (hx + 80, hy + 16),
    (hx + 20, hy + 14)
]
draw.polygon(spear_blade, fill=(220, 240, 255, 255))
draw.line([(hx + 20, hy), (spear_tip_x, hy)], fill=(255, 255, 255, 255), width=3)
# Cyan tassel
draw.polygon([(hx, hy + 12), (hx - 15, hy + 38), (hx - 5, hy + 42), (hx + 8, hy + 14)], fill=(35, 190, 235, 245))

# 11. Piercing Thrust Shockwave & Speed Streaks
fx_draw = ImageDraw.Draw(canvas)
# Horizontal thrust streaks
for dy_s, l_s, w_s in [(-12, 180, 2), (-4, 250, 3), (0, 280, 4), (4, 240, 3), (12, 170, 2)]:
    canvas_line_start = (spear_tip_x - 120, hy + dy_s)
    canvas_line_end = (spear_tip_x + l_s - 80, hy + dy_s)
    draw.line([canvas_line_start, canvas_line_end], fill=(100, 225, 255, 200), width=w_s)
    draw.line([(spear_tip_x, hy + dy_s), canvas_line_end], fill=(255, 255, 255, 255), width=max(1, w_s - 1))

# Piercing Cone Shockwave
cone = [
    (spear_tip_x + 190, hy),
    (spear_tip_x + 90, hy - 45),
    (spear_tip_x + 120, hy),
    (spear_tip_x + 90, hy + 45)
]
draw.polygon(cone, fill=(80, 215, 255, 180))
draw.polygon([(spear_tip_x + 190, hy), (spear_tip_x + 120, hy - 20), (spear_tip_x + 140, hy), (spear_tip_x + 120, hy + 20)], fill=(255, 255, 255, 230))

out_test = Path("/home/easonlao/.gemini/antigravity-cli/brain/767ed4ac-a60e-4e94-86c3-c79c5e9dbb39/test_real_lunge.png")
canvas.save(out_test)
print("Saved test real lunge:", out_test)
