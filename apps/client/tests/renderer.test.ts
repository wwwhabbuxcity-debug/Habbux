import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveAvatarDirection, resolveMirroring } from '../src/renderer/avatar-direction.ts';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from '../src/renderer/avatar-animation.ts';
import { resolveAvatarFrameSelection } from '../src/renderer/avatar-assets.ts';
import { parseAvatarManifest } from '../src/renderer/avatar-manifest.ts';
import { interpolateAvatarElevation, interpolateAvatarPosition, reconcileEntityIds } from '../src/renderer/renderer-model.ts';
import { roomToScreen, screenToRoom, tilePolygon } from '../src/renderer/isometric.ts';

test('projeção isométrica volta ao tile original e gera losango fechado', () => {
  const config = { tileWidth: 64, tileHeight: 32, elevationHeight: 16, scale: 1.25, origin: { x: 120, y: 80 } } as const;
  const screen = roomToScreen(7, 3, 0, config);
  const room = screenToRoom(screen.x, screen.y, config);
  assert.ok(Math.abs(room.x - 7) < 0.000001);
  assert.ok(Math.abs(room.y - 3) < 0.000001);
  assert.equal(tilePolygon(screen, config).length, 4);
});

test('direção usa oito setores estáveis e as três direções espelhadas do manifest', () => {
  assert.deepEqual([
    resolveAvatarDirection(1, -1), resolveAvatarDirection(1, 0), resolveAvatarDirection(1, 1), resolveAvatarDirection(0, 1),
    resolveAvatarDirection(-1, 1), resolveAvatarDirection(-1, 0), resolveAvatarDirection(-1, -1), resolveAvatarDirection(0, -1),
  ], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([resolveMirroring(4), resolveMirroring(5), resolveMirroring(6), resolveMirroring(0)], [
    { renderDirection: 2, mirrored: true }, { renderDirection: 1, mirrored: true },
    { renderDirection: 0, mirrored: true }, { renderDirection: 0, mirrored: false },
  ]);
});

test('animação de caminhada usa clock compartilhado e não cria timer por avatar', () => {
  const animation = new AvatarAnimationController(100);
  animation.setMoving(true);
  assert.equal(animation.update(99, 4).frame, 0);
  assert.equal(animation.update(1, 4).frame, 1);
  assert.equal(animation.update(300, 4).frame, 3);
  animation.setMoving(false);
  assert.deepEqual(animation.snapshot(), { action: 'std', frame: 0, elapsedMs: 0 });
});

test('animação percorre os quatro frames durante um passo autoritativo', () => {
  const animation = new AvatarAnimationController(WALK_FRAME_DURATION_MS);
  animation.setMoving(true);
  assert.equal(animation.update(WALK_FRAME_DURATION_MS - 1, 4).frame, 0);
  assert.equal(animation.update(1, 4).frame, 1);
  assert.equal(animation.update(WALK_FRAME_DURATION_MS * 2, 4).frame, 3);
  assert.equal(animation.update(WALK_FRAME_DURATION_MS, 4).frame, 0);
});

test('ciclo WALK continua após uma atualização de posição sem reiniciar no frame 0', () => {
  const animation = new AvatarAnimationController(WALK_FRAME_DURATION_MS);
  animation.setMoving(true);
  animation.update(WALK_FRAME_DURATION_MS * 2, 4);
  assert.equal(animation.snapshot().frame, 2);
  animation.setMoving(false);
  animation.setMoving(true);
  assert.equal(animation.snapshot().frame, 2);
});

test('manifest normalizado valida sheets, regiões, layers, direções e frames sem /tmp em runtime', async () => {
  const file = resolve(process.cwd(), 'apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json');
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
  const manifest = parseAvatarManifest(parsed);
  assert.equal(Object.keys(manifest.sheets).length, 6);
  assert.equal(manifest.layerOrder.length, 11);
  assert.equal(Object.keys(manifest.regions).length, 264);
  assert.equal(manifest.directions.count, 8);
  assert.ok(manifest.parts.bd.actions.std?.genders.male.directions['0']?.frames['0']);
});

test('interpolação termina exatamente no destino e respeita os limites', () => {
  assert.equal(typeof interpolateAvatarPosition(0, 0, 1, 1, 0.5).x, 'number');
  assert.deepEqual(interpolateAvatarPosition(2, 4, 3, 5, 1), { x: 3, y: 5 });
  assert.equal(interpolateAvatarPosition(2, 4, 3, 5, -1).x, 2);
  assert.equal(interpolateAvatarElevation(0, 3, 0.5), 1.5);
  assert.equal(interpolateAvatarElevation(0, 3, 1), 3);
});

test('partes sem WALK permanecem visíveis e respeitam direções frontais do manifesto', async () => {
  const file = resolve(process.cwd(), 'apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json');
  const manifest = parseAvatarManifest(JSON.parse(await readFile(file, 'utf8')));
  const head = resolveAvatarFrameSelection(manifest, 'male', 'hd', 'wlk', 1, 3);
  const faceBack = resolveAvatarFrameSelection(manifest, 'male', 'fc', 'std', 7, 0);
  assert.ok(head, 'hd deve usar o frame std durante wlk');
  assert.equal(head?.frame.region.includes(':h_std_hd_'), true);
  assert.equal(faceBack, undefined, 'face não deve ser inventada em direção traseira');
});

test('corpo, pernas e sapatos têm quatro regiões WALK distintas nas oito direções', async () => {
  const file = resolve(process.cwd(), 'apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json');
  const manifest = parseAvatarManifest(JSON.parse(await readFile(file, 'utf8')));
  for (const part of ['bd', 'lg', 'sh'] as const) {
    const action = manifest.parts[part].actions.wlk;
    assert.ok(action, `${part} precisa de WALK`);
    for (const gender of ['male', 'female'] as const) {
      for (let direction = 0; direction < 8; direction++) {
        const selected = [...Array(4).keys()].map((frame) => resolveAvatarFrameSelection(manifest, gender, part, 'wlk', direction, frame));
        assert.ok(selected.every(Boolean), `${part}/${gender}/${direction} tem frame ausente`);
        assert.equal(new Set(selected.map((frame) => frame!.frame.region)).size, 4, `${part}/${gender}/${direction} repete região WALK`);
      }
    }
  }
});

test('reconciliação remove entidades que saíram e preserva as que continuam na sala', () => {
  assert.deepEqual(reconcileEntityIds(['a', 'b'], ['b', 'c']), { added: ['c'], removed: ['a'] });
});
