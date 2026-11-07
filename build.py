#!/usr/bin/env python3
"""Assemble dist/index.html (single self-contained file) from src/.

Usage: python3 build.py
Also writes dist/bundle_check.js so `node --check dist/bundle_check.js` can syntax-check the JS.
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
JS_ORDER = ["data.js", "world.js", "render.js", "render_world.js", "main.js"]

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700;800&family=Saira+Stencil+One&display=swap">'
)


def read(name):
    return (SRC / name).read_text()


def build():
    js = "'use strict';\n" + "".join(read(n) for n in JS_ORDER)
    head = read("head.html").replace("<!--FONTS-->", FONTS).replace("/*CSS*/", read("style.css").rstrip("\n"))
    html = head + "\n" + read("body.html") + "\n<script>\n" + js + "</script>\n</body>\n</html>\n"
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html)
    (DIST / "bundle_check.js").write_text(js)
    print(f"dist/index.html  {len(html.encode()) / 1024:.1f} KB")


if __name__ == "__main__":
    build()
