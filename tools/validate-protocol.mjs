import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateProtocol(spec) {
  assert.equal(spec.name, 'Habbux Protocol');
  assert.equal(spec.status, 'core-v1');
  assert.equal(spec.version, 1);
  assert.equal(spec.transport, 'binary-websocket');
  assert.equal(spec.webSocketPath, '/ws');
  assert.equal(spec.byteOrder, 'big-endian');
  assert.equal(spec.headerBytes, 8);
  assert.deepEqual(spec.header, [
    { name: 'VERSION', type: 'uint8', bytes: 1 },
    { name: 'MESSAGE_ID', type: 'uint16', bytes: 2 },
    { name: 'FLAGS', type: 'uint8', bytes: 1 },
    { name: 'PAYLOAD_LENGTH', type: 'uint32', bytes: 4 },
  ]);
  const { maxPayloadBytes, allowedFlags, framesPerWebSocketMessage } = spec.limits;
  assert.equal(maxPayloadBytes, 65536, 'Core v1 payload bound must remain 64 KiB');
  assert.equal(allowedFlags, 0, 'Core v1 reserves all flags');
  assert.equal(framesPerWebSocketMessage, 1);
  assert.equal(spec.payloadEncoding, 'per-message-big-endian');
  assert.deepEqual(spec.messages.map(({ id, name, direction, payloadBytes }) => [id, name, direction, payloadBytes]), [
    [1, 'CLIENT_HELLO', 'client-to-server', 0],
    [2, 'SERVER_HELLO', 'server-to-client', 16],
    [3, 'PING', 'client-to-server', 4],
    [4, 'PONG', 'server-to-client', 4],
    [5, 'CLIENT_DISCONNECT', 'client-to-server', 0],
    [6, 'SERVER_ERROR', 'server-to-client', 2],
    [7, 'AUTH_LOGIN', 'client-to-server', 'variable'],
    [8, 'AUTH_REGISTER', 'client-to-server', 'variable'],
    [9, 'AUTH_SUCCESS', 'server-to-client', 'variable'],
    [10, 'AUTH_FAILURE', 'server-to-client', 1],
    [11, 'AUTH_LOGOUT', 'client-to-server', 0],
    [12, 'AUTH_LOGOUT_SUCCESS', 'server-to-client', 0],
    [13, 'ROOM_JOIN', 'client-to-server', 8],
    [14, 'ROOM_JOIN_SUCCESS', 'server-to-client', 10],
    [15, 'ROOM_JOIN_FAILURE', 'server-to-client', 1],
    [16, 'ROOM_LEAVE', 'client-to-server', 0],
    [17, 'ROOM_LEAVE_SUCCESS', 'server-to-client', 0],
    [18, 'ROOM_SNAPSHOT', 'server-to-client', 'variable'],
    [19, 'ROOM_MOVE', 'client-to-server', 2],
    [20, 'ROOM_USER_POSITION', 'server-to-client', 11],
    [21, 'ROOM_ACTION_FAILURE', 'server-to-client', 2],
    [22, 'ROOM_USER_JOIN', 'server-to-client', 'variable'],
    [23, 'ROOM_USER_LEAVE', 'server-to-client', 8],
    [24, 'ROOM_CHAT', 'client-to-server', 'variable'],
    [25, 'ROOM_USER_CHAT', 'server-to-client', 'variable'],
  ], 'message IDs, direction, and payload sizes are the v1 contract');
  const ids = new Set();
  const names = new Set();
  for (const message of spec.messages) {
    assert.ok(Number.isInteger(message.id) && message.id > 0 && message.id <= 65535);
    assert.ok(!ids.has(message.id), 'duplicate message ID');
    assert.match(message.name, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(!names.has(message.name), 'duplicate message name');
    if (message.payloadBytes === 'variable') {
      assert.match(message.payloadFormat, /^uint(16|64)\b/u);
    } else {
      assert.ok(Number.isInteger(message.payloadBytes) && message.payloadBytes >= 0 && message.payloadBytes <= maxPayloadBytes);
    }
    assert.ok(typeof message.purpose === 'string' && message.purpose.trim());
    ids.add(message.id);
    names.add(message.name);
  }
  assert.deepEqual(spec.serverErrors, [
    { code: 1, name: 'INVALID_STATE' },
    { code: 2, name: 'HANDSHAKE_TIMEOUT' },
  ]);
  assert.equal(new Set(spec.serverErrors.map(({ code }) => code)).size, spec.serverErrors.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const spec = JSON.parse(await readFile(new URL('../packages/protocol/protocol.json', import.meta.url), 'utf8'));
  validateProtocol(spec);
  console.log(`Protocol registry v${spec.version}: valid (${spec.messages.length} core messages)`);
}
