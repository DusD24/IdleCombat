#!/usr/bin/env python3
"""Count player-troop (orange) pixels per frame in a clip -> CSV time series.

Usage: .venv/bin/python tools/troop_series.py footage/clip.mp4 [fps] > out.csv
Frames are scaled to 300x480. UI bands (top HUD, bottom nav, right button column) are masked.
Columns: t, orange (whole field), orange_top (upper half = near the enemy wall), orange_bot.
"""
import subprocess, sys
import numpy as np

W, H = 300, 480


def frames(path, fps):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = W * H * 3
    i = 0
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        yield i / fps, np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        i += 1


def orange_mask(rgb):
    f = rgb.astype(np.float32) / 255
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx, mn = f.max(-1), f.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # hue for r-max pixels
    h = np.where(mx == r, (60 * (g - b) / np.maximum(mx - mn, 1e-6)) % 360, -1)
    return (h >= 8) & (h <= 32) & (s > .8) & (mx > .75)


def main():
    path = sys.argv[1]
    fps = float(sys.argv[2]) if len(sys.argv) > 2 else 2
    print("t,orange,orange_top,orange_bot")
    for t, fr in frames(path, fps):
        m = orange_mask(fr)
        m[:40] = False          # resource HUD
        m[-45:] = False         # bottom nav
        m[:, -40:] = False      # right button column
        print(f"{t:.1f},{int(m.sum())},{int(m[:H // 2].sum())},{int(m[H // 2:].sum())}")


if __name__ == "__main__":
    main()
