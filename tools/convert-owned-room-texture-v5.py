"""Extract an owner-authored Gallaxys ornament; no third-party room atlas pixels."""
import argparse
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path('/var/www/gallaxys.com')
bundle = root / 'gamedata/bundled/effect/GxKissed.nitro'
generator = root / 'ferramentas-animacao/coracoes.py'
if bundle.stat().st_size > 1024 * 1024:
    raise ValueError('Bundle exceeds limit')
sys.path.insert(0, str(generator.parent))
import nitro
import coracoes
entries = nitro.unpack(str(bundle))
metadata = json.loads(entries['GxKissed.json'])
rect = metadata['spritesheet']['frames']['GxKissed_h_std_fx903_1_1_0_0']['frame']
with Image.open(io.BytesIO(entries['GxKissed.png'])) as sheet:
    image = sheet.convert('RGBA').crop((rect['x'], rect['y'], rect['x'] + rect['w'], rect['y'] + rect['h']))
expected = coracoes.coracao(True)
if image.size != (9, 8) or image.tobytes() != expected.tobytes():
    raise ValueError('Source does not match the owner-authored procedural drawing')
out = io.BytesIO()
native = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
native.paste(image, (3, 4))
native.save(out, format='PNG', optimize=True)
with args.output.open('xb') as target:
    target.write(out.getvalue())
print(json.dumps({'id': 'gallaxys-owned-heart-wall-v5', 'surface': 'wall',
    'url': '/client/assets/materials/v5/owned-heart.png', 'sha256': hashlib.sha256(out.getvalue()).hexdigest(),
    'rights': 'AUTHORIZED', 'provenance': str(bundle),
    'rightsEvidence': 'Owner migration authorization V5; pixels exactly reproduce coracoes.py original procedural drawing',
    'repeatScale': 2, 'overlayOpacity': 0.24, 'sourceBundleSha256': hashlib.sha256(bundle.read_bytes()).hexdigest(),
    'generatorSha256': hashlib.sha256(generator.read_bytes()).hexdigest(),
    'width': 16, 'height': 16, 'sourceDrawing': {'x': 3, 'y': 4, 'width': 9, 'height': 8},
    'adaptation': 'Avatar ornament adapted as a decorative wall overlay; transparent power-of-two padding, no new artwork; not the Habbo room atlas'}))
