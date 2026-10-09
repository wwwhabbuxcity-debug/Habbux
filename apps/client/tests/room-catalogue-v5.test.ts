import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoomCatalogueV5 } from '../src/bootstrap/room-catalogue-v5.ts';

test('player accepts every real V5 catalogue entry and matches Java virtual model order', () => {
  const catalogue = parseRoomCatalogueV5(readFileSync('apps/client/public/assets/rooms/v5/catalogue.json', 'utf8'));
  const modelIds = ['room-models-v1/models.tsv', 'room-models-v3/originals.tsv',
    'room-models-v5/gallaxys-gpl.tsv', 'room-models-v5/gallaxys-owned.tsv'].flatMap(file =>
    readFileSync(`apps/emulator/src/main/resources/${file}`, 'utf8').split('\n')
      .filter(row => row && !row.startsWith('#')).map(row => row.split('\t')[0]!));
  assert.equal(catalogue.length, 62);
  assert.equal(modelIds.length, 127);
  const fixtures = JSON.parse(readFileSync('docs/gallaxys-migration-v5/model-fixtures.json', 'utf8')) as
    {roomId: string; modelId: string}[];
  for (const fixture of fixtures) {
    assert.ok(catalogue.some(entry => entry.roomId === fixture.roomId), fixture.modelId);
    const ordinal = Number(BigInt(fixture.roomId) - 9_000_000_000_000_000_000n);
    assert.equal(modelIds[ordinal - 1], fixture.modelId);
  }
  for (const id of ['9000000000000000125', '9000000000000000126', '9000000000000000127']) {
    assert.ok(catalogue.some(entry => entry.roomId === id), id);
  }
});

test('catalogue bounds reject unavailable IDs, duplicates and oversized data', () => {
  const entry = {roomId: '9000000000000000127', name: 'Custom 13'};
  for (const roomId of ['9000000000000000063', '9000000000000000128', '9000000000000000127x']) {
    assert.throws(() => parseRoomCatalogueV5(JSON.stringify([{...entry, roomId}])));
  }
  assert.throws(() => parseRoomCatalogueV5(JSON.stringify([entry, entry])));
  assert.throws(() => parseRoomCatalogueV5(JSON.stringify(Array(65).fill(entry))));
  assert.throws(() => parseRoomCatalogueV5(' '.repeat(16_385)), /limit/);
  assert.throws(() => parseRoomCatalogueV5(JSON.stringify([{...entry, name: ''}])));
  assert.throws(() => parseRoomCatalogueV5('{}'));
});
