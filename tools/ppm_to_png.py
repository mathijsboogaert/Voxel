#!/usr/bin/env python3
"""Convert a binary PPM (P6) image to PNG using only the stdlib (zlib)."""
import struct
import sys
import zlib


def read_ppm(path):
    with open(path, "rb") as f:
        data = f.read()
    if not data.startswith(b"P6"):
        raise ValueError("not a binary PPM (P6) file")
    # Tokenize the header, skipping comments, up to the 4th token (maxval),
    # then a single whitespace byte precedes the pixel data.
    pos = 2
    tokens = []
    while len(tokens) < 3:
        while data[pos] in b" \t\r\n":
            pos += 1
        if data[pos:pos + 1] == b"#":
            while data[pos] not in b"\r\n":
                pos += 1
            continue
        start = pos
        while data[pos] not in b" \t\r\n":
            pos += 1
        tokens.append(data[start:pos])
    width, height, maxval = (int(t) for t in tokens)
    pos += 1  # single whitespace byte before pixel data
    pixels = data[pos:pos + width * height * 3]
    return width, height, pixels


def write_png(path, width, height, rgb):
    def chunk(tag, payload):
        return (struct.pack(">I", len(payload)) + tag + payload +
                struct.pack(">I", zlib.crc32(tag + payload) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB

    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)  # no filter
        raw.extend(rgb[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)

    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} <in.ppm> <out.png>", file=sys.stderr)
        sys.exit(1)
    w, h, px = read_ppm(sys.argv[1])
    write_png(sys.argv[2], w, h, px)
    print(f"wrote {sys.argv[2]} ({w}x{h})")
