"""Sprite sheet packer and foot-anchor alignment engine for 2D character animation."""
import json
from pathlib import Path
from PIL import Image

class SpriteSheetPacker:
    def __init__(self, cell_width: int = 384, cell_height: int = 512, bottom_padding: int = 24):
        self.cell_width = cell_width
        self.cell_height = cell_height
        self.bottom_padding = bottom_padding

    def analyze_frame(self, img: Image.Image) -> dict:
        """Find non-transparent bounding box, foot baseline, and horizontal center."""
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        alpha = img.split()[-1]
        bbox = alpha.getbbox()
        if not bbox:
            return {'bbox': (0, 0, img.width, img.height), 'foot_y': img.height, 'center_x': img.width // 2, 'width': img.width, 'height': img.height}

        x0, y0, x1, y1 = bbox
        center_x = (x0 + x1) // 2
        foot_y = y1  # lowest non-transparent pixel
        return {
            'bbox': bbox,
            'foot_y': foot_y,
            'center_x': center_x,
            'width': x1 - x0,
            'height': y1 - y0
        }

    def align_and_pack(
        self,
        frame_paths: list[Path],
        output_sheet_path: Path,
        output_meta_path: Path,
        layout: str = 'strip', # 'strip' (1 row) or 'grid' (2x2)
        fps: int = 6,
        loop: bool = True
    ) -> dict:
        """Align frames by foot baseline & horizontal center, pack into spritesheet, and export JSON metadata."""
        images = [Image.open(p).convert('RGBA') for p in frame_paths]
        analyses = [self.analyze_frame(im) for im in images]

        # Calculate common scale factor to ensure character fits comfortably in cell
        max_char_h = max(a['height'] for a in analyses)
        max_char_w = max(a['width'] for a in analyses)

        usable_h = self.cell_height - self.bottom_padding - 20
        usable_w = self.cell_width - 30

        scale = min(usable_h / max(max_char_h, 1), usable_w / max(max_char_w, 1), 1.0)

        num_frames = len(images)
        if layout == 'strip':
            cols = num_frames
            rows = 1
        elif layout == 'grid':
            cols = 2
            rows = (num_frames + 1) // 2
        else:
            cols = num_frames
            rows = 1

        sheet_w = cols * self.cell_width
        sheet_h = rows * self.cell_height
        sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))

        frames_meta = []
        target_foot_y = self.cell_height - self.bottom_padding
        target_center_x = self.cell_width // 2

        for i, (img, a, p) in enumerate(zip(images, analyses, frame_paths)):
            col = i % cols
            row = i // cols
            cell_x = col * self.cell_width
            cell_y = row * self.cell_height

            # Crop to actual content
            x0, y0, x1, y1 = a['bbox']
            cropped = img.crop((x0, y0, x1, y1))

            # Resize if scaling required
            if abs(scale - 1.0) > 0.001:
                new_w = max(1, int(cropped.width * scale))
                new_h = max(1, int(cropped.height * scale))
                cropped = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
                char_w, char_h = new_w, new_h
            else:
                char_w, char_h = cropped.width, cropped.height

            # Place character so that:
            # 1. horizontal center aligns at target_center_x
            # 2. bottom (foot_y) aligns at target_foot_y
            paste_x = cell_x + target_center_x - (char_w // 2)
            paste_y = cell_y + target_foot_y - char_h

            sheet.paste(cropped, (paste_x, paste_y), cropped)

            frames_meta.append({
                'index': i,
                'name': p.stem,
                'sourceFile': p.name,
                'cellX': cell_x,
                'cellY': cell_y,
                'cellWidth': self.cell_width,
                'cellHeight': self.cell_height,
                'footX': cell_x + target_center_x,
                'footY': cell_y + target_foot_y,
                'contentBounds': [paste_x, paste_y, paste_x + char_w, paste_y + char_h]
            })

        output_sheet_path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(output_sheet_path, format='PNG')

        metadata = {
            'spritesheet': output_sheet_path.name,
            'width': sheet_w,
            'height': sheet_h,
            'columns': cols,
            'rows': rows,
            'cellWidth': self.cell_width,
            'cellHeight': self.cell_height,
            'frameCount': num_frames,
            'fps': fps,
            'loop': loop,
            'scale': round(scale, 4),
            'targetFootYInCell': target_foot_y,
            'frames': frames_meta
        }

        output_meta_path.parent.mkdir(parents=True, exist_ok=True)
        output_meta_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding='utf-8')

        print(f"[+] Packed {num_frames} frames into {output_sheet_path} ({sheet_w}x{sheet_h}) with metadata {output_meta_path}")
        return metadata

    def export_gif(self, frame_paths: list[Path], output_gif_path: Path, fps: int = 6, loop: int = 0):
        """Export normalized animated GIF with aligned foot baseline for direct inspection."""
        images = [Image.open(p).convert('RGBA') for p in frame_paths]
        analyses = [self.analyze_frame(im) for im in images]

        max_h = max(a['height'] for a in analyses)
        max_w = max(a['width'] for a in analyses)
        canvas_w = max_w + 40
        canvas_h = max_h + 40
        target_foot_y = canvas_h - 15
        target_cx = canvas_w // 2

        aligned_frames = []
        for img, a in zip(images, analyses):
            frame = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
            x0, y0, x1, y1 = a['bbox']
            cropped = img.crop((x0, y0, x1, y1))
            paste_x = target_cx - (cropped.width // 2)
            paste_y = target_foot_y - cropped.height
            frame.paste(cropped, (paste_x, paste_y), cropped)
            aligned_frames.append(frame)

        duration_ms = int(1000 / fps)
        output_gif_path.parent.mkdir(parents=True, exist_ok=True)
        # Convert RGBA to P with transparency for clean GIF
        gif_frames = []
        for f in aligned_frames:
            # Create white/grey background composite or transparent
            p_frame = f.convert('RGB')
            gif_frames.append(p_frame)

        gif_frames[0].save(
            output_gif_path,
            save_all=True,
            append_images=gif_frames[1:],
            duration=duration_ms,
            loop=loop
        )
        print(f"[+] Exported animation GIF: {output_gif_path} ({fps} FPS, {len(gif_frames)} frames)")
