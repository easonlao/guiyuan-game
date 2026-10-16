"""ComfyUI headless execution client for sprite animation generation."""
import json
from pathlib import Path
import time
import urllib.request
import requests

DEFAULT_COMFYUI_URL = 'http://10.10.10.70:8188'

POSITIVE_PROMPT = (
    'masterpiece, best quality, ultra-detailed 2d chinese anime illustration, 1boy, male cultivator, '
    'handsome young taoist disciple, stylized chibi, 3.5 heads tall proportion, big head small body, '
    'confident expression, sharp eyes, dark hair tied in a neat high topknot with a silver hairpin, '
    'wearing layered black silk and white hanfu robes, structured shoulder armor with intricate golden wave filigree embroidery, '
    'delicate silk fabric texture, wide flowing sleeves, wide black waistband with an exquisite carved round jade pendant, '
    'full body, standing, feet firmly on ground, white pants, black leather boots with gold accents, '
    'solid plain flat neutral grey background, completely empty flat background, isolated character, solo'
)

NEGATIVE_PROMPT = (
    'dragon, animal, creature, monster, cloud, clouds, sky, overcast, atmosphere, fog, mist, smoke, floor, '
    'shadows, landscape, scenery, halo, ring, crescent, circle behind head, frame, border, mirror, portal, '
    'weapon, sword, blade, cane, stick, staff, holding object, bowl, exposed fingers, chicken claw, deformed hands, '
    '1girl, female, breasts, low quality, worst quality, realistic, photo, 3d, realistic human proportions, '
    '8 heads tall, tall slender body, baby face, toddler, cropped, half body, extra limbs, text, watermark, hanging decorations'
)


class ComfyUISpriteRunner:
    def __init__(self, base_url: str = DEFAULT_COMFYUI_URL):
        self.base_url = base_url.rstrip('/')

    def check_connection(self) -> dict:
        """Verify ComfyUI connectivity and return server device status."""
        req = urllib.request.Request(f"{self.base_url}/system_stats")
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode('utf-8'))

    def upload_image(self, file_path: Path, overwrite: bool = True) -> str:
        """Upload an input image file to ComfyUI server and return the uploaded filename."""
        url = f"{self.base_url}/upload/image"
        with open(file_path, 'rb') as f:
            files = {'image': (file_path.name, f, 'image/png')}
            data = {'overwrite': 'true' if overwrite else 'false'}
            resp = requests.post(url, files=files, data=data, timeout=10)
            resp.raise_for_status()
            res_json = resp.json()
            return res_json['name']

    def build_workflow(self, uploaded_image_name: str, seed: int, save_prefix: str) -> dict:
        """Construct single-pass graph: SDXL + ControlNet Sketch + KSampler + RMBG-1.4."""
        return {
            '1': {
                'class_type': 'CheckpointLoaderSimple',
                'inputs': {'ckpt_name': r'sdxl动漫\AWPainting XL_1.0.safetensors'}
            },
            '2': {
                'class_type': 'ControlNetLoader',
                'inputs': {'control_net_name': r'SDXL\sai_xl_sketch_256lora.safetensors'}
            },
            '3': {
                'class_type': 'LoadImage',
                'inputs': {'image': uploaded_image_name}
            },
            '4': {
                'class_type': 'CLIPTextEncode',
                'inputs': {'text': POSITIVE_PROMPT, 'clip': ['1', 1]}
            },
            '5': {
                'class_type': 'CLIPTextEncode',
                'inputs': {'text': NEGATIVE_PROMPT, 'clip': ['1', 1]}
            },
            '6': {
                'class_type': 'ControlNetApplyAdvanced',
                'inputs': {
                    'positive': ['4', 0],
                    'negative': ['5', 0],
                    'control_net': ['2', 0],
                    'image': ['3', 0],
                    'strength': 0.60,
                    'start_percent': 0.0,
                    'end_percent': 0.50
                }
            },
            '7': {
                'class_type': 'EmptyLatentImage',
                'inputs': {'width': 768, 'height': 1024, 'batch_size': 1}
            },
            '8': {
                'class_type': 'KSampler',
                'inputs': {
                    'model': ['1', 0],
                    'seed': seed,
                    'steps': 25,
                    'cfg': 7.0,
                    'sampler_name': 'dpmpp_2m',
                    'scheduler': 'karras',
                    'positive': ['6', 0],
                    'negative': ['6', 1],
                    'latent_image': ['7', 0],
                    'denoise': 1.0
                }
            },
            '9': {
                'class_type': 'VAEDecode',
                'inputs': {'samples': ['8', 0], 'vae': ['1', 2]}
            },
            '10': {
                'class_type': 'easy imageRemBg',
                'inputs': {
                    'images': ['9', 0],
                    'rem_mode': 'RMBG-1.4',
                    'image_output': 'Save',
                    'save_prefix': save_prefix,
                    'torchscript_jit': False,
                    'add_background': 'none',
                    'refine_foreground': True
                }
            }
        }

    def run_frame(self, wireframe_path: Path, output_transparent_path: Path, seed: int = 20261028, max_wait_sec: int = 120) -> Path:
        """Run end-to-end generation for one frame: upload wireframe -> run ComfyUI -> save transparent PNG."""
        print(f"[*] Uploading wireframe: {wireframe_path.name}...")
        uploaded_name = self.upload_image(wireframe_path)
        save_prefix = f"guiyuan_sprites/{wireframe_path.stem}"

        workflow = self.build_workflow(uploaded_name, seed=seed, save_prefix=save_prefix)

        print(f"[*] Submitting prompt for {wireframe_path.stem} (seed={seed})...")
        prompt_res = requests.post(f"{self.base_url}/prompt", json={'prompt': workflow}, timeout=10).json()
        prompt_id = prompt_res['prompt_id']

        start_time = time.time()
        while time.time() - start_time < max_wait_sec:
            time.sleep(2)
            hist_res = requests.get(f"{self.base_url}/history/{prompt_id}", timeout=10).json()
            if prompt_id in hist_res:
                own = hist_res[prompt_id]
                status = own.get('status', {})
                if status.get('status_str') == 'error':
                    raise RuntimeError(f"ComfyUI prompt {prompt_id} failed: {status}")

                outputs = own.get('outputs', {})
                if '10' in outputs and outputs['10'].get('images'):
                    img_info = outputs['10']['images'][0]
                    fname = img_info['filename']
                    sfolder = img_info.get('subfolder', '')
                    view_url = f"{self.base_url}/view?filename={fname}&subfolder={sfolder}&type=output"
                    img_data = urllib.request.urlopen(view_url, timeout=30).read()

                    output_transparent_path.parent.mkdir(parents=True, exist_ok=True)
                    output_transparent_path.write_bytes(img_data)
                    elapsed = round(time.time() - start_time, 1)
                    print(f"[+] Frame {wireframe_path.stem} finished in {elapsed}s -> {output_transparent_path} ({len(img_data)} bytes)")
                    return output_transparent_path

        raise TimeoutError(f"ComfyUI execution exceeded {max_wait_sec}s for prompt {prompt_id}")
