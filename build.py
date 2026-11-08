#!/usr/bin/env python3
"""Assemble dist/index.html (single self-contained file) from src/.

Usage: python3 build.py
Also writes dist/bundle_check.js so `node --check dist/bundle_check.js` can syntax-check the JS.
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
JS_ORDER = ["data.js", "world.js", "render.js", "render_world.js", "main.js"]

def read(name):
    return (SRC / name).read_text()


def inline_fonts():
    """src/fonts/fonts.css with each woff2 embedded as a data URI, so the game works fully offline."""
    fonts = SRC / "fonts"
    css = (fonts / "fonts.css").read_text()
    return re.sub(
        r"url\(([\w-]+\.woff2)\)",
        lambda m: "url(data:font/woff2;base64," + base64.b64encode((fonts / m.group(1)).read_bytes()).decode() + ")",
        css,
    )


def build():
    js = "'use strict';\n" + "".join(read(n) for n in JS_ORDER)
    fonts = "<style>\n" + inline_fonts() + "</style>"
    head = read("head.html").replace("<!--FONTS-->", fonts).replace("/*CSS*/", read("style.css").rstrip("\n"))
    html = head + "\n" + read("body.html") + "\n<script>\n" + js + "</script>\n</body>\n</html>\n"
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html)
    (DIST / "bundle_check.js").write_text(js)
    (DIST / "privacy.html").write_text(read("privacy.html"))
    print(f"dist/index.html  {len(html.encode()) / 1024:.1f} KB")


if __name__ == "__main__":
    build()
