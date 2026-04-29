"""
Build an 8-second promo video from 4 kitchen remodel photos.
Cross-fade transitions, "Project Price" branding overlay, 1920x1080 MP4.
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import sys
import os

IMAGE_PATHS = [
    r"J:\My Drive\Marketing\Example photos\IMG_6139.PNG",
    r"J:\My Drive\Marketing\Example photos\IMG_6136.PNG",
    r"J:\My Drive\Marketing\Example photos\IMG_6138.PNG",
    r"J:\My Drive\Marketing\Example photos\IMG_6137.PNG",
]
OUTPUT = r"C:\Project-Price\apps\mobile\assets\images\promo_video_8sec.mp4"

W, H = 1920, 1080
FPS = 30
SECONDS_PER_PHOTO = 2          # 4 photos x 2s = 8s
TRANSITION_FRAMES = 20         # ~0.67s cross-fade between each photo


def load_and_fill(path: str, W: int, H: int) -> np.ndarray:
    """Load image, center-crop to 16:9, resize to WxH."""
    img = Image.open(path).convert("RGB")
    src_ratio = img.width / img.height
    dst_ratio = W / H
    if src_ratio > dst_ratio:
        new_w = int(img.height * dst_ratio)
        left = (img.width - new_w) // 2
        img = img.crop((left, 0, left + new_w, img.height))
    else:
        new_h = int(img.width / dst_ratio)
        top = (img.height - new_h) // 2
        img = img.crop((0, top, img.width, top + new_h))
    img = img.resize((W, H), Image.LANCZOS)
    return np.array(img)


def add_overlay(frame_rgb: np.ndarray, alpha: float = 1.0) -> np.ndarray:
    """Add semi-transparent bottom bar with branding text."""
    img = Image.fromarray(frame_rgb)
    draw = ImageDraw.Draw(img, "RGBA")

    bar_h = 90
    # Dark gradient bar at bottom
    draw.rectangle([(0, H - bar_h), (W, H)], fill=(0, 0, 0, int(170 * alpha)))

    # Try a bold system font, fall back to default
    font_large = font_small = None
    font_candidates = [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\Arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf",
    ]
    for fc in font_candidates:
        if os.path.exists(fc):
            try:
                font_large = ImageFont.truetype(fc, 52)
                font_small = ImageFont.truetype(fc, 28)
                break
            except Exception:
                pass
    if font_large is None:
        font_large = ImageFont.load_default()
        font_small = font_large

    title = "Project Price"
    sub = "Instant Repair & Remodel Estimates"

    # Center text
    bb = draw.textbbox((0, 0), title, font=font_large)
    tw = bb[2] - bb[0]
    tx = (W - tw) // 2
    draw.text((tx, H - bar_h + 8), title, font=font_large,
              fill=(255, 200, 50, int(255 * alpha)))

    bb2 = draw.textbbox((0, 0), sub, font=font_small)
    tw2 = bb2[2] - bb2[0]
    tx2 = (W - tw2) // 2
    draw.text((tx2, H - bar_h + 54), sub, font=font_small,
              fill=(255, 255, 255, int(220 * alpha)))

    return np.array(img.convert("RGB"))


def write_frames(out, frame_rgb: np.ndarray, count: int):
    bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    for _ in range(count):
        out.write(bgr)


def main():
    print("Loading images...")
    frames = []
    for p in IMAGE_PATHS:
        if not os.path.exists(p):
            print(f"ERROR: File not found: {p}", file=sys.stderr)
            sys.exit(1)
        arr = load_and_fill(p, W, H)
        arr = add_overlay(arr)
        frames.append(arr)
        print(f"  Loaded: {os.path.basename(p)}")

    frames_per_photo = FPS * SECONDS_PER_PHOTO
    # Frames available for solid display (subtract transition at end of each photo except last)
    solid_frames = frames_per_photo - TRANSITION_FRAMES

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(OUTPUT, fourcc, FPS, (W, H))

    print(f"Building video: {len(frames)} photos x {SECONDS_PER_PHOTO}s = 8 seconds @ {FPS}fps")

    for i, frame in enumerate(frames):
        is_last = i == len(frames) - 1
        hold = solid_frames if not is_last else frames_per_photo
        write_frames(out, frame, hold)

        if not is_last:
            nxt = frames[i + 1]
            for t in range(TRANSITION_FRAMES):
                a = t / TRANSITION_FRAMES
                blended = (frame * (1 - a) + nxt * a).astype(np.uint8)
                bgr = cv2.cvtColor(blended, cv2.COLOR_RGB2BGR)
                out.write(bgr)

    out.release()

    size_mb = os.path.getsize(OUTPUT) / (1024 * 1024)
    print(f"\nDone! Saved: {OUTPUT}")
    print(f"Size: {size_mb:.1f} MB")
    print("Upload this to YouTube (unlisted), then paste the URL into Play Console.")


if __name__ == "__main__":
    main()
