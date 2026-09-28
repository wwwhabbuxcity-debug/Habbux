import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const roomStateSource = await readFile(new URL('../../apps/client/src/room/room-state.ts', import.meta.url), 'utf8');
const compiledRoomState = ts.transpileModule(roomStateSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const roomStateModuleUrl = `data:text/javascript;base64,${Buffer.from(compiledRoomState).toString('base64')}`;
const source = await readFile(new URL('../../apps/client/src/communication/core.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace("from '../room/room-state';", `from '${roomStateModuleUrl}';`);
const client = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const roomState = await import(roomStateModuleUrl);
const vectors = (await readFile(new URL('../../packages/protocol/golden-vectors-v1.txt', import.meta.url), 'utf8'))
  .split(/\r?\n/u).filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split('|'));
const toHex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../gu) ?? [], (part) => Number.parseInt(part, 16));

test('matches every Java shared golden vector byte-for-byte', () => {
  for (const [version, id, flags, payloadHex, expectedHex] of vectors) {
    const payload = payloadHex === '-' ? new Uint8Array() : fromHex(payloadHex);
    const encoded = client.encodeFrame(Number(id), payload);
    assert.equal(toHex(new Uint8Array(encoded)), expectedHex);
    const decoded = client.decodeFrame(encoded);
    assert.equal(decoded.version, Number(version));
    assert.equal(decoded.messageId, Number(id));
    assert.equal(decoded.flags, Number(flags));
    assert.equal(toHex(decoded.payload), payloadHex === '-' ? '' : payloadHex);
  }
});

test('rejects incompatible versions, unknown IDs, invalid flags and bad lengths', () => {
  for (const hex of [
    '0200010000000000',
    '0100ff0000000000',
    '0100010100000000',
    '0100030000000001',
    '0100',
  ]) assert.throws(() => client.decodeFrame(fromHex(hex)));
  assert.throws(() => client.encodeFrame(99));
  assert.throws(() => client.encodeFrame(3, new Uint8Array(65_537)));
});

test('defensively owns decoded payload and rejects deterministic malformed input', () => {
  const payload = Uint8Array.of(1, 2, 3, 4);
  const encoded = client.encodeFrame(3, payload);
  const decoded = client.decodeFrame(encoded);
  new Uint8Array(encoded)[8] = 9;
  assert.deepEqual([...decoded.payload], [1, 2, 3, 4]);

  let state = 0x48414242;
  for (let iteration = 0; iteration < 1_000; iteration++) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const bytes = new Uint8Array(state % 96);
    for (let index = 0; index < bytes.length; index++) {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      bytes[index] = state >>> 24;
    }
    assert.throws(() => client.decodeFrame(bytes));
  }
});

test('connection endpoint rejects non-WebSocket or alternate protocol paths', () => {
  assert.throws(() => new client.CoreConnection('https://example.test/ws'));
  assert.throws(() => new client.CoreConnection('ws://example.test/other'));
  assert.throws(() => new client.CoreConnection('ws://example.test/ws?token=secret'));
});

test('closes on a SERVER_ERROR frame with a malformed payload length', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let socket;
  class RecordingSocket {
    static OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    closed = null;

    constructor() { socket = this; }
    send() { }
    close(code, reason) { this.closed = { code, reason }; }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: RecordingSocket });
  try {
    const connection = new client.CoreConnection('ws://localhost/ws', 0);
    let snapshot;
    connection.subscribe((value) => { snapshot = value; });
    connection.connect();
    socket.readyState = RecordingSocket.OPEN;
    socket.onopen();
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.SERVER_ERROR, Uint8Array.of(1)) });
    assert.equal(socket.closed.code, 1002);
    assert.match(snapshot.error, /malformado/u);
    connection.dispose();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  }
});

