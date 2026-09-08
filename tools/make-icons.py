#!/usr/bin/env python3
"""Generates the Marketplace listing graphics.

The Google Workspace Marketplace requires 32x32 and 128x128 application icons
and a 220x140 card banner. Rather than commit binaries with no source, the
artwork is defined here as signed-distance shapes and rasterised with 4x4
supersampling, so it can be re-rendered at any size or recoloured in one place.

Usage:  python3 tools/make-icons.py
Output: assets/icon-32.png, icon-48.png, icon-96.png, icon-128.png,
        assets/banner-220x140.png
"""

import math
import os
import struct
import zlib

BLUE = (26, 115, 232)      # Google blue 600, matches the on-slide play control
DEEP = (13, 71, 161)       # Darker blue for the banner gradient
WHITE = (255, 255, 255)
SUPERSAMPLE = 4

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir)
ASSETS = os.path.join(ROOT, "assets")


def rounded_rect(px, py, x0, y0, x1, y1, radius):
    """Signed distance to a rounded rectangle; negative inside."""
    half_w = (x1 - x0) / 2.0
    half_h = (y1 - y0) / 2.0
    cx = x0 + half_w
    cy = y0 + half_h
    dx = abs(px - cx) - (half_w - radius)
    dy = abs(py - cy) - (half_h - radius)
    outside = math.hypot(max(dx, 0.0), max(dy, 0.0))
    inside = min(max(dx, dy), 0.0)
    return outside + inside - radius


def capsule(px, py, x0, y0, x1, y1, radius):
    """Signed distance to a line segment thickened by radius."""
    vx, vy = x1 - x0, y1 - y0
    wx, wy = px - x0, py - y0
    length_sq = vx * vx + vy * vy
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / length_sq))
    return math.hypot(wx - t * vx, wy - t * vy) - radius


def arc(px, py, cx, cy, radius, thickness, start_deg, end_deg):
    """Signed distance to an annulus limited to an angular wedge."""
    angle = math.degrees(math.atan2(py - cy, px - cx))
    if angle < 0:
        angle += 360.0
    lo, hi = start_deg % 360.0, end_deg % 360.0
    inside_wedge = lo <= angle <= hi if lo <= hi else (angle >= lo or angle <= hi)
    if not inside_wedge:
        return 1e6
    return abs(math.hypot(px - cx, py - cy) - radius) - thickness / 2.0


def microphone(px, py, cx, cy, unit):
    """Signed distance to the microphone glyph, sized in `unit` pixels."""
    body = capsule(px, py, cx, cy - 0.30 * unit, cx, cy - 0.02 * unit, 0.17 * unit)
    cradle = arc(px, py, cx, cy - 0.02 * unit, 0.34 * unit, 0.09 * unit, 0, 180)
    stem = capsule(px, py, cx, cy + 0.32 * unit, cx, cy + 0.46 * unit, 0.045 * unit)
    base = capsule(px, py, cx - 0.20 * unit, cy + 0.50 * unit,
                   cx + 0.20 * unit, cy + 0.50 * unit, 0.045 * unit)
    return min(body, cradle, stem, base)


def blend(dst, src, alpha):
    """Alpha-blends one RGB colour over another."""
    return tuple(int(round(d + (s - d) * alpha)) for d, s in zip(dst, src))


def render(width, height, shader):
    """Rasterises `shader(x, y) -> (rgb, alpha)` with supersampling."""
    pixels = []
    step = 1.0 / SUPERSAMPLE
    offset = step / 2.0
    samples = SUPERSAMPLE * SUPERSAMPLE
    for y in range(height):
        row = []
        for x in range(width):
            r = g = b = a = 0.0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    px = x + offset + sx * step
                    py = y + offset + sy * step
                    colour, alpha = shader(px, py)
                    r += colour[0] * alpha
                    g += colour[1] * alpha
                    b += colour[2] * alpha
                    a += alpha
            if a == 0:
                row.append((0, 0, 0, 0))
            else:
                row.append((int(round(r / a)), int(round(g / a)), int(round(b / a)),
                            int(round(255 * a / samples))))
        pixels.append(row)
    return pixels


def write_png(path, pixels):
    """Writes RGBA pixel rows as a PNG."""
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type: none
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        out = struct.pack(">I", len(data)) + tag + data
        return out + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def coverage(distance):
    """Converts a signed distance to antialiased coverage."""
    return 1.0 if distance <= 0 else 0.0


def icon_shader(size):
    """Builds the shader for a square app icon."""
    radius = size * 0.22
    unit = size * 0.52
    cx = size / 2.0
    cy = size * 0.47

    def shader(x, y):
        if rounded_rect(x, y, 0, 0, size, size, radius) > 0:
            return (0, 0, 0), 0.0
        if microphone(x, y, cx, cy, unit) <= 0:
            return WHITE, 1.0
        return BLUE, 1.0

    return shader


def banner_shader(width, height):
    """Builds the shader for the 220x140 card banner."""
    unit = height * 0.52
    cx = width * 0.34
    cy = height * 0.47

    def shader(x, y):
        if microphone(x, y, cx, cy, unit) <= 0:
            return WHITE, 1.0
        for index in range(3):
            radius = unit * (0.62 + 0.22 * index)
            if arc(x, y, cx, cy, radius, unit * 0.075, 300, 60) <= 0:
                return WHITE, 0.85 - 0.2 * index
        mix = (x / width) * 0.55 + (y / height) * 0.2
        return blend(BLUE, DEEP, min(1.0, mix)), 1.0

    return shader


def main():
    os.makedirs(ASSETS, exist_ok=True)
    for size in (32, 48, 96, 128):
        path = os.path.join(ASSETS, "icon-%d.png" % size)
        write_png(path, render(size, size, icon_shader(size)))
        print("wrote", os.path.relpath(path, ROOT))
    path = os.path.join(ASSETS, "banner-220x140.png")
    write_png(path, render(220, 140, banner_shader(220, 140)))
    print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
