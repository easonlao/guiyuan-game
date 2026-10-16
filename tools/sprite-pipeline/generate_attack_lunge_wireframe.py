"""Generate calibrated 3.5-head Chibi martial lunge attack wireframe and run SDXL ControlNet."""
from pathlib import Path
from PIL import Image, ImageDraw
import requests, json, time, urllib.request

W, H = 768, 1024
BASE_FOOT_Y = 930
CENTER_X = 384

def draw_lunge_wireframe(output_path: Path):
    img = Image.new('RGB', (W, H), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    color = (0, 0, 0)

    def line(x0, y0, x1, y1, width=4):
        draw.line([(int(x0), int(y0)), (int(x1), int(y1))], fill=color, width=width)

    def ellipse(cx, cy, rx, ry, width=4):
        draw.ellipse([(int(cx - rx), int(cy - ry)), (int(cx + rx), int(cy + ry))], outline=color, width=width)

    def arc(cx, cy, rx, ry, start_deg, end_deg, width=4):
        draw.arc([(int(cx - rx), int(cy - ry)), (int(cx + rx), int(cy + ry))], start=start_deg, end=end_deg, fill=color, width=width)

    # In attack lunge, center of mass moves forward (cx = 340 -> 390) and drops slightly (chin_y = 390)
    cx = 330
    chin_y = 385
    head_top_y = chin_y - 220

    # 1. Head & Face (tilted forward 8° in martial concentration)
    # V-shaped jawline
    line(cx - 80, chin_y - 100, cx - 40, chin_y - 20, width=4)
    line(cx - 40, chin_y - 20, cx, chin_y, width=4)
    line(cx + 80, chin_y - 100, cx + 40, chin_y - 20, width=4)
    line(cx + 40, chin_y - 20, cx, chin_y, width=4)

    # Hair dome & topknot bun
    arc(cx, head_top_y + 70, 92, 72, 180, 360, width=4)
    ellipse(cx, head_top_y - 10, 20, 15, width=4)
    line(cx - 30, head_top_y - 10, cx + 30, head_top_y - 10, width=3) # hairpin

    # Heroic sharp eyebrows (angled down fiercely)
    line(cx - 50, chin_y - 115, cx - 18, chin_y - 102, width=4)
    line(cx + 50, chin_y - 115, cx + 18, chin_y - 102, width=4)
    # Eyes looking forward along weapon axis
    ellipse(cx - 34, chin_y - 92, 14, 10, width=3)
    ellipse(cx + 34, chin_y - 92, 14, 10, width=3)
    # Nose & mouth
    line(cx, chin_y - 72, cx, chin_y - 66, width=2)
    line(cx - 10, chin_y - 42, cx + 10, chin_y - 42, width=3)

    # 2. Torso (leaning forward 15° into the lunge)
    neck_bot = chin_y + 28
    shoulder_y = neck_bot + 18
    l_sh = cx - 110 # rear left shoulder
    r_sh = cx + 115 # front right shoulder

    line(cx - 16, neck_bot, l_sh, shoulder_y - 10, width=4)
    line(cx + 16, neck_bot, r_sh, shoulder_y + 10, width=4)

    # Belt & Waist (dropped into crouch y: 540..600)
    belt_top = 540
    belt_bot = 600
    line(cx - 65, belt_top, cx + 65, belt_top, width=4)
    line(cx - 65, belt_bot, cx + 65, belt_bot, width=4)
    line(cx - 65, belt_top, cx - 65, belt_bot, width=3)
    line(cx + 65, belt_top, cx + 65, belt_bot, width=3)
    ellipse(cx, (belt_top + belt_bot) // 2, 15, 15, width=3)

    # Chest V-collar
    line(cx - 16, neck_bot, cx + 20, belt_top, width=4)
    line(cx + 16, neck_bot, cx - 20, belt_top, width=4)

    # 3. Arms & Hands Gripping Spear!
    # Rear arm (left): shoulder to elbow, elbow to hand near hip holding rear of shaft
    rear_elbow_x = l_sh - 40
    rear_elbow_y = shoulder_y + 60
    rear_hand_x = cx - 40
    rear_hand_y = belt_top - 10

    line(l_sh, shoulder_y - 10, rear_elbow_x, rear_elbow_y, width=5)
    line(rear_elbow_x, rear_elbow_y, rear_hand_x, rear_hand_y, width=5)
    ellipse(rear_hand_x, rear_hand_y, 14, 14, width=4) # rear fist

    # Front arm (right): reaching straight forward, holding front shaft!
    front_elbow_x = r_sh + 65
    front_elbow_y = shoulder_y + 35
    front_hand_x = front_elbow_x + 85
    front_hand_y = shoulder_y + 35

    line(r_sh, shoulder_y + 10, front_elbow_x, front_elbow_y, width=5)
    line(front_elbow_x, front_elbow_y, front_hand_x, front_hand_y, width=5)
    ellipse(front_hand_x, front_hand_y, 15, 15, width=4) # front fist gripping

    # Wide sleeve billowing backward under right arm
    line(front_elbow_x, front_elbow_y, front_elbow_x - 50, front_elbow_y + 110, width=4)
    line(front_elbow_x - 50, front_elbow_y + 110, r_sh - 10, shoulder_y + 90, width=4)

    # 4. Long Spear Weapon passing through both fists!
    spear_start_x = rear_hand_x - 80
    spear_start_y = rear_hand_y + 12
    spear_tip_x = W - 30
    spear_tip_y = front_hand_y - 10

    # Spear shaft
    line(spear_start_x, spear_start_y, spear_tip_x, spear_tip_y, width=6)
    # Spear blade head
    line(spear_tip_x - 60, spear_tip_y - 16, spear_tip_x, spear_tip_y, width=4)
    line(spear_tip_x - 60, spear_tip_y + 16, spear_tip_x, spear_tip_y, width=4)
    line(spear_tip_x - 60, spear_tip_y - 16, spear_tip_x - 60, spear_tip_y + 16, width=4)

    # 5. Lower Body: Deep Martial Bow Lunge (弓步)!
    # Rear leg: stretching back to left (back foot at x=180, y=BASE_FOOT_Y)
    back_foot_x = 180
    back_foot_y = BASE_FOOT_Y

    line(cx - 50, belt_bot, back_foot_x + 30, back_foot_y - 50, width=5)
    line(cx - 20, belt_bot, back_foot_x + 60, back_foot_y - 50, width=5)
    line(back_foot_x + 30, back_foot_y - 50, back_foot_x, back_foot_y, width=5)
    line(back_foot_x + 60, back_foot_y - 50, back_foot_x + 40, back_foot_y, width=5)
    line(back_foot_x, back_foot_y, back_foot_x + 40, back_foot_y, width=5)

    # Front leg: stepping forward to right (front foot at x=480, knee deeply bent at x=450, y=760)
    front_foot_x = 480
    front_foot_y = BASE_FOOT_Y
    knee_x = 450
    knee_y = 760

    # Thigh
    line(cx + 20, belt_bot, knee_x - 15, knee_y, width=5)
    line(cx + 50, belt_bot, knee_x + 20, knee_y, width=5)
    # Shin
    line(knee_x - 15, knee_y, front_foot_x - 20, front_foot_y, width=5)
    line(knee_x + 20, knee_y, front_foot_x + 25, front_foot_y, width=5)
    line(front_foot_x - 20, front_foot_y, front_foot_x + 25, front_foot_y, width=5)

    # Lower robe billowing backward between legs
    line(cx - 65, belt_bot, back_foot_x + 70, 780, width=4)
    line(back_foot_x + 70, 780, cx, 800, width=4)
    line(cx, 800, knee_x - 20, knee_y + 10, width=4)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format='PNG')
    print(f"Generated Martial Lunge Attack Wireframe: {output_path}")
    return output_path

if __name__ == '__main__':
    draw_lunge_wireframe(Path('/tmp/wireframe_attack_lunge.png'))
