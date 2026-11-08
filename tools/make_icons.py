#!/usr/bin/env python3
"""Draw the Breach Squad app icon (original art: hazard-yellow shield with stencil chevrons)
and export Android launcher sizes plus Amazon store icons (512 and 114 px).
Usage: .venv/bin/python tools/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG, PANEL, HAZ, INK, LINE = (23, 26, 18), (45, 52, 32), (242, 182, 50), (36, 28, 5), (62, 71, 48)


def draw(n=1024):
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = n / 1024
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(200 * s), fill=PANEL)
    d.rounded_rectangle([40 * s, 40 * s, n - 40 * s, n - 40 * s], radius=int(170 * s), outline=LINE, width=int(14 * s))
    # shield
    shield = [(512, 150), (820, 250), (800, 560), (700, 760), (512, 880), (324, 760), (224, 560), (204, 250)]
    d.polygon([(x * s, y * s) for x, y in shield], fill=HAZ)
    inner = [(512, 205), (765, 288), (748, 548), (662, 722), (512, 820), (362, 722), (276, 548), (259, 288)]
    d.line([(x * s, y * s) for x, y in inner + inner[:1]], fill=INK, width=int(16 * s), joint="curve")
    # three stencil chevrons (rank stripes)
    for i, y in enumerate((330, 465, 600)):
        w = 190 - i * 12
        pts = [(512 - w, y), (512, y + 90), (512 + w, y), (512 + w, y + 70), (512, y + 160), (512 - w, y + 70)]
        d.polygon([(x * s, yy * s) for x, yy in pts], fill=INK)
        # stencil bridge gaps
        d.rectangle([(505 * s, (y + 80) * s), (519 * s, (y + 165) * s)], fill=HAZ)
    return im


def main():
    big = draw()
    res = ROOT / "android/app/src/main/res"
    for folder, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        out = res / f"mipmap-{folder}"
        out.mkdir(parents=True, exist_ok=True)
        big.resize((px, px), Image.LANCZOS).save(out / "ic_launcher.png")
    store = ROOT / "store"
    store.mkdir(exist_ok=True)
    big.resize((512, 512), Image.LANCZOS).save(store / "icon-512.png")
    big.resize((114, 114), Image.LANCZOS).save(store / "icon-114.png")
    print("icons written")


if __name__ == "__main__":
    main()
