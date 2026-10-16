"""Command line interface for the automated 2D character sprite animation pipeline."""
import argparse
import sys
from pathlib import Path

# Add script directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pose_generator import generate_idle_frames, generate_cast_frames
from comfyui_runner import ComfyUISpriteRunner
from spritesheet_packer import SpriteSheetPacker
from preview_generator import generate_interactive_viewer, composite_in_game_layout

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[2] / 'artifacts' / 'frontend-art-direction' / 'sprite-pipeline'


def process_action(
    action_name: str,
    output_dir: Path,
    runner: ComfyUISpriteRunner,
    packer: SpriteSheetPacker,
    seed: int,
    skip_gen: bool = False,
    fps: int = 6
) -> dict:
    print(f"\n==========================================")
    print(f"[*] Processing Action: {action_name.upper()}")
    print(f"==========================================")

    action_dir = output_dir / action_name
    wireframes_dir = action_dir / 'wireframes'
    raw_frames_dir = action_dir / 'transparent_frames'
    action_dir.mkdir(parents=True, exist_ok=True)

    # 1. Generate wireframes
    if action_name == 'idle':
        wireframe_paths = generate_idle_frames(wireframes_dir)
    elif action_name == 'cast':
        wireframe_paths = generate_cast_frames(wireframes_dir)
    else:
        raise ValueError(f"Unknown action: {action_name}")

    print(f"[+] Generated {len(wireframe_paths)} wireframe sketches in {wireframes_dir}")

    # 2. ComfyUI Diffusion + Background Removal
    transparent_frame_paths = []
    for wf in wireframe_paths:
        out_png = raw_frames_dir / f"{wf.stem}_transparent.png"
        if skip_gen and out_png.exists() and out_png.stat().st_size > 1000:
            print(f"[i] Skipping generation for {wf.stem} (already exists: {out_png.name})")
        else:
            runner.run_frame(wireframe_path=wf, output_transparent_path=out_png, seed=seed)
        transparent_frame_paths.append(out_png)

    # 3. Pack Sprite Sheet & Calibrate Baseline
    sheet_png = action_dir / f"{action_name}_spritesheet.png"
    meta_json = action_dir / f"{action_name}_metadata.json"
    meta = packer.align_and_pack(
        frame_paths=transparent_frame_paths,
        output_sheet_path=sheet_png,
        output_meta_path=meta_json,
        layout='strip',
        fps=fps,
        loop=(action_name == 'idle')
    )

    # 4. Generate Animated GIF
    anim_gif = action_dir / f"{action_name}_animation.gif"
    packer.export_gif(transparent_frame_paths, anim_gif, fps=fps, loop=0)

    # 5. Generate Interactive HTML5 Viewer
    viewer_html = action_dir / f"{action_name}_viewer.html"
    generate_interactive_viewer(sheet_png, meta_json, viewer_html)

    # 6. Composite into In-Game Layout A
    layout_png = action_dir / f"{action_name}_layout_A.png"
    composite_in_game_layout(transparent_frame_paths[0], layout_png)

    return {
        'action': action_name,
        'frames': len(transparent_frame_paths),
        'spritesheet': str(sheet_png),
        'metadata': str(meta_json),
        'animation_gif': str(anim_gif),
        'viewer_html': str(viewer_html),
        'layout_composite': str(layout_png)
    }


def main():
    parser = argparse.ArgumentParser(description="End-to-End 2D Character Animation Sprite Pipeline for Guiyuan")
    parser.add_argument('--action', choices=['idle', 'cast', 'all'], default='idle', help="Animation action to generate")
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT_DIR, help="Destination directory for assets")
    parser.add_argument('--server', type=str, default='http://10.10.10.70:8188', help="ComfyUI server URL")
    parser.add_argument('--seed', type=int, default=20261028, help="Random seed for diffusion reproducibility")
    parser.add_argument('--fps', type=int, default=6, help="Target playback frame rate")
    parser.add_argument('--skip-gen', action='store_true', help="Skip ComfyUI GPU generation and re-pack existing frames")

    args = parser.parse_args()

    print("[*] Initializing Guiyuan 2D Sprite Animation Pipeline...")
    runner = ComfyUISpriteRunner(base_url=args.server)

    if not args.skip_gen:
        print(f"[*] Checking ComfyUI connection at {args.server}...")
        try:
            stats = runner.check_connection()
            devices = stats.get('devices', [])
            gpu_name = devices[0]['name'] if devices else 'Unknown'
            print(f"[+] Connected to ComfyUI. Device: {gpu_name}")
        except Exception as e:
            print(f"[!] Failed to connect to ComfyUI at {args.server}: {e}")
            sys.exit(1)

    packer = SpriteSheetPacker(cell_width=384, cell_height=512, bottom_padding=24)

    actions = ['idle', 'cast'] if args.action == 'all' else [args.action]
    results = []

    for act in actions:
        res = process_action(
            action_name=act,
            output_dir=args.output_dir,
            runner=runner,
            packer=packer,
            seed=args.seed,
            skip_gen=args.skip_gen,
            fps=args.fps
        )
        results.append(res)

    print("\n==========================================")
    print("[+] PIPELINE EXECUTION COMPLETE!")
    print("==========================================")
    for r in results:
        print(f"\nAction: {r['action'].upper()} ({r['frames']} frames)")
        print(f" - Spritesheet:  {r['spritesheet']}")
        print(f" - Metadata:     {r['metadata']}")
        print(f" - Animation GIF:{r['animation_gif']}")
        print(f" - HTML Viewer:  {r['viewer_html']}")
        print(f" - Layout A:     {r['layout_composite']}")


if __name__ == '__main__':
    main()
