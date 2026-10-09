"""Convert owner-declared room PNGs and numeric room metadata into native Habbux assets.

Source stays read-only. An existing output directory is never overwritten.
No Nitro decoder, external downloads, generated artwork, or runtime GPL code.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

QUESTION = ('Para resolver as pendências específicas de origem: os mapas custom_9, custom_10 e custom_13 foram criados por você? '
            'E os PNGs de pisos/paredes do Gallaxys são arte própria sua ou vieram do pacote Habbo/Octane? '
            'A autorização de acesso e migração dos seus recursos já está registrada.')
STATEMENT = 'ambos sao meu pode fazer total acesso'
EVIDENCE = 'OWNER_DECLARED_OWNED: ' + STATEMENT + '; answer to recorded explicit question about floor/wall PNG authorship'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def convert(source, output, typescript_output):
    if output.exists() or typescript_output.exists():
        raise ValueError('Output already exists; inspect and choose a new destination')
    raw = (source / 'room.asset.json').read_bytes()
    license_bytes = (source.parents[4] / 'LICENSE').read_bytes()
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('Metadata exceeds bound')
    metadata = json.loads(raw)
    resources, materials, planes, files = [], [], [], []
    for surface in ('floor', 'wall'):
        data = metadata['roomVisualization'][surface + 'Data']
        texture_by_id = {}
        for texture in data['textures']:
            if len(texture['bitmaps']) != 1:
                raise ValueError('Multiple bitmaps require explicit conversion: ' + texture['id'])
            asset = texture['bitmaps'][0]['assetName']
            if asset not in metadata['assets'] or '/' in asset or not asset.startswith(surface + '_texture_'):
                raise ValueError('Invalid or missing source asset')
            path = source / 'images' / ('room_' + asset + '.png')
            original = path.read_bytes()
            if len(original) > 1024 * 1024:
                raise ValueError('Source PNG exceeds 1 MiB')
            with Image.open(io.BytesIO(original)) as image:
                if image.format != 'PNG' or max(image.size) > 1024:
                    raise ValueError('Unsupported room image')
                rgba = image.convert('RGBA')
                native = io.BytesIO()
                rgba.save(native, format='PNG', optimize=True)
            encoded = native.getvalue()
            with Image.open(io.BytesIO(encoded)) as check:
                if check.convert('RGBA').tobytes() != rgba.tobytes() or check.size != rgba.size:
                    raise ValueError('Native conversion changed source pixels')
            filename = texture['id'].replace('_', '-') + '.png'
            resource = {
                'id': 'gallaxys-room-' + texture['id'].replace('_', '-') + '-v5',
                'surface': surface, 'url': '/client/assets/materials/v5/classic/' + filename,
                'sha256': digest(encoded), 'rights': 'AUTHORIZED', 'provenance': str(path),
                'rightsEvidence': EVIDENCE, 'repeatScale': rgba.width / 32,
                'verticalRepeatScale': rgba.height / (32 if surface == 'floor' else 16),
                'sourceTextureId': texture['id'], 'sourceAssetName': asset,
                'sourceSha256': digest(original), 'pixelSha256': digest(rgba.tobytes()),
                'width': rgba.width, 'height': rgba.height, 'pixelsPreserved': True,
                'sourceOffset': metadata['assets'][asset], 'ownershipStatus': 'OWNER_DECLARED_OWNED',
            }
            if not (0.25 <= resource['repeatScale'] <= 16 and 0.25 <= resource['verticalRepeatScale'] <= 16):
                raise ValueError('Native projection outside runtime bounds')
            resources.append(resource)
            texture_by_id[texture['id']] = resource
            files.append((filename, encoded))
        material_by_id = {}
        for material in data['materials']:
            matrices = material['matrices']
            if len(matrices) != 1 or len(matrices[0]['columns']) != 1:
                raise ValueError('Complex source material needs explicit conversion')
            column = matrices[0]['columns'][0]
            if len(column['cells']) != 1 or column['width'] != 32:
                raise ValueError('Unexpected material cell projection')
            texture_id = column['cells'][0]['textureId']
            if texture_id not in texture_by_id:
                raise ValueError('Material references missing image')
            material_by_id[material['id']] = texture_id
            materials.append({'surface': surface, 'id': material['id'], 'textureId': texture_id, 'columnWidth': 32})
        for plane in data['planes']:
            views = [v for v in plane['visualizations'] if v['size'] == 64]
            if len(views) != 1 or len(views[0]['allLayers']) != 1:
                raise ValueError('Unsupported source material plane')
            layer = views[0]['allLayers'][0]
            color = layer['color']
            if type(color) is not int or not 0 <= color <= 0xffffff:
                raise ValueError('Invalid plane color')
            planes.append({'surface': surface, 'id': plane['id'], 'color': color,
                           'materialId': layer['materialId'], 'textureId': material_by_id[layer['materialId']]})
    catalog = {'schemaVersion': 1, 'provenance': {'status': 'OWNER_DECLARED_OWNED', 'question': QUESTION,
               'ownerStatement': STATEMENT, 'sourceRoot': str(source), 'metadataSha256': digest(raw)},
               'textures': resources, 'materials': materials, 'planes': planes}
    # Finish validation before writing any output. Each PNG retains all source RGBA pixels.
    output.mkdir(parents=True)
    for filename, encoded in files:
        (output / filename).write_bytes(encoded)
    (output / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    (output / 'NOTICE.txt').write_text('Owner-declared Gallaxys floor and wall artwork.\n'
                                    + 'Question: ' + QUESTION + '\nOwner answer: ' + STATEMENT
                                    + '\nSource pixels preserved exactly; native PNG and numeric material catalog.\n'
                                    + 'Declaration is specific to these PNGs; it does not relicense unrelated third-party resources.\n')
    gpl_source = output / 'gpl-metadata-source'
    gpl_source.mkdir()
    (gpl_source / 'room.asset.json').write_bytes(raw)
    (gpl_source / 'COPYING').write_bytes(license_bytes)
    (gpl_source / 'convert-owned-room-materials-v5.py.txt').write_bytes(Path(__file__).read_bytes())
    (gpl_source / 'NOTICE.txt').write_text('Source room.asset.json from @octane/assets, whose package declares GPL-3.0.\n'
                                       + 'Full numeric metadata source, GPL text and converter supplied with converted material data.\n'
                                       + 'PNG ownership is separately OWNER_DECLARED_OWNED; no blanket graphics license inferred.\n'
                                       + 'Source metadata SHA-256: ' + digest(raw) + '\n')
    rows = [[r['surface'], r['sourceTextureId'], r['id'], r['url'], r['sha256'], r['sourceAssetName'],
             r['width'], r['height'], r['repeatScale'], r['verticalRepeatScale']] for r in resources]
    plane_rows = [[p['surface'], p['id'], p['materialId'], p['textureId'], p['color']] for p in planes]
    typescript = "import type { NativeRoomTextureResource } from './room-texture-resources';\n\n"
    typescript += '/** Generated by tools/convert-owned-room-materials-v5.py; native numeric metadata only. */\n'
    typescript += 'const sourceRoot = ' + json.dumps(str(source / 'images') + '/') + ';\n'
    typescript += 'const rightsEvidence = ' + json.dumps(EVIDENCE, ensure_ascii=False) + ';\n'
    typescript += 'const textureRows = ' + json.dumps(rows, separators=(',', ':')) + ' as const;\n'
    typescript += 'export interface NativeRoomMaterialTexture extends NativeRoomTextureResource { readonly sourceTextureId: string; readonly width: number; readonly height: number; }\n'
    typescript += 'export const GALLAXYS_NATIVE_ROOM_TEXTURES: readonly NativeRoomMaterialTexture[] = Object.freeze(textureRows.map(([surface,sourceTextureId,id,url,sha256,asset,width,height,repeatScale,verticalRepeatScale]) => Object.freeze({surface,sourceTextureId,id,url,sha256,rights:"AUTHORIZED" as const,provenance:sourceRoot+"room_"+asset+".png",rightsEvidence,width,height,repeatScale,verticalRepeatScale})));\n'
    typescript += 'const planeRows = ' + json.dumps(plane_rows, separators=(',', ':')) + ' as const;\n'
    typescript += 'export interface NativeRoomMaterialPlane { readonly surface: "floor" | "wall"; readonly id: string; readonly materialId: string; readonly textureId: string; readonly color: number; }\n'
    typescript += 'export const GALLAXYS_NATIVE_ROOM_PLANES: readonly NativeRoomMaterialPlane[] = Object.freeze(planeRows.map(([surface,id,materialId,textureId,color]) => Object.freeze({surface,id,materialId,textureId,color})));\n'
    typescript_output.parent.mkdir(parents=True, exist_ok=True)
    typescript_output.write_text(typescript)
    return {'floorImages': sum(r['surface'] == 'floor' for r in resources),
            'wallImages': sum(r['surface'] == 'wall' for r in resources),
            'floorVariants': sum(p['surface'] == 'floor' for p in planes),
            'wallVariants': sum(p['surface'] == 'wall' for p in planes),
            'metadataSha256': digest(raw), 'catalogSha256': digest((output / 'catalog.json').read_bytes()),
            'pixelsPreserved': len(resources), 'totalNativePngBytes': sum(len(encoded) for _, encoded in files)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path('/var/www/gallaxys.com/Octane-Renderer/packages/assets/src/assets/room'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--typescript-output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(convert(args.source, args.output, args.typescript_output), indent=2))
