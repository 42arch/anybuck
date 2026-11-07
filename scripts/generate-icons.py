#!/usr/bin/env python3
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFilter

def generate_macos_icon(
    source_path: str,
    output_path: str,
    target_size: int = 1024,
    squircle_w: int = 824,
    squircle_h: int = 824,
    logo_w: int = 530,
    corner_r: int = 185,
):
    # Load and crop source logo to actual bounding box
    logo = Image.open(source_path).convert('RGBA')
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    
    # Render at 3x supersampling for high-quality anti-aliasing
    scale = 3
    canvas_s = target_size * scale
    sq_w = squircle_w * scale
    sq_h = squircle_h * scale
    cr = corner_r * scale

    sq_x = (canvas_s - sq_w) // 2
    sq_y = int(96 * scale)

    canvas = Image.new('RGBA', (canvas_s, canvas_s), (0, 0, 0, 0))

    # 1. Contact shadow (closer, tighter)
    contact_layer = Image.new('RGBA', (canvas_s, canvas_s), (0, 0, 0, 0))
    draw_c = ImageDraw.Draw(contact_layer)
    contact_y = sq_y + int(8 * scale)
    draw_c.rounded_rectangle(
        [sq_x, contact_y, sq_x + sq_w, contact_y + sq_h],
        radius=cr,
        fill=(0, 0, 0, int(255 * 0.12)),
    )
    shadow_contact = contact_layer.filter(ImageFilter.GaussianBlur(10 * scale))

    # 2. Ambient drop shadow (larger, softer, downward)
    drop_layer = Image.new('RGBA', (canvas_s, canvas_s), (0, 0, 0, 0))
    draw_d = ImageDraw.Draw(drop_layer)
    drop_y = sq_y + int(24 * scale)
    draw_d.rounded_rectangle(
        [sq_x, drop_y, sq_x + sq_w, drop_y + sq_h],
        radius=cr,
        fill=(0, 0, 0, int(255 * 0.16)),
    )
    shadow_drop = drop_layer.filter(ImageFilter.GaussianBlur(26 * scale))

    canvas = Image.alpha_composite(canvas, shadow_drop)
    canvas = Image.alpha_composite(canvas, shadow_contact)

    # 3. Squircle mask
    mask = Image.new('L', (canvas_s, canvas_s), 0)
    draw_m = ImageDraw.Draw(mask)
    draw_m.rounded_rectangle(
        [sq_x, sq_y, sq_x + sq_w, sq_y + sq_h],
        radius=cr,
        fill=255,
    )

    # 4. Background Gradient (pure white down to #F6F7F9)
    grad = Image.new('RGBA', (canvas_s, canvas_s), (255, 255, 255, 255))
    draw_g = ImageDraw.Draw(grad)
    for y in range(sq_y, sq_y + sq_h):
        ratio = (y - sq_y) / sq_h
        r = int(255 - ratio * 8)
        g = int(255 - ratio * 7)
        b = int(255 - ratio * 5)
        draw_g.line([(sq_x, y), (sq_x + sq_w, y)], fill=(r, g, b, 255))

    card = Image.new('RGBA', (canvas_s, canvas_s), (0, 0, 0, 0))
    card.paste(grad, (0, 0), mask=mask)

    # 5. Inner stroke / rim border (subtle 1.2px border for contrast on white wallpapers)
    stroke_layer = Image.new('RGBA', (canvas_s, canvas_s), (0, 0, 0, 0))
    draw_s = ImageDraw.Draw(stroke_layer)
    draw_s.rounded_rectangle(
        [sq_x, sq_y, sq_x + sq_w, sq_y + sq_h],
        radius=cr,
        outline=(0, 0, 0, int(255 * 0.08)),
        width=max(1, int(1.2 * scale)),
    )
    card = Image.alpha_composite(card, stroke_layer)

    # 6. Logo Foreground
    logo_target_w = int(logo_w * scale)
    aspect = logo.height / logo.width
    logo_target_h = int(logo_target_w * aspect)
    logo_resized = logo.resize((logo_target_w, logo_target_h), Image.Resampling.LANCZOS)

    # Optical center adjustment: 4px upward to balance weight of bucket vs antlers
    logo_x = sq_x + (sq_w - logo_target_w) // 2
    logo_y = sq_y + (sq_h - logo_target_h) // 2 - int(4 * scale)

    card.paste(logo_resized, (logo_x, logo_y), mask=logo_resized)

    canvas = Image.alpha_composite(canvas, card)

    final_img = canvas.resize((target_size, target_size), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    final_img.save(output_path, 'PNG')
    print(f"Generated master macOS icon: {output_path}")

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    source_logo = os.path.join(repo_root, 'src-tauri', 'icons', 'logo-source.png')
    master_icon = os.path.join(repo_root, 'src-tauri', 'icons', 'master-icon.png')
    icons_dir = os.path.join(repo_root, 'src-tauri', 'icons')

    if not os.path.exists(source_logo):
        print(f"Error: source logo not found at {source_logo}")
        sys.exit(1)

    print("Step 1: Generating 1024x1024 macOS squircle icon...")
    generate_macos_icon(source_logo, master_icon)

    print("Step 2: Generating all platform icons via tauri icon CLI...")
    cmd = ["bun", "run", "tauri", "icon", master_icon, "-o", icons_dir]
    res = subprocess.run(cmd, cwd=repo_root)
    if res.returncode != 0:
        print(f"Error: tauri icon failed with code {res.returncode}")
        sys.exit(res.returncode)

    # Clean up mobile subdirectories not used in desktop app
    for unwanted in ["android", "ios", "64x64.png"]:
        p = os.path.join(icons_dir, unwanted)
        if os.path.isdir(p):
            import shutil
            shutil.rmtree(p)
        elif os.path.isfile(p):
            os.remove(p)

    if os.path.exists(master_icon):
        os.remove(master_icon)

    # Touch lib.rs so Cargo detects icon changes and recompiles tauri::generate_context!()
    lib_rs = os.path.join(repo_root, 'src-tauri', 'src', 'lib.rs')
    if os.path.exists(lib_rs):
        os.utime(lib_rs, None)

    print("All icons successfully generated in src-tauri/icons!")

if __name__ == '__main__':
    main()

