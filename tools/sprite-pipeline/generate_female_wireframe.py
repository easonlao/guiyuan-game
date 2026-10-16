"""Generate calibrated 3.5-head chibi wireframe for female cultivator (青衣女仙) with grounded feet and no halo."""
from pathlib import Path
from PIL import Image, ImageDraw

W, H = 768, 1024
BASE_FOOT_Y = 930
CENTER_X = 384

def generate_female_wireframe_calibrated(output_path: Path):
    img = Image.new('RGB', (W, H), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    color = (0, 0, 0)

    def line(x0, y0, x1, y1, width=4):
        draw.line([(int(x0), int(y0)), (int(x1), int(y1))], fill=color, width=width)

    def ellipse(cx, cy, rx, ry, width=4):
        draw.ellipse([(int(cx - rx), int(cy - ry)), (int(cx + rx), int(cy + ry))], outline=color, width=width)

    def arc(cx, cy, rx, ry, start_deg, end_deg, width=4):
        draw.arc([(int(cx - rx), int(cy - ry)), (int(cx + rx), int(cy + ry))], start=start_deg, end=end_deg, fill=color, width=width)

    cx = CENTER_X
    chin_y = 365

    # 1. Head & Face (Calibrated from v6)
    # V-shaped jawline
    line(cx - 80, chin_y - 100, cx - 40, chin_y - 20, width=4)
    line(cx - 40, chin_y - 20, cx, chin_y, width=4)
    line(cx + 80, chin_y - 100, cx + 40, chin_y - 20, width=4)
    line(cx + 40, chin_y - 20, cx, chin_y, width=4)

    # Hair dome
    head_top_y = chin_y - 220
    arc(cx, head_top_y + 70, 92, 72, 180, 360, width=4)

    # Topknot bun and hairpin
    ellipse(cx, head_top_y - 10, 20, 15, width=4)
    line(cx - 30, head_top_y - 10, cx + 30, head_top_y - 10, width=3)

    # Hair bangs & fringe inside face
    line(cx - 80, chin_y - 115, cx - 35, chin_y - 130, width=3)
    line(cx - 35, chin_y - 130, cx, chin_y - 118, width=3)
    line(cx, chin_y - 118, cx + 35, chin_y - 130, width=3)
    line(cx + 35, chin_y - 130, cx + 80, chin_y - 115, width=3)

    # Side locks
    line(cx - 80, chin_y - 100, cx - 72, chin_y + 40, width=3)
    line(cx + 80, chin_y - 100, cx + 72, chin_y + 40, width=3)

    # Eyebrows
    line(cx - 45, chin_y - 110, cx - 18, chin_y - 106, width=3)
    line(cx + 45, chin_y - 110, cx + 18, chin_y - 106, width=3)

    # Eyes
    ellipse(cx - 32, chin_y - 92, 13, 10, width=3)
    ellipse(cx + 32, chin_y - 92, 13, 10, width=3)

    # Nose & Mouth
    line(cx, chin_y - 72, cx, chin_y - 68, width=2)
    line(cx - 10, chin_y - 42, cx + 10, chin_y - 42, width=3)

    # 2. Neck & Shoulders
    line(cx - 16, chin_y, cx - 16, chin_y + 30, width=3)
    line(cx + 16, chin_y, cx + 16, chin_y + 30, width=3)

    neck_bot = chin_y + 30
    shoulder_y = neck_bot + 18
    l_sh = cx - 105
    r_sh = cx + 105
    line(cx - 16, neck_bot, l_sh, shoulder_y, width=4)
    line(cx + 16, neck_bot, r_sh, shoulder_y, width=4)

    # 3. Layered Collar
    chest_y = shoulder_y + 95
    line(cx - 16, neck_bot, cx + 18, chest_y, width=4)
    line(cx + 16, neck_bot, cx - 18, chest_y, width=4)

    # Shoulder mantle plates
    line(l_sh, shoulder_y, l_sh + 10, shoulder_y + 75, width=3)
    line(l_sh + 10, shoulder_y + 75, cx - 35, chest_y, width=3)
    line(r_sh, shoulder_y, r_sh - 10, shoulder_y + 75, width=3)
    line(r_sh - 10, shoulder_y + 75, cx + 35, chest_y, width=3)

    # 4. Waist & Belt (Y: 515..575)
    belt_top = 515
    belt_bot = 575
    line(cx - 64, belt_top, cx + 64, belt_top, width=4)
    line(cx - 64, belt_bot, cx + 64, belt_bot, width=4)
    line(cx - 64, belt_top, cx - 64, belt_bot, width=3)
    line(cx + 64, belt_top, cx + 64, belt_bot, width=3)
    ellipse(cx, (belt_top + belt_bot) // 2, 14, 14, width=3) # jade pendant

    # 5. Tucked Sleeves
    l_elbow_x = l_sh - 30
    l_elbow_y = shoulder_y + 75
    r_elbow_x = r_sh + 30
    r_elbow_y = shoulder_y + 75

    line(l_sh, shoulder_y, l_elbow_x, l_elbow_y, width=4)
    line(r_sh, shoulder_y, r_elbow_x, r_elbow_y, width=4)
    line(l_elbow_x, l_elbow_y, cx - 40, belt_top + 25, width=4)
    line(r_elbow_x, r_elbow_y, cx + 40, belt_top + 25, width=4)

    # Sleeve fall
    line(l_elbow_x, l_elbow_y, l_elbow_x + 12, l_elbow_y + 130, width=4)
    line(l_elbow_x + 12, l_elbow_y + 130, cx - 58, belt_bot - 5, width=4)
    line(r_elbow_x, r_elbow_y, r_elbow_x - 12, r_elbow_y + 130, width=4)
    line(r_elbow_x - 12, r_elbow_y + 130, cx + 58, belt_bot - 5, width=4)

    # 6. Lower Robe (Y: 575..780) - Cleared below 780 for legs!
    hem_y = 780
    line(cx - 64, belt_bot, cx - 85, hem_y, width=4)
    line(cx + 64, belt_bot, cx + 85, hem_y, width=4)
    line(cx - 85, hem_y, cx - 35, hem_y + 10, width=4)
    line(cx + 85, hem_y, cx + 35, hem_y + 10, width=4)

    # Center tabard
    line(cx - 26, belt_bot, cx - 26, hem_y - 15, width=3)
    line(cx + 26, belt_bot, cx + 26, hem_y - 15, width=3)
    line(cx - 26, hem_y - 15, cx + 26, hem_y - 15, width=3)

    # 7. Pants & Boots Grounded at BASE_FOOT_Y (930)
    foot_y = BASE_FOOT_Y
    # Left leg & boot
    line(cx - 48, hem_y, cx - 52, 865, width=4)
    line(cx - 22, hem_y, cx - 26, 865, width=4)
    line(cx - 52, 865, cx - 74, foot_y, width=4)
    line(cx - 26, 865, cx - 20, foot_y, width=4)
    line(cx - 74, foot_y, cx - 20, foot_y, width=4)

    # Right leg & boot
    line(cx + 22, hem_y, cx + 26, 865, width=4)
    line(cx + 48, hem_y, cx + 52, 865, width=4)
    line(cx + 26, 865, cx + 20, foot_y, width=4)
    line(cx + 52, 865, cx + 74, foot_y, width=4)
    line(cx + 20, foot_y, cx + 74, foot_y, width=4)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format='PNG')
    print(f"Generated calibrated female wireframe: {output_path}")
    return output_path

if __name__ == '__main__':
    generate_female_wireframe_calibrated(Path('/tmp/wireframe_female_v2.png'))
