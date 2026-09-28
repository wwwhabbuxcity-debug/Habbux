import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProtocol } from '../../tools/validate-protocol.mjs';

const registry = JSON.parse(await readFile(new URL('../../packages/protocol/protocol.json', import.meta.url), 'utf8'));

test('accepts the canonical draft registry', () => validateProtocol(registry));
for (const [description, mutate] of [
  ['duplicate IDs', spec => { spec.messages[1].id = spec.messages[0].id; }],
  ['duplicate names', spec => { spec.messages[1].name = spec.messages[0].name; }],
  ['ID zero', spec => { spec.messages[0].id = 0; }],
  ['ID overflow', spec => { spec.messages[0].id = 65536; }],
  ['version overflow', spec => { spec.version = 256; }],
  ['unbounded payload', spec => { spec.limits.maxPayloadBytes = 2 ** 32; }],
  ['fractional payload', spec => { spec.limits.maxPayloadBytes = 1.5; }],
  ['reserved flag enabled', spec => { spec.limits.allowedFlags = 1; }],
  ['changed header order', spec => { spec.header.reverse(); }],
  ['unknown direction', spec => { spec.messages[0].direction = 'any'; }],
  ['duplicate disconnect reason', spec => { spec.disconnectReasons.push(spec.disconnectReasons[0]); }],
]) {
  test(`rejects ${description}`, () => {
    const invalid = structuredClone(registry);
    mutate(invalid);
    assert.throws(() => validateProtocol(invalid));
  });
}
