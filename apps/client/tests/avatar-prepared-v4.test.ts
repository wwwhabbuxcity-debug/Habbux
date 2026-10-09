import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Texture, TextureSource } from 'pixi.js';
import { createAvatarAssetProvider, resolveAvatarFrameSelection } from '../src/renderer/avatar-assets.ts';
import { parseAvatarManifest } from '../src/renderer/avatar-manifest.ts';
import { avatarPartSpritePosition, resolveAvatarPartPlacement } from '../src/renderer/avatar-composition.ts';

const manifest = parseAvatarManifest(JSON.parse(await readFile('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json', 'utf8')));
function sheet(url: string): Texture {
  const definition = Object.values(manifest.sheets).find(s => url.endsWith(s.src))!;
  return new Texture({ source: new TextureSource({ width: definition.width, height: definition.height }) });
}

test('tabela nativa preserva todos os frames, offsets, mirroring e posições em oito direções', async () => {
  const calls: string[] = [];
  const provider = createAvatarAssetProvider(manifest, 'https://example.test/avatar/', async url => { calls.push(url); return sheet(url); });
  for (const gender of ['male', 'female'] as const) {
    const first = provider.preload(gender);
    assert.equal(provider.preload(gender), first, 'preload concorrente compartilhado');
    await first;
    for (const part of manifest.layerOrder) for (const action of ['std', 'wlk'] as const) for (let direction = 0; direction < 8; direction++) for (let frame = 0; frame < 12; frame++) {
      const previous = resolveAvatarFrameSelection(manifest, gender, part, action, direction, frame);
      const prepared = provider.getFrame(gender, part, action, direction, frame);
      if (!previous) { assert.equal(prepared, undefined); continue; }
      assert.deepEqual(prepared!.frame, previous.frame);
      assert.equal(prepared!.mirrored, previous.mirrored);
      const region = manifest.regions[previous.frame.region]!;
      const position = avatarPartSpritePosition(resolveAvatarPartPlacement(previous.frame, region.width, region.height));
      assert.deepEqual({ x: prepared!.spriteX, y: prepared!.spriteY }, position);
      assert.equal(provider.getFrame(gender, part, action, direction, frame), prepared, 'sem alocação no lookup');
      assert.equal(provider.getFrame(gender, part, action, direction, frame + 4), prepared);
    }
  }
  assert.equal(new Set(calls).size, 7);
  assert.equal(calls.length, 7, 'sete atlas compartilhados entre todos os frames e gêneros');
  const frame = provider.getFrame('male', 'bd', 'std', 2, 0)!;
  provider.dispose();
  await Promise.resolve();
  assert.equal(frame.texture.destroyed, true);
  assert.equal(frame.texture.source.destroyed, false, 'fonte compartilhada não destruída');
  assert.equal(provider.getFrame('male', 'bd', 'std', 2, 0), undefined);
  await assert.rejects(provider.preload('male'), /disposed/);
  provider.dispose();
});

test('dispose durante carregamento não recria regiões nem deixa promessa rejeitada sem tratamento', async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const provider = createAvatarAssetProvider(manifest, 'https://example.test/avatar/', async url => { await gate; return sheet(url); });
  const result = assert.rejects(provider.preload('male'), /disposed/);
  provider.dispose();
  finish();
  await result;
  assert.equal(provider.getFrame('male', 'bd', 'std', 0, 0), undefined);
});

test('falha temporária permite novo preload sem perder o compartilhamento das fontes', async () => {
  let failed = false;
  const provider = createAvatarAssetProvider(manifest, 'https://example.test/avatar/', async url => {
    if (!failed) { failed = true; throw new Error('temporary failure'); }
    return sheet(url);
  });
  await assert.rejects(provider.preload('male'), /temporary failure/);
  await provider.preload('male');
  assert.ok(provider.getFrame('male', 'bd', 'wlk', 4, 2));
  provider.dispose();
});

test('compilação respeita quantidade de frames própria do material e limita entradas excessivas', async () => {
  const input = JSON.parse(await readFile('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json', 'utf8'));
  input.parts.bd.actions.wlk.frameCount = 3;
  for (const gender of ['male', 'female']) for (const direction of Object.values(input.parts.bd.actions.wlk.genders[gender].directions) as { frames: Record<string, unknown> }[]) delete direction.frames['3'];
  const shorter = parseAvatarManifest(input);
  const provider = createAvatarAssetProvider(shorter, 'https://example.test/avatar/', async url => sheet(url));
  await provider.preload('male');
  assert.equal(provider.getFrame('male', 'bd', 'wlk', 2, 4), provider.getFrame('male', 'bd', 'wlk', 2, 1));
  provider.dispose();
  input.parts.bd.actions.wlk.frameCount = 65;
  assert.throws(() => createAvatarAssetProvider(parseAvatarManifest(input), 'https://example.test/avatar/'), /native limit/);
});
