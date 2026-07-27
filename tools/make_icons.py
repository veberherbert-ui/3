#!/usr/bin/env python3
"""Генерация простых PNG-иконок расширения (фиолетовый круг с лупой) без сторонних библиотек."""
import struct
import zlib
import os

PURPLE = (150, 94, 235)
WHITE = (255, 255, 255)
BG = (0, 0, 0, 0)  # прозрачный


def draw(size):
    cx = cy = (size - 1) / 2.0
    r = size * 0.46
    # Параметры лупы
    ring_cx = size * 0.44
    ring_cy = size * 0.42
    ring_r = size * 0.20
    ring_w = max(1.0, size * 0.06)
    px = bytearray()
    for y in range(size):
        px.append(0)  # filter byte per scanline
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > r:
                px += bytes((0, 0, 0, 0))
                continue
            # фон-круг
            color = list(PURPLE) + [255]
            # кольцо лупы
            rd = ((x - ring_cx) ** 2 + (y - ring_cy) ** 2) ** 0.5
            if abs(rd - ring_r) <= ring_w:
                color = list(WHITE) + [255]
            # ручка лупы (диагональная линия)
            # линия от (ring_cx+ring_r*cos45, ...) к нижнему правому
            hx0 = ring_cx + ring_r * 0.7071
            hy0 = ring_cy + ring_r * 0.7071
            hx1 = size * 0.74
            hy1 = size * 0.72
            # расстояние точки до отрезка
            vx, vy = hx1 - hx0, hy1 - hy0
            seglen2 = vx * vx + vy * vy
            if seglen2 > 0:
                t = max(0.0, min(1.0, ((x - hx0) * vx + (y - hy0) * vy) / seglen2))
                lx = hx0 + t * vx
                ly = hy0 + t * vy
                ld = ((x - lx) ** 2 + (y - ly) ** 2) ** 0.5
                if ld <= ring_w * 0.75:
                    color = list(WHITE) + [255]
            px += bytes(color)
    return bytes(px)


def write_png(path, size):
    raw = draw(size)
    comp = zlib.compress(raw, 9)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for s in (16, 48, 128):
        write_png(os.path.join(out, f"icon{s}.png"), s)
        print("wrote icon%d.png" % s)