test('client login sends bounded binary credentials, stores only identity, and logs out', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let socket;
  class RecordingSocket {
    static OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    sent = [];
    originals = [];
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    constructor() { socket = this; }
    send(data) { this.originals.push(data); this.sent.push(data.slice(0)); }
    close(code, reason) { this.closed = { code, reason }; this.readyState = 3; this.onclose?.({ code, reason }); }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: RecordingSocket });
  try {
    const connection = new client.CoreConnection('ws://localhost/ws', 0);
    let snapshot;
    connection.subscribe((value) => { snapshot = value; });
    connection.connect();
    socket.readyState = RecordingSocket.OPEN;
    socket.onopen();
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.SERVER_HELLO, new Uint8Array(16)) });

    const login = connection.login('alice', 'correct horse');
    assert.equal(snapshot.authState, 'AUTHENTICATING');
    const outbound = client.decodeFrame(socket.sent.at(-1));
    assert.equal(outbound.messageId, client.CORE_MESSAGE.AUTH_LOGIN);
    const fields = new DataView(outbound.payload.buffer);
    const loginLength = fields.getUint16(0, false);
    assert.equal(new TextDecoder().decode(outbound.payload.subarray(2, 2 + loginLength)), 'alice');
    const passwordOffset = 2 + loginLength;
    const passwordLength = fields.getUint16(passwordOffset, false);
    assert.equal(new TextDecoder().decode(outbound.payload.subarray(passwordOffset + 2, passwordOffset + 2 + passwordLength)), 'correct horse');
    assert.deepEqual([...new Uint8Array(socket.originals.at(-1))], new Array(new Uint8Array(socket.originals.at(-1)).length).fill(0));
    await assert.rejects(connection.login('alice', 'another password'), /autenticação em andamento/u);

    const success = new ArrayBuffer(15);
    const successView = new DataView(success);
    successView.setBigUint64(0, 42n, false);
    successView.setUint16(8, 5, false);
    new Uint8Array(success, 10).set(new TextEncoder().encode('alice'));
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.AUTH_SUCCESS, new Uint8Array(success)) });
    assert.deepEqual(await login, { ok: true, userId: '42', username: 'alice' });
    assert.equal(snapshot.authState, 'AUTHENTICATED');
    assert.equal(snapshot.userId, '42');
    assert.equal(snapshot.username, 'alice');

    const logout = connection.logout();
    assert.equal(client.decodeFrame(socket.sent.at(-1)).messageId, client.CORE_MESSAGE.AUTH_LOGOUT);
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.AUTH_LOGOUT_SUCCESS) });
    assert.equal(await logout, true);
    assert.equal(snapshot.authState, 'ANONYMOUS');
    assert.equal(snapshot.userId, null);
    connection.dispose();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  }
});

test('client maps generic authentication failures and rejects malformed Unicode locally', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let socket;
  class RecordingSocket {
    static OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    constructor() { socket = this; }
    send() { }
    close(code, reason) { this.closed = { code, reason }; this.readyState = 3; this.onclose?.({ code, reason }); }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: RecordingSocket });
  try {
    const connection = new client.CoreConnection('ws://localhost/ws', 0);
    let snapshot;
    connection.subscribe((value) => { snapshot = value; });
    connection.connect();
    socket.readyState = RecordingSocket.OPEN;
    socket.onopen();
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.SERVER_HELLO, new Uint8Array(16)) });
    assert.throws(() => connection.login('\ud800', 'password'), /Unicode inválido/u);
    const login = connection.login('unknown_user', 'wrong password');
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.AUTH_FAILURE, Uint8Array.of(2)) });
    assert.deepEqual(await login, { ok: false, category: 'REJECTED' });
    assert.equal(snapshot.authState, 'ANONYMOUS');
    assert.equal(snapshot.state, 'READY');
    connection.dispose();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  }
});

