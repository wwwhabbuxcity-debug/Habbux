import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../../apps/client/src/communication/core.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const client = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
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
