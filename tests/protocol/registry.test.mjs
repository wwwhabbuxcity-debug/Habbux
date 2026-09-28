import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProtocol } from '../../tools/validate-protocol.mjs';

const registry = JSON.parse(await readFile(new URL('../../packages/protocol/protocol.json', import.meta.url), 'utf8'));

test('accepts the canonical operational Core v1 registry', () => validateProtocol(registry));
for (const [description, mutate] of [
  ['duplicate IDs', (spec) => { spec.messages[1].id = spec.messages[0].id; }],
  ['unknown message contract', (spec) => { spec.messages[0].name = 'HELLO'; }],
  ['changed core payload size', (spec) => { spec.messages[2].payloadBytes = 8; }],
  ['changed header length', (spec) => { spec.headerBytes = 9; }],
  ['unbounded payload', (spec) => { spec.limits.maxPayloadBytes = 2 ** 32; }],
  ['reserved flag enabled', (spec) => { spec.limits.allowedFlags = 1; }],
  ['wrong endian', (spec) => { spec.byteOrder = 'little-endian'; }],
]) {
  test(`rejects ${description}`, () => {
    const invalid = structuredClone(registry);
    mutate(invalid);
    assert.throws(() => validateProtocol(invalid));
  });
}