test('reconnect uses bounded attempts and can be disabled', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  class FailingSocket {
    static created = 0;
    static OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;

    constructor() {
      FailingSocket.created++;
      queueMicrotask(() => {
        this.readyState = 3;
        this.onclose?.({ code: 1006, reason: 'test disconnect' });
      });
    }

    close() { this.readyState = 3; }
    send() { throw new Error('failing test socket cannot send'); }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FailingSocket });
  try {
    const connection = new client.CoreConnection('ws://localhost/ws', 1);
    const states = [];
    const complete = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bounded retry test timed out')), 2_000);
      const unsubscribe = connection.subscribe((snapshot) => {
        states.push(snapshot.state);
        if (snapshot.state === 'DISCONNECTED' && FailingSocket.created === 2) {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
    connection.connect();
    await complete;
    assert.equal(FailingSocket.created, 2);
    assert.ok(states.includes('CONNECTING'));
    assert.ok(states.includes('RECONNECTING'));
    connection.dispose();

    FailingSocket.created = 0;
    const disabled = new client.CoreConnection('ws://localhost/ws', 5);
    const finalState = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('disabled retry test timed out')), 500);
      disabled.subscribe((snapshot) => {
        if (snapshot.state === 'DISCONNECTED' && FailingSocket.created === 1) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    disabled.connect();
    disabled.setReconnectEnabled(false);
    await finalState;
    assert.equal(FailingSocket.created, 1);
    disabled.dispose();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  }
});

test('client joins a room, applies authoritative presence and movement, exchanges chat, and leaves', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  let socket;
  class RecordingSocket {
    static OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    sent = [];
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    constructor() { socket = this; }
    send(data) { this.sent.push(data.slice(0)); }
    close(code, reason) { this.closed = { code, reason }; this.readyState = 3; this.onclose?.({ code, reason }); }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: RecordingSocket });
  try {
    const connection = new client.CoreConnection('ws://localhost/ws', 0);
    let snapshot;
    connection.subscribe((value) => { snapshot = value; });
    connection.connect();
    socket.readyState = RecordingSocket.OPEN;
    socket.onopen();
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.SERVER_HELLO, new Uint8Array(16)) });

    const login = connection.login('alice', 'correct horse');
    const identity = new Uint8Array(15);
    const identityView = new DataView(identity.buffer);
    identityView.setBigUint64(0, 42n, false);
    identityView.setUint16(8, 5, false);
    identity.set(new TextEncoder().encode('alice'), 10);
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.AUTH_SUCCESS, identity) });
    await login;

    connection.joinRoom(42n);
    let outbound = client.decodeFrame(socket.sent.at(-1));
    assert.equal(outbound.messageId, client.CORE_MESSAGE.ROOM_JOIN);
    assert.equal(new DataView(outbound.payload.buffer).getBigUint64(0, false), 42n);
    const joined = new Uint8Array(10);
    new DataView(joined.buffer).setBigUint64(0, 42n, false);
    joined.set([0, 0], 8);
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_JOIN_SUCCESS, joined) });
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_SNAPSHOT, roomSnapshotPayload()) });
    assert.equal(snapshot.roomStatus, 'IN_ROOM');
    assert.equal(snapshot.room.name, 'Test Room');
    assert.deepEqual(snapshot.room.occupants.map(({ username }) => username), ['alice']);

    connection.moveRoom(1, 0);
    outbound = client.decodeFrame(socket.sent.at(-1));
    assert.equal(outbound.messageId, client.CORE_MESSAGE.ROOM_MOVE);
    assert.deepEqual([...outbound.payload], [1, 0]);
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_USER_POSITION,
      concat(uint64(42), Uint8Array.of(1, 0, 0))) });
    assert.deepEqual([snapshot.room.occupants[0].x, snapshot.room.occupants[0].y], [1, 0]);

    const bob = concat(uint64(9), Uint8Array.of(0, 1, 0, 3), new TextEncoder().encode('bob'));
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_USER_JOIN, bob) });
    assert.equal(snapshot.room.occupants.length, 2);
    connection.chatRoom('Olá');
    outbound = client.decodeFrame(socket.sent.at(-1));
    assert.equal(outbound.messageId, client.CORE_MESSAGE.ROOM_CHAT);
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_USER_CHAT,
      concat(uint64(9), Uint8Array.of(0, 4), new TextEncoder().encode('Olá'))) });
    assert.deepEqual(snapshot.roomChat[0], { userId: '9', text: 'Olá', username: 'bob' });

    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_USER_LEAVE, uint64(9)) });
    assert.deepEqual(snapshot.room.occupants.map(({ username }) => username), ['alice']);
    assert.throws(() => connection.chatRoom('linha\nquebrada'), /caracteres inválidos/u);
    connection.leaveRoom();
    assert.equal(client.decodeFrame(socket.sent.at(-1)).messageId, client.CORE_MESSAGE.ROOM_LEAVE);
    socket.onmessage({ data: client.encodeFrame(client.CORE_MESSAGE.ROOM_LEAVE_SUCCESS) });
    assert.equal(snapshot.roomStatus, 'NONE');
    assert.equal(snapshot.room, null);
    connection.dispose();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
    else delete globalThis.WebSocket;
  }
});

test('room snapshot decoder rejects truncation, duplicate occupancy, and malformed UTF-8', () => {
  assert.throws(() => roomState.decodeRoomSnapshot(new Uint8Array(4)), /truncado/u);
  const duplicate = roomSnapshotPayload({ secondUser: true });
  assert.throws(() => roomState.decodeRoomSnapshot(duplicate), /Ocupação/u);
  const malformedName = roomSnapshotPayload({ invalidName: true });
  assert.throws(() => roomState.decodeRoomSnapshot(malformedName), /Nome de quarto/u);
  assert.throws(() => roomState.encodeRoomId('0'));
  assert.throws(() => roomState.encodeRoomId('18446744073709551616'));
  assert.throws(() => roomState.encodeRoomChat('x'.repeat(257)));
});

function uint64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false);
  return bytes;
}

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function roomSnapshotPayload({ secondUser = false, invalidName = false } = {}) {
  const name = invalidName ? Uint8Array.of(0xff) : new TextEncoder().encode('Test Room');
  const occupants = [concat(uint64(42), Uint8Array.of(0, 0, 0, 5), new TextEncoder().encode('alice'))];
  if (secondUser) occupants.push(concat(uint64(42), Uint8Array.of(1, 0, 0, 5), new TextEncoder().encode('alice')));
  return concat(uint64(42), Uint8Array.of(0, name.length), name,
    Uint8Array.of(2, 2, 4, 1, 1, 1, 1, occupants.length), ...occupants);
}
