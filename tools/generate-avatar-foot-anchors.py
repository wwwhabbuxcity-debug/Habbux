#!/usr/bin/env python3
"""Register a fixed foot support point from existing STAND shoe pixels.
Offline only: no body bounds, WALK frame bounds, or external assets are read.
Each opaque column contributes its lower pixel edge. Their mean defines support
between both soles, rather than the lowest toe or the centre of the body.
"""
import json
from pathlib import Path
from PIL import Image

base = Path(__file__).resolve().parents[1] / 'apps/client/public/assets/avatar/v1'
path = base / 'manifest/avatar-manifest-v1.json'
manifest = json.loads(path.read_text())
shoe = manifest['parts']['sh']
image = Image.open(base / manifest['sheets'][shoe['sheet']]['src']).convert('RGBA')
genders = {}
for gender in ['male', 'female']:
    anchors = {}
    for direction in range(8):
        frame = shoe['actions']['std']['genders'][gender]['directions'][str(direction)]['frames']['0']
        r = manifest['regions'][frame['region']]
        samples = []
        for x in range(r['width']):
            rows = [y for y in range(r['height']) if image.getpixel((r['x'] + x, r['y'] + y))[3] >= 128]
            if rows:
                samples.append((x + 0.5, max(rows) + 1))
        assert samples, frame['region']
        anchors[str(direction)] = {
            'x': round(-frame['offset']['x'] + sum(x for x, y in samples) / len(samples), 12),
            'y': round(-frame['offset']['y'] + sum(y for x, y in samples) / len(samples), 12),
            'referenceRegion': frame['region'],
            'sampleCount': len(samples),
        }
    genders[gender] = anchors
manifest['footAnchors'] = {'method': 'stand-shoe-sole-lower-contour-v1', 'genders': genders}
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('Fixed support references: 16; all WALK frames use their STAND reference.')
