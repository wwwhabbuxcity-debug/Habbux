import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Validates the draft registry, not network traffic. No wire codec exists yet. */
export function validateProtocol(spec) {
  assert.equal(spec.name, 'Habbux Protocol');
  assert.equal(spec.status, 'draft');
  assert.ok(Number.isInteger(spec.version) && spec.version > 0 && spec.version <= 255, 'version must fit uint8');
  assert.equal(spec.transport, 'binary-websocket');
  assert.equal(spec.byteOrder, 'big-endian');
  assert.deepEqual(spec.header, [
    { name: 'VERSION', type: 'uint8' },
    { name: 'MESSAGE_ID', type: 'uint16' },
    { name: 'FLAGS', type: 'uint8' },
    { name: 'PAYLOAD_LENGTH', type: 'uint32' },
  ], 'header layout is part of the versioned contract');
  const { maxPayloadBytes, allowedFlags, framesPerWebSocketMessage } = spec.limits;
  assert.ok(Number.isInteger(maxPayloadBytes) && maxPayloadBytes > 0 && maxPayloadBytes <= 65536, 'payload limit must be bounded to 64 KiB');
  assert.equal(allowedFlags, 0, 'draft reserves all flags');
  assert.equal(framesPerWebSocketMessage, 1);
  assert.ok(Array.isArray(spec.messages) && spec.messages.length > 0);
  const ids = new Set();
  const names = new Set();
  for (const message of spec.messages) {
    assert.ok(Number.isInteger(message.id) && message.id > 0 && message.id <= 65535, 'message ID must fit uint16 and cannot be zero');
    assert.ok(!ids.has(message.id), 'duplicate message ID');
    assert.ok(typeof message.name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(message.name), 'invalid message name');
    assert.ok(!names.has(message.name), 'duplicate message name');
    assert.ok(['client-to-server', 'server-to-client', 'bidirectional'].includes(message.direction), 'invalid direction');
    assert.ok(typeof message.purpose === 'string' && message.purpose.trim().length > 0, 'missing purpose');
    ids.add(message.id);
    names.add(message.name);
  }
  assert.equal(spec.payloadEncoding, 'TBD', 'a payload codec requires a reviewed protocol revision');
  assert.ok(Array.isArray(spec.disconnectReasons) && spec.disconnectReasons.length > 0);
  assert.equal(new Set(spec.disconnectReasons).size, spec.disconnectReasons.length, 'duplicate disconnect reason');
  for (const reason of spec.disconnectReasons) assert.match(reason, /^[A-Z][A-Z0-9_]*$/);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const spec = JSON.parse(await readFile(new URL('../packages/protocol/protocol.json', import.meta.url), 'utf8'));
  validateProtocol(spec);
  console.log(`Protocol registry v${spec.version}: valid (${spec.messages.length} control messages; wire codec not implemented)`);
}
