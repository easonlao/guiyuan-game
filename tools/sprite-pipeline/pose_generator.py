"""Parametric 3.5-head chibi pose & animation wireframe generator for guiyuan-game."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

W, H = 768, 1024
BASE_FOOT_Y = 930
CENTER_X = 384

class ChibiPoseDrawer:
    def __init__(self, bg_color=(255, 255, 255)):
        self.image = Image.new('RGB', (W, H), color=bg_color)
        self.draw = ImageDraw.Draw(self.image)
        self.color = (0, 0, 0)

    def line(self, x0, y0, x1, y1, width=4):
        self.draw.line([(int(x0), int(y0)), (int(x1), int(y1))], fill=self.color, width=width)

    def ellipse(self, cx, cy, rx, ry, width=4):
        self.draw.ellipse([(int(cx - rx), int(cy - ry)), (int(cx + rx), int(cy + ry))], outline=self.color, width=width)

    def arc(self, cx, cy, rx, ry, start_deg, end_deg, width=4):
        self.draw.arc([(int(cx - rx), int(cy - ry)), (int(cx + rx), int(cy + ry))], start=start_deg, end=end_deg, fill=self.color, width=width)

    def draw_head_and_face(self, cx, cy):
        """Standard 3.5-head chibi face and hair topknot. cy is chin baseline (~365)."""
        head_top_y = cy - 220
        # Chin jawline (V-shape)
        self.line(cx - 84, cy - 105, cx - 44, cy - 25, width=4)
        self.line(cx - 44, cy - 25, cx, cy, width=4)
        self.line(cx + 84, cy - 105, cx + 44, cy - 25, width=4)
        self.line(cx + 44, cy - 25, cx, cy, width=4)

        # Hair dome
        hair_center_y = head_top_y + 65
        self.arc(cx, hair_center_y, 95, 75, 180, 360, width=4)

        # Fringe bangs across forehead
        fringe_y = cy - 120
        self.line(cx - 84, fringe_y, cx - 39, fringe_y - 20, width=3)
        self.line(cx - 39, fringe_y - 20, cx, fringe_y - 5, width=3)
        self.line(cx, fringe_y - 5, cx + 36, fringe_y - 20, width=3)
        self.line(cx + 36, fringe_y - 20, cx + 84, fringe_y, width=3)

        # Sideburns
        self.line(cx - 84, fringe_y, cx - 74, fringe_y + 45, width=3)
        self.line(cx + 84, fringe_y, cx + 74, fringe_y + 45, width=3)

        # Topknot bun and hairpin
        bun_y = head_top_y - 10
        self.ellipse(cx, bun_y, 20, 15, width=4)
        self.line(cx - 29, bun_y, cx + 29, bun_y, width=3)

        # Eyebrows
        brow_y = cy - 110
        self.line(cx - 49, brow_y, cx - 19, brow_y - 5, width=3)
        self.line(cx + 49, brow_y, cx + 19, brow_y - 5, width=3)

        # Eyes
        eye_y = cy - 95
        self.ellipse(cx - 34, eye_y, 14, 10, width=3)
        self.ellipse(cx + 34, eye_y, 14, 10, width=3)

        # Nose & Mouth
        self.line(cx, cy - 75, cx, cy - 70, width=2)
        self.line(cx - 12, cy - 45, cx + 12, cy - 45, width=3)

    def draw_lower_body(self, cx, belt_bottom_y, left_foot_x=331, right_foot_x=430, foot_y=BASE_FOOT_Y):
        """Standard lower robe, pants, and boots grounded at foot_y."""
        # Lower robe flared hem
        hem_y = belt_bottom_y + 200
        self.line(cx - 68, belt_bottom_y, cx - 96, hem_y, width=4)
        self.line(cx + 68, belt_bottom_y, cx + 96, hem_y, width=4)
        self.line(cx - 96, hem_y, cx - 36, hem_y + 10, width=4)
        self.line(cx + 96, hem_y, cx + 36, hem_y + 10, width=4)

        # Center tabard
        self.line(cx - 28, belt_bottom_y, cx - 28, hem_y - 20, width=3)
        self.line(cx + 28, belt_bottom_y, cx + 28, hem_y - 20, width=3)
        self.line(cx - 28, hem_y - 20, cx + 28, hem_y - 20, width=3)

        # Left leg and boot
        knee_y = hem_y + 80
        self.line(left_foot_x - 15, hem_y - 5, left_foot_x - 10, knee_y, width=4)
        self.line(left_foot_x + 15, hem_y - 5, left_foot_x + 10, knee_y, width=4)
        self.line(left_foot_x - 10, knee_y, left_foot_x - 30, foot_y, width=4)
        self.line(left_foot_x + 10, knee_y, left_foot_x + 25, foot_y, width=4)
        self.line(left_foot_x - 30, foot_y, left_foot_x + 25, foot_y, width=4)

        # Right leg and boot
        self.line(right_foot_x - 15, hem_y - 5, right_foot_x - 10, knee_y, width=4)
        self.line(right_foot_x + 15, hem_y - 5, right_foot_x + 10, knee_y, width=4)
        self.line(right_foot_x - 10, knee_y, right_foot_x - 25, foot_y, width=4)
        self.line(right_foot_x + 10, knee_y, right_foot_x + 30, foot_y, width=4)
        self.line(right_foot_x - 25, foot_y, right_foot_x + 30, foot_y, width=4)


def generate_idle_frames(output_dir: Path) -> list[Path]:
    """Generate 4 cyclic idle animation wireframe frames (breathing & gentle sleeve sway)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = []

    # Cycle parameters: 4 frames forming a continuous loop
    # dy: vertical chest/shoulder displacement (breathing)
    # sleeve_flare: outward sleeve float
    configs = [
        {'name': 'idle_0', 'dy': 0, 'sleeve_dx': 0, 'sway_x': 0},
        {'name': 'idle_1', 'dy': -4, 'sleeve_dx': 6, 'sway_x': 1},
        {'name': 'idle_2', 'dy': -7, 'sleeve_dx': 10, 'sway_x': 2},
        {'name': 'idle_3', 'dy': -3, 'sleeve_dx': 5, 'sway_x': 1},
    ]

    for cfg in configs:
        drawer = ChibiPoseDrawer()
        cx = CENTER_X + cfg['sway_x']
        dy = cfg['dy']
        s_dx = cfg['sleeve_dx']

        chin_y = 365 + dy
        drawer.draw_head_and_face(cx, chin_y)

        # Neck & Shoulders
        neck_top = chin_y
        neck_bot = neck_top + 30
        drawer.line(cx - 18, neck_top, cx - 18, neck_bot, width=3)
        drawer.line(cx + 18, neck_top, cx + 18, neck_bot, width=3)

        shoulder_y = neck_bot + 20
        l_shoulder_x = cx - 118
        r_shoulder_x = cx + 118
        drawer.line(cx - 18, neck_bot, l_shoulder_x, shoulder_y, width=4)
        drawer.line(cx + 18, neck_bot, r_shoulder_x, shoulder_y, width=4)

        # Robe collar
        chest_y = shoulder_y + 100
        drawer.line(cx - 18, neck_bot, cx + 22, chest_y, width=4)
        drawer.line(cx + 18, neck_bot, cx - 22, chest_y, width=4)
        drawer.line(cx - 10, neck_bot, cx + 18, chest_y - 40, width=2)

        # Shoulder mantle plates
        drawer.line(l_shoulder_x, shoulder_y, l_shoulder_x + 10, shoulder_y + 80, width=3)
        drawer.line(l_shoulder_x + 10, shoulder_y + 80, cx - 36, chest_y - 10, width=3)
        drawer.line(r_shoulder_x, shoulder_y, r_shoulder_x - 10, shoulder_y + 80, width=3)
        drawer.line(r_shoulder_x - 10, shoulder_y + 80, cx + 36, chest_y - 10, width=3)

        # Waist and belt (Y ~ 520..585 + dy*0.4)
        belt_top = int(520 + dy * 0.4)
        belt_bot = belt_top + 65
        drawer.line(cx - 68, belt_top, cx + 68, belt_top, width=4)
        drawer.line(cx - 68, belt_bot, cx + 68, belt_bot, width=4)
        drawer.line(cx - 68, belt_top, cx - 68, belt_bot, width=3)
        drawer.line(cx + 68, belt_top, cx + 68, belt_bot, width=3)
        drawer.ellipse(cx, (belt_top + belt_bot) // 2, 16, 16, width=3)

        # Tucked sleeves with gentle breathing flutter
        elbow_l_x = l_shoulder_x - 40 - s_dx
        elbow_l_y = shoulder_y + 80
        elbow_r_x = r_shoulder_x + 40 + s_dx
        elbow_r_y = shoulder_y + 80

        drawer.line(l_shoulder_x, shoulder_y, elbow_l_x, elbow_l_y, width=4)
        drawer.line(r_shoulder_x, shoulder_y, elbow_r_x, elbow_r_y, width=4)

        # Forearms folded inwards at waist
        drawer.line(elbow_l_x, elbow_l_y, cx - 44, belt_top + 30, width=4)
        drawer.line(elbow_r_x, elbow_r_y, cx + 44, belt_top + 30, width=4)

        # Wide falling sleeve hems
        sleeve_fall_l = elbow_l_y + 135
        sleeve_fall_r = elbow_r_y + 135
        drawer.line(elbow_l_x, elbow_l_y, elbow_l_x + 14 - s_dx, sleeve_fall_l, width=4)
        drawer.line(elbow_l_x + 14 - s_dx, sleeve_fall_l, cx - 64, belt_bot - 5, width=4)
        drawer.line(elbow_r_x, elbow_r_y, elbow_r_x - 14 + s_dx, sleeve_fall_r, width=4)
        drawer.line(elbow_r_x - 14 + s_dx, sleeve_fall_r, cx + 64, belt_bot - 5, width=4)

        # Lower body grounded
        drawer.draw_lower_body(cx, belt_bot)

        file_path = output_dir / f"{cfg['name']}.png"
        drawer.image.save(file_path, format='PNG')
        frames.append(file_path)

    return frames


def generate_cast_frames(output_dir: Path) -> list[Path]:
    """Generate 4 sequential cast animation wireframe frames (charging -> raising hand -> sword finger strike -> settle)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = []

    # Frame 0: Gather energy (stance sinks slightly, arms pulled in closer)
    # Frame 1: Raise hand (right arm lifts with two fingers pointing up, left arm tucked)
    # Frame 2: Cast forward (sword finger thrusts forward, sleeve bills back)
    # Frame 3: Settle (returning to relaxed ready pose)
    configs = [
        {'name': 'cast_0', 'stage': 'charge'},
        {'name': 'cast_1', 'stage': 'raise'},
        {'name': 'cast_2', 'stage': 'strike'},
        {'name': 'cast_3', 'stage': 'settle'},
    ]

    for cfg in configs:
        drawer = ChibiPoseDrawer()
        stage = cfg['stage']
        cx = CENTER_X

        if stage == 'charge':
            dy = 8  # slight sink
            chin_y = 365 + dy
            drawer.draw_head_and_face(cx, chin_y)
            neck_bot = chin_y + 30
            drawer.line(cx - 18, chin_y, cx - 18, neck_bot, width=3)
            drawer.line(cx + 18, chin_y, cx + 18, neck_bot, width=3)

            shoulder_y = neck_bot + 20
            drawer.line(cx - 18, neck_bot, cx - 110, shoulder_y, width=4)
            drawer.line(cx + 18, neck_bot, cx + 110, shoulder_y, width=4)

            # Both hands tightly gathered in front of lower abdomen
            belt_top = int(520 + dy)
            belt_bot = belt_top + 65
            drawer.line(cx - 68, belt_top, cx + 68, belt_top, width=4)
            drawer.line(cx - 68, belt_bot, cx + 68, belt_bot, width=4)
            drawer.ellipse(cx, (belt_top + belt_bot) // 2, 16, 16, width=3)

            # Arms gathered inwards
            drawer.line(cx - 110, shoulder_y, cx - 80, shoulder_y + 80, width=4)
            drawer.line(cx + 110, shoulder_y, cx + 80, shoulder_y + 80, width=4)
            drawer.line(cx - 80, shoulder_y + 80, cx - 20, belt_top + 20, width=4)
            drawer.line(cx + 80, shoulder_y + 80, cx + 20, belt_top + 20, width=4)

            # Sleeves draping
            drawer.line(cx - 80, shoulder_y + 80, cx - 70, shoulder_y + 200, width=4)
            drawer.line(cx - 70, shoulder_y + 200, cx - 40, belt_bot, width=4)
            drawer.line(cx + 80, shoulder_y + 80, cx + 70, shoulder_y + 200, width=4)
            drawer.line(cx + 70, shoulder_y + 200, cx + 40, belt_bot, width=4)

            drawer.draw_lower_body(cx, belt_bot)

        elif stage == 'raise':
            # Right arm raised in Taoist invocation gesture
            dy = -2
            chin_y = 365 + dy
            drawer.draw_head_and_face(cx, chin_y)
            neck_bot = chin_y + 30
            drawer.line(cx - 18, chin_y, cx - 18, neck_bot, width=3)
            drawer.line(cx + 18, chin_y, cx + 18, neck_bot, width=3)

            shoulder_y = neck_bot + 20
            l_sh = cx - 118
            r_sh = cx + 118
            drawer.line(cx - 18, neck_bot, l_sh, shoulder_y, width=4)
            drawer.line(cx + 18, neck_bot, r_sh, shoulder_y - 10, width=4)  # right shoulder slightly higher

            belt_top = 520
            belt_bot = belt_top + 65
            drawer.line(cx - 68, belt_top, cx + 68, belt_top, width=4)
            drawer.line(cx - 68, belt_bot, cx + 68, belt_bot, width=4)
            drawer.ellipse(cx, (belt_top + belt_bot) // 2, 16, 16, width=3)

            # Left arm stays tucked at waist
            drawer.line(l_sh, shoulder_y, l_sh - 30, shoulder_y + 80, width=4)
            drawer.line(l_sh - 30, shoulder_y + 80, cx - 40, belt_top + 30, width=4)
            drawer.line(l_sh - 30, shoulder_y + 80, l_sh - 20, shoulder_y + 210, width=4)
            drawer.line(l_sh - 20, shoulder_y + 210, cx - 60, belt_bot, width=4)

            # Right arm raised up: elbow bends up, hand pointing upward (sword finger gesture)
            r_elbow_x = r_sh + 30
            r_elbow_y = shoulder_y + 10
            hand_x = r_sh + 20
            hand_y = chin_y - 40
            drawer.line(r_sh, shoulder_y - 10, r_elbow_x, r_elbow_y, width=4)
            drawer.line(r_elbow_x, r_elbow_y, hand_x, hand_y, width=4)

            # Sword fingers (index + middle fingers extended, thumb holding ring+pinky)
            drawer.line(hand_x, hand_y, hand_x - 5, hand_y - 30, width=3)
            drawer.line(hand_x, hand_y, hand_x + 5, hand_y - 30, width=3)

            # Wide sleeve falls downwards from elbow
            drawer.line(r_elbow_x, r_elbow_y, r_elbow_x + 35, r_elbow_y + 140, width=4)
            drawer.line(r_elbow_x + 35, r_elbow_y + 140, r_sh - 10, shoulder_y + 90, width=4)

            drawer.draw_lower_body(cx, belt_bot)

        elif stage == 'strike':
            # Right arm thrusts forward horizontally, sleeve billowing backward
            dy = 2
            chin_y = 365 + dy
            drawer.draw_head_and_face(cx + 8, chin_y)
            neck_bot = chin_y + 30
            drawer.line(cx - 10, chin_y, cx - 10, neck_bot, width=3)
            drawer.line(cx + 26, chin_y, cx + 26, neck_bot, width=3)

            shoulder_y = neck_bot + 20
            l_sh = cx - 110
            r_sh = cx + 126
            drawer.line(cx - 10, neck_bot, l_sh, shoulder_y + 10, width=4)
            drawer.line(cx + 26, neck_bot, r_sh, shoulder_y, width=4)

            belt_top = 525
            belt_bot = belt_top + 65
            drawer.line(cx - 68, belt_top, cx + 68, belt_top, width=4)
            drawer.line(cx - 68, belt_bot, cx + 68, belt_bot, width=4)
            drawer.ellipse(cx + 8, (belt_top + belt_bot) // 2, 16, 16, width=3)

            # Left arm swept back for balance
            drawer.line(l_sh, shoulder_y + 10, l_sh - 45, shoulder_y + 90, width=4)
            drawer.line(l_sh - 45, shoulder_y + 90, l_sh - 35, belt_top + 40, width=4)

            # Right arm thrusting forward to the right
            r_elbow_x = r_sh + 60
            r_elbow_y = shoulder_y + 10
            hand_x = r_elbow_x + 70
            hand_y = shoulder_y + 10
            drawer.line(r_sh, shoulder_y, r_elbow_x, r_elbow_y, width=4)
            drawer.line(r_elbow_x, r_elbow_y, hand_x, hand_y, width=4)

            # Sword fingers pointing forward horizontally
            drawer.line(hand_x, hand_y, hand_x + 30, hand_y - 5, width=3)
            drawer.line(hand_x, hand_y, hand_x + 30, hand_y + 5, width=3)

            # Billowing sleeve trail behind arm
            drawer.line(r_elbow_x, r_elbow_y, r_elbow_x - 40, r_elbow_y + 120, width=4)
            drawer.line(r_elbow_x - 40, r_elbow_y + 120, r_sh - 20, shoulder_y + 100, width=4)

            drawer.draw_lower_body(cx + 8, belt_bot, left_foot_x=325, right_foot_x=445)

        elif stage == 'settle':
            # Settling back down with arm lowering
            dy = 0
            chin_y = 365
            drawer.draw_head_and_face(cx, chin_y)
            neck_bot = chin_y + 30
            drawer.line(cx - 18, chin_y, cx - 18, neck_bot, width=3)
            drawer.line(cx + 18, chin_y, cx + 18, neck_bot, width=3)

            shoulder_y = neck_bot + 20
            l_sh = cx - 118
            r_sh = cx + 118
            drawer.line(cx - 18, neck_bot, l_sh, shoulder_y, width=4)
            drawer.line(cx + 18, neck_bot, r_sh, shoulder_y, width=4)

            belt_top = 520
            belt_bot = belt_top + 65
            drawer.line(cx - 68, belt_top, cx + 68, belt_top, width=4)
            drawer.line(cx - 68, belt_bot, cx + 68, belt_bot, width=4)
            drawer.ellipse(cx, (belt_top + belt_bot) // 2, 16, 16, width=3)

            # Both sleeves settling down to waist
            drawer.line(l_sh, shoulder_y, l_sh - 40, shoulder_y + 80, width=4)
            drawer.line(r_sh, shoulder_y, r_sh + 40, shoulder_y + 80, width=4)
            drawer.line(l_sh - 40, shoulder_y + 80, cx - 44, belt_top + 30, width=4)
            drawer.line(r_sh + 40, shoulder_y + 80, cx + 44, belt_top + 30, width=4)

            drawer.line(l_sh - 40, shoulder_y + 80, l_sh - 26, shoulder_y + 215, width=4)
            drawer.line(l_sh - 26, shoulder_y + 215, cx - 64, belt_bot - 5, width=4)
            drawer.line(r_sh + 40, shoulder_y + 80, r_sh + 26, shoulder_y + 215, width=4)
            drawer.line(r_sh + 26, shoulder_y + 215, cx + 64, belt_bot - 5, width=4)

            drawer.draw_lower_body(cx, belt_bot)

        file_path = output_dir / f"{cfg['name']}.png"
        drawer.image.save(file_path, format='PNG')
        frames.append(file_path)

    return frames
