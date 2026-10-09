#!/usr/bin/env python3
"""Read bounded Nitro archive metadata; emit numeric facts, never bitmap files."""
import argparse
import hashlib
import json
import struct
import zlib
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=Path)
args = parser.parse_args()
if args.bundle.stat().st_size > 8 * 1024 * 1024:
    raise ValueError('Archive too large')
blob = args.bundle.read_bytes()
if len(blob) < 2 or len(blob) > 8 * 1024 * 1024:
    raise ValueError('Invalid archive size')
count = struct.unpack_from('>H', blob)[0]
if count > 256:
    raise ValueError('Too many archive entries')
offset = 2
metadata = None
for _ in range(count):
    if offset + 2 > len(blob):
        raise ValueError('Truncated archive entry')
    length = struct.unpack_from('>H', blob, offset)[0]
    offset += 2
    if offset + length + 4 > len(blob):
        raise ValueError('Truncated archive name')
    name = blob[offset:offset + length].decode('utf-8')
    offset += length
    length = struct.unpack_from('>I', blob, offset)[0]
    offset += 4
    if offset + length > len(blob):
        raise ValueError('Truncated archive payload')
    payload = blob[offset:offset + length]
    offset += length
    if name == 'room.json':
        decoder = zlib.decompressobj()
        raw = decoder.decompress(payload, 2 * 1024 * 1024)
        if not decoder.eof or decoder.unconsumed_tail or decoder.unused_data:
            raise ValueError('Metadata too large or invalid')
        metadata = json.loads(raw)
if metadata is None:
    raise ValueError('room.json missing')
result = {'sha256': hashlib.sha256(blob).hexdigest()}
for surface in ('floor', 'wall'):
    rows = []
    for plane in metadata['roomVisualization'][surface + 'Data']['planes']:
        view = next((v for v in plane['visualizations'] if v['size'] == 64), None)
        if view is None or len(view['allLayers']) != 1:
            continue
        layer = view['allLayers'][0]
        color = layer.get('color')
        if type(color) is int and 0 <= color <= 0xffffff:
            rows.append([plane['id'], layer['materialId'], color])
    result[surface] = rows
print(json.dumps(result, separators=(',', ':')))
