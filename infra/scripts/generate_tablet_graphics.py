from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"C:\Project-Price")
OUT_DIR = ROOT / "apps" / "mobile" / "assets" / "images" / "play_console" / "tablet_10inch"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PHOTO_PATHS = [
    Path(r"J:\My Drive\Marketing\Example photos\IMG_6139.PNG"),
    Path(r"J:\My Drive\Marketing\Example photos\IMG_6136.PNG"),
    Path(r"J:\My Drive\Marketing\Example photos\IMG_6138.PNG"),
    Path(r"J:\My Drive\Marketing\Example photos\IMG_6137.PNG"),
]

W, H = 1920, 1080  # 16:9 compliant for 10-inch tablet screenshots


def pick_font(size: int, bold: bool = False):
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for c in candidates:
        p = Path(c)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
    return ImageFont.load_default()


def fill_16_9(img: Image.Image) -> Image.Image:
    src = img.convert("RGB")
    src_ratio = src.width / src.height
    dst_ratio = W / H
    if src_ratio > dst_ratio:
        crop_w = int(src.height * dst_ratio)
        left = (src.width - crop_w) // 2
        src = src.crop((left, 0, left + crop_w, src.height))
    else:
        crop_h = int(src.width / dst_ratio)
        top = (src.height - crop_h) // 2
        src = src.crop((0, top, src.width, top + crop_h))
    return src.resize((W, H), Image.Resampling.LANCZOS)


def add_brand_overlay(base: Image.Image, title: str, subtitle: str) -> Image.Image:
    img = base.copy()
    draw = ImageDraw.Draw(img, "RGBA")

    # Top gradient panel substitute
    draw.rectangle([(0, 0), (W, 210)], fill=(0, 0, 0, 120))

    title_font = pick_font(74, bold=True)
    sub_font = pick_font(40, bold=False)
    pill_font = pick_font(30, bold=True)

    draw.text((70, 40), "Project Price", font=title_font, fill=(255, 198, 50, 255))
    draw.text((70, 130), subtitle, font=sub_font, fill=(255, 255, 255, 240))

    # CTA pill
    pill_text = "Get Instant Estimates"
    bbox = draw.textbbox((0, 0), pill_text, font=pill_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    px, py = 70, H - 130
    draw.rounded_rectangle([(px, py), (px + tw + 56, py + th + 28)], radius=20, fill=(15, 22, 34, 220))
    draw.text((px + 28, py + 12), pill_text, font=pill_font, fill=(255, 255, 255, 255))

    # Tablet-style app panel on right
    panel_w, panel_h = 560, 780
    panel_x, panel_y = W - panel_w - 90, 150
    draw.rounded_rectangle(
        [(panel_x, panel_y), (panel_x + panel_w, panel_y + panel_h)],
        radius=36,
        fill=(255, 255, 255, 232),
        outline=(28, 37, 56, 190),
        width=4,
    )
    draw.rectangle([(panel_x + 40, panel_y + 90), (panel_x + panel_w - 40, panel_y + 130)], fill=(236, 240, 246, 255))
    draw.rectangle([(panel_x + 40, panel_y + 160), (panel_x + panel_w - 80, panel_y + 196)], fill=(236, 240, 246, 255))
    draw.rectangle([(panel_x + 40, panel_y + 230), (panel_x + panel_w - 120, panel_y + 266)], fill=(236, 240, 246, 255))
    draw.rounded_rectangle([(panel_x + 40, panel_y + 320), (panel_x + panel_w - 40, panel_y + 410)], radius=16, fill=(255, 198, 50, 255))
    draw.text((panel_x + 72, panel_y + 346), title, font=pick_font(34, bold=True), fill=(25, 31, 45, 255))

    return img


def save_jpg(img: Image.Image, path: Path):
    img.save(path, format="JPEG", quality=92, optimize=True)


def main():
    photos = [p for p in PHOTO_PATHS if p.exists()]
    if not photos:
        raise FileNotFoundError("No source photos were found in J: drive path.")

    # Feature-style tablet hero graphic (16:9 for screenshot usage)
    hero_base = fill_16_9(Image.open(photos[0]))
    hero = add_brand_overlay(hero_base, "Kitchen Remodel", "Compare trusted contractor pricing in minutes")
    hero_path = OUT_DIR / "tablet_10in_feature_1920x1080.jpg"
    save_jpg(hero, hero_path)

    captions = [
        ("Snap Your Space", "Upload kitchen photos and project details instantly"),
        ("Smart Cost Ranges", "See realistic low-to-high remodel estimates"),
        ("Compare Pros Fast", "Review quotes and choose your best fit"),
        ("Track Every Step", "Stay on budget with clear progress visibility"),
        ("Save Project History", "Keep your renovation records in one place"),
        ("Move From Idea To Build", "Plan confidently with data-backed insights"),
    ]

    for i in range(8):
        base = fill_16_9(Image.open(photos[i % len(photos)]))
        title, sub = captions[i % len(captions)]
        img = add_brand_overlay(base, title, sub)
        out = OUT_DIR / f"tablet_10in_screenshot_{i+1:02d}_1920x1080.jpg"
        save_jpg(img, out)

    print("Generated files:")
    for p in sorted(OUT_DIR.glob("*.jpg")):
        size_mb = p.stat().st_size / (1024 * 1024)
        with Image.open(p) as im:
            print(f"- {p} => {im.width}x{im.height}, {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
