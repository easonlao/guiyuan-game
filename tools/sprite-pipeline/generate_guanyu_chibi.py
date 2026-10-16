"""Calibrated 3.5-head Chibi Guan Yu wireframe and generator."""
import os
from pathlib import Path
import time
import urllib.request
from PIL import Image, ImageDraw
import requests
from comfyui_runner import ComfyUISpriteRunner

W, H = 768, 1024
BASE_FOOT_Y = 930
CENTER_X = 384

def generate_calibrated_guanyu_wireframe(output_path: Path) -> Path:
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
    head_top_y = chin_y - 225

    # 1. 3.5-head Chibi Head & Face (matching character_transparent.png)
    # Broad cute chibi jawline
    line(cx - 85, chin_y - 95, cx - 45, chin_y - 15, width=4)
    line(cx - 45, chin_y - 15, cx, chin_y, width=4)
    line(cx + 85, chin_y - 95, cx + 45, chin_y - 15, width=4)
    line(cx + 45, chin_y - 15, cx, chin_y, width=4)

    # Green warrior cap / turban dome
    arc(cx, head_top_y + 70, 95, 75, 180, 360, width=5)
    # Cap headband across forehead
    line(cx - 88, chin_y - 130, cx + 88, chin_y - 130, width=4)
    line(cx - 84, chin_y - 115, cx + 84, chin_y - 115, width=4)
    # Top knot / ribbon
    ellipse(cx, head_top_y - 10, 18, 14, width=4)
    line(cx + 10, head_top_y - 10, cx + 35, head_top_y - 25, width=3)

    # Chibi big sharp phoenix eyes & heroic eyebrows
    # Eyebrows
    line(cx - 55, chin_y - 110, cx - 20, chin_y - 105, width=4)
    line(cx + 55, chin_y - 110, cx + 20, chin_y - 105, width=4)
    # Chibi big eyes
    ellipse(cx - 36, chin_y - 88, 15, 12, width=3)
    ellipse(cx + 36, chin_y - 88, 15, 12, width=3)
    # Nose
    line(cx, chin_y - 68, cx, chin_y - 62, width=2)

    # 2. Long black flowing beard (美髯公)
    line(cx - 15, chin_y - 35, cx - 25, chin_y + 80, width=4)
    line(cx + 15, chin_y - 35, cx + 25, chin_y + 80, width=4)
    line(cx - 25, chin_y + 80, cx, chin_y + 160, width=4)
    line(cx + 25, chin_y + 80, cx, chin_y + 160, width=4)

    # 3. Compact Chibi Torso & Shoulders (matching 3.5 heads)
    neck_bot = chin_y + 30
    shoulder_y = neck_bot + 18
    l_sh = cx - 105
    r_sh = cx + 105
    line(cx - 20, neck_bot, l_sh, shoulder_y, width=4)
    line(cx + 20, neck_bot, r_sh, shoulder_y, width=4)

    # Golden shoulder armor pads
    ellipse(l_sh, shoulder_y + 20, 22, 25, width=3)
    ellipse(r_sh, shoulder_y + 20, 22, 25, width=3)

    # Chest V-collar
    chest_y = shoulder_y + 85
    line(cx - 16, neck_bot, cx + 18, chest_y, width=4)
    line(cx + 16, neck_bot, cx - 18, chest_y, width=4)

    # 4. Waist & Belt (Y: 515..575) - Exactly matching female_v2 and male v6!
    belt_top = 515
    belt_bot = 575
    line(cx - 68, belt_top, cx + 68, belt_top, width=4)
    line(cx - 68, belt_bot, cx + 68, belt_bot, width=4)
    line(cx - 68, belt_top, cx - 68, belt_bot, width=3)
    line(cx + 68, belt_top, cx + 68, belt_bot, width=3)
    ellipse(cx, (belt_top + belt_bot) // 2, 16, 16, width=3)

    # 5. Tucked Sleeves & Fists
    l_elbow_x = l_sh - 28
    l_elbow_y = shoulder_y + 75
    r_elbow_x = r_sh + 28
    r_elbow_y = shoulder_y + 75

    line(l_sh, shoulder_y, l_elbow_x, l_elbow_y, width=4)
    line(r_sh, shoulder_y, r_elbow_x, r_elbow_y, width=4)
    line(l_elbow_x, l_elbow_y, cx - 42, belt_top + 25, width=4)
    line(r_elbow_x, r_elbow_y, cx + 42, belt_top + 25, width=4)

    # Sleeve draping
    line(l_elbow_x, l_elbow_y, l_elbow_x + 12, l_elbow_y + 125, width=4)
    line(l_elbow_x + 12, l_elbow_y + 125, cx - 58, belt_bot - 5, width=4)
    line(r_elbow_x, r_elbow_y, r_elbow_x - 12, r_elbow_y + 125, width=4)
    line(r_elbow_x - 12, r_elbow_y + 125, cx + 58, belt_bot - 5, width=4)

    # 6. Lower Green Battle Robe (Y: 575..780)
    hem_y = 780
    line(cx - 68, belt_bot, cx - 88, hem_y, width=4)
    line(cx + 68, belt_bot, cx + 88, hem_y, width=4)
    line(cx - 88, hem_y, cx + 88, hem_y, width=4)

    # Center tabard apron
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
    print(f"Generated Calibrated Chibi Guan Yu wireframe: {output_path}")
    return output_path

GUANYU_CHIBI_POS = (
    'masterpiece, best quality, ultra-detailed 2d chinese anime illustration, 1boy, guan yu, '
    'stylized chibi, 3.5 heads tall proportion, big head small body, cute handsome heroic face, sharp phoenix eyes, '
    'magnificent long black beard, green warrior cap with silver hairpin, '
    'wearing dark green battle hanfu robes, structured golden dragon wave shoulder armor, '
    'delicate silk fabric texture, wide flowing sleeves, wide black waistband with golden lion buckle, '
    'white martial pants, black leather boots with gold accents firmly grounded on floor, '
    'full body, standing, solid plain flat neutral grey background, completely empty flat background, isolated character, solo'
)

GUANYU_CHIBI_NEG = (
    'dragon wings, dragon tails, animal, horns, halo, ring, circle behind head, frame, border, '
    'floating objects, weapons, sword, blade, spear, staff, stick, deformed hands, '
    'realistic human proportions, 8 heads tall, tall slender body, baby face, toddler, 1girl, female, '
    'low quality, worst quality, text, watermark, shadows on floor, complex background'
)

def run_calibrated_guanyu():
    wf_path = Path('/tmp/wireframe_guanyu_chibi_calibrated.png')
    generate_calibrated_guanyu_wireframe(wf_path)
    
    out_master = Path('/home/easonlao/.gemini/antigravity-cli/brain/767ed4ac-a60e-4e94-86c3-c79c5e9dbb39/guanyu_chibi_master.png')
    runner = ComfyUISpriteRunner(base_url='http://10.10.10.70:8188')
    
    uploaded_name = runner.upload_image(wf_path)
    workflow = runner.build_workflow(uploaded_name, seed=20261029, save_prefix='guiyuan_sprites/guanyu_chibi_calibrated')
    workflow['4']['inputs']['text'] = GUANYU_CHIBI_POS
    workflow['5']['inputs']['text'] = GUANYU_CHIBI_NEG
    workflow['6']['inputs']['strength'] = 0.65 # Enforce strict 3.5-head chibi silhouette
    workflow['6']['inputs']['end_percent'] = 0.55

    resp = requests.post('http://10.10.10.70:8188/prompt', json={'prompt': workflow}, timeout=10).json()
    prompt_id = resp['prompt_id']
    print(f"[*] Submitted calibrated prompt ID: {prompt_id}")

    start = time.time()
    while time.time() - start < 120:
        time.sleep(2)
        hist = requests.get(f'http://10.10.10.70:8188/history/{prompt_id}', timeout=10).json()
        if prompt_id in hist:
            outputs = hist[prompt_id].get('outputs', {})
            if '10' in outputs and outputs['10'].get('images'):
                img_info = outputs['10']['images'][0]
                view_url = f"http://10.10.10.70:8188/view?filename={img_info['filename']}&subfolder={img_info.get('subfolder','')}&type=output"
                data = urllib.request.urlopen(view_url, timeout=30).read()
                out_master.write_bytes(data)
                print(f"[+] Saved calibrated Chibi Guan Yu master in {round(time.time()-start,1)}s -> {out_master}")
                return

if __name__ == '__main__':
    run_calibrated_guanyu()
