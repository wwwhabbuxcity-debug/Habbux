import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveAvatarDirection, resolveMirroring } from '../src/renderer/avatar-direction.ts';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from '../src/renderer/avatar-animation.ts';
import { resolveAvatarFrameSelection } from '../src/renderer/avatar-assets.ts';
import { parseAvatarManifest } from '../src/renderer/avatar-manifest.ts';
import { avatarPartSpritePosition, resolveAvatarCompositionOffsetX, resolveAvatarFootAnchorX, resolveAvatarPartPlacement } from '../src/renderer/avatar-composition.ts';
import { avatarMovementDurationMs, interpolateAvatarElevation, interpolateAvatarPosition, isAdjacentAvatarStep, reconcileEntityIds } from '../src/renderer/renderer-model.ts';
import { avatarAnchor, floorSidePolygon, roomToScreen, screenToRoom, tilePolygon } from '../src/renderer/isometric.ts';
import { resolveRoomTileAtScreen } from '../src/renderer/tile-interaction.ts';
import type { RoomState } from '../src/room/room-state.ts';

test('velocidade usa 500 ms no cardinal e 707 ms no diagonal do grid', () => {
  assert.equal(avatarMovementDurationMs(1, 0), 500);
  assert.equal(avatarMovementDurationMs(0, -1), 500);
  assert.equal(avatarMovementDurationMs(1, 1), 707);
  assert.equal(avatarMovementDurationMs(-1, -1), 707);
  assert.equal(isAdjacentAvatarStep(1, 1), true);
  assert.equal(isAdjacentAvatarStep(2, 0), false);
});

test('caminhos longos preservam a duração de cada segmento', () => {
  assert.equal(Array.from({ length: 5 }, () => avatarMovementDurationMs(1, 0)).reduce((sum, value) => sum + value, 0), 2_500);
  assert.equal(Array.from({ length: 10 }, () => avatarMovementDurationMs(1, 0)).reduce((sum, value) => sum + value, 0), 5_000);
  assert.equal(Array.from({ length: 5 }, () => avatarMovementDurationMs(1, 1)).reduce((sum, value) => sum + value, 0), 3_535);
});

test('projeção isométrica volta ao tile original e gera losango fechado', () => {
  const config = { tileWidth: 64, tileHeight: 32, elevationHeight: 16, scale: 1.25, origin: { x: 120, y: 80 } } as const;
  const screen = roomToScreen(7, 3, 0, config);
  const room = screenToRoom(screen.x, screen.y, config);
  assert.ok(Math.abs(room.x - 7) < 0.000001);
  assert.ok(Math.abs(room.y - 3) < 0.000001);
  assert.equal(tilePolygon(screen, config).length, 4);
});

test('bordas do piso são extrudadas para baixo sem alterar o topo isométrico', () => {
  const top = tilePolygon({ x: 100, y: 80 });
  const side = floorSidePolygon(top, 'x', 8);
  assert.equal(side.length, 4);
  assert.equal(side[2].x, side[1].x);
  assert.equal(side[2].y - side[1].y, 8);
});

test('âncora do avatar coloca os pés no canto inferior do tile', () => {
  const anchor = avatarAnchor({ x: 100, y: 80 }, { tileWidth: 64, tileHeight: 32, elevationHeight: 16, scale: 1, origin: { x: 0, y: 0 } }, 7);
  assert.equal(anchor.x, 100);
  assert.equal(anchor.y, 89);
});

test('direção usa oito setores estáveis e as três direções espelhadas do manifest', () => {
  assert.deepEqual([
    resolveAvatarDirection(1, -1), resolveAvatarDirection(1, 0), resolveAvatarDirection(1, 1), resolveAvatarDirection(0, 1),
    resolveAvatarDirection(-1, 1), resolveAvatarDirection(-1, 0), resolveAvatarDirection(-1, -1), resolveAvatarDirection(0, -1),
  ], [1, 2, 3, 4, 5, 6, 7, 0]);
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
  assert.equal(animation.update(300, 4).frame, 0);
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

test('composição converte âncoras do manifesto para um canvas compartilhado', () => {
  const frame = { region: 'x', offset: { x: -20, y: 49 } } as const;
  const placement = resolveAvatarPartPlacement(frame, 25, 56);
  assert.deepEqual(placement, { x: 20, y: -49, width: 25, height: 56 });
  assert.deepEqual(avatarPartSpritePosition(placement), { x: 32.5, y: 7 });
  const feet = new Map([
    ['lg', resolveAvatarPartPlacement({ region: 'x', offset: { x: -21, y: 23 } }, 23, 24)],
    ['sh', resolveAvatarPartPlacement({ region: 'x', offset: { x: -21, y: 6 } }, 25, 11)],
  ]);
  assert.equal(resolveAvatarFootAnchorX(feet), 33.5);
  assert.equal(resolveAvatarCompositionOffsetX(33.5, false), -33.5);
  assert.equal(resolveAvatarCompositionOffsetX(33.5, true), 33.5);
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

test('hit test isométrico encontra tile, bloqueio e elevação sem divergir da projeção', () => {
  const room: RoomState = {
    roomId: '1', name: 'teste', capacity: 10, modelId: 'test', spawn: { x: 0, y: 0 }, door: { x: 0, y: 0, direction: 0 }, occupants: [],
    width: 3, height: 3, walkability: [true, true, true, true, true, true, true, true, true],
    elevations: [0, 0, -1, 0, 3, 0, 0, 0, 0],
  };
  const config = { tileWidth: 64, tileHeight: 32, elevationHeight: 16, scale: 1.25, origin: { x: 120, y: 80 } } as const;
  const elevated = roomToScreen(1, 1, 3, config);
  assert.deepEqual(resolveRoomTileAtScreen(elevated.x, elevated.y, room, config), { x: 1, y: 1, elevation: 3, walkable: true });
  const blockedRoom: RoomState = { ...room, walkability: [true, true, true, true, false, true, true, true, true] };
  assert.equal(resolveRoomTileAtScreen(elevated.x, elevated.y, blockedRoom, config)?.walkable, false);
  assert.equal(resolveRoomTileAtScreen(-100, -100, room, config), null);
});
