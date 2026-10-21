"""A small, fast NBT reader for chunk data (standard library only).

Chunks are big, but a map only needs a few things from each one, so long arrays are returned as raw
bytes (decoded on demand) instead of Python lists. Minecraft 26.3 can write a list of block states in
which plain states are bare strings and customised ones are compounds; NBT lists cannot mix types, so
the strings arrive wrapped as {"": "minecraft:stone"}. Both shapes are handled by the callers.
"""

import struct

END, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, BYTE_ARRAY, STRING, LIST, COMPOUND, INT_ARRAY, LONG_ARRAY = range(13)

_u16 = struct.Struct('>H').unpack_from
_i32 = struct.Struct('>i').unpack_from


def parse(data):
    """Parse a full NBT document (a root compound with a name) into a dict."""
    if data[0] != COMPOUND:
        raise ValueError('not a compound')
    n = _u16(data, 1)[0]
    value, _ = _compound(data, 3 + n)
    return value


def _string(data, pos):
    n = _u16(data, pos)[0]
    pos += 2
    return data[pos : pos + n].decode('utf-8', 'replace'), pos + n


def _payload(data, pos, tag):
    if tag == BYTE:
        return struct.unpack_from('>b', data, pos)[0], pos + 1
    if tag == SHORT:
        return struct.unpack_from('>h', data, pos)[0], pos + 2
    if tag == INT:
        return _i32(data, pos)[0], pos + 4
    if tag == LONG:
        return struct.unpack_from('>q', data, pos)[0], pos + 8
    if tag == FLOAT:
        return struct.unpack_from('>f', data, pos)[0], pos + 4
    if tag == DOUBLE:
        return struct.unpack_from('>d', data, pos)[0], pos + 8
    if tag == STRING:
        return _string(data, pos)
    if tag == COMPOUND:
        return _compound(data, pos)
    if tag == LIST:
        item = data[pos]
        n = _i32(data, pos + 1)[0]
        pos += 5
        out = []
        for _ in range(n):
            v, pos = _payload(data, pos, item)
            out.append(v)
        return out, pos
    if tag == BYTE_ARRAY:
        n = _i32(data, pos)[0]
        return bytes(data[pos + 4 : pos + 4 + n]), pos + 4 + n
    if tag == INT_ARRAY:
        n = _i32(data, pos)[0]
        return bytes(data[pos + 4 : pos + 4 + 4 * n]), pos + 4 + 4 * n
    if tag == LONG_ARRAY:
        n = _i32(data, pos)[0]
        return bytes(data[pos + 4 : pos + 4 + 8 * n]), pos + 4 + 8 * n  # raw big-endian longs
    raise ValueError(f'unknown tag {tag}')


def _compound(data, pos):
    out = {}
    while True:
        tag = data[pos]
        pos += 1
        if tag == END:
            return out, pos
        key, pos = _string(data, pos)
        out[key], pos = _payload(data, pos, tag)
