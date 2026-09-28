import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('../apps/client/src/communication/core.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { CoreConnection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const count = Number(process.env.HABBUX_SMOKE_CONNECTIONS ?? 100);
assert.ok(Number.isInteger(count) && count > 0 && count <= 100, 'smoke connection count must be from 1 to 100');

const jar = new URL('../apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar', import.meta.url);
await readFile(jar);
const port = await reserveLoopbackPort();
const javaExecutable = process.env.JAVA ?? (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : 'java');
const child = spawn(javaExecutable, [
  '-Xms32m', '-Xmx256m', '-XX:ActiveProcessorCount=2', '-jar', jar.pathname,
], {
  cwd: new URL('../', import.meta.url),
  env: {
    ...process.env,
    HABBUX_ENV: 'test',
    HABBUX_EVENT_LOOP_THREADS: '1',
    HABBUX_SHUTDOWN_TIMEOUT_MS: '5000',
    HABBUX_BIND_HOST: '127.0.0.1',
    HABBUX_PORT: String(port),
    HABBUX_MAX_CONNECTIONS: '128',
    HABBUX_HANDSHAKE_TIMEOUT_MS: '5000',
    HABBUX_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
let pendingLine = '';
let serverReady;
const ready = new Promise((resolve, reject) => { serverReady = { resolve, reject }; });
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  logs += chunk;
  pendingLine += chunk;
  const lines = pendingLine.split(/\r?\n/u);
  pendingLine = lines.pop() ?? '';
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.kvpList?.some((entry) => entry.event === 'emulator.server_listening')) serverReady.resolve();
    } catch { /* malformed stdout is reported from the captured log if startup fails */ }
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { logs += chunk; });
child.once('error', (error) => serverReady.reject(error));
child.once('exit', (code, signal) => {
  if (!logs.includes('emulator.server_listening')) serverReady.reject(new Error(`Emulator exited early (${code ?? signal})`));
});

const startedAt = performance.now();
let success = 0;
let failed = 0;
let stoppedLog;
let shutdownForced = false;
try {
  let startupTimer;
  try {
    await Promise.race([ready, new Promise((_, reject) => {
      startupTimer = setTimeout(() => reject(new Error('Emulator startup timeout')), 15_000);
    })]);
  } finally {
    clearTimeout(startupTimer);
  }
  const results = await Promise.allSettled(Array.from({ length: count }, (_, index) => exerciseConnection(port, index)));
  success = results.filter((result) => result.status === 'fulfilled').length;
  failed = count - success;
  for (const result of results) if (result.status === 'rejected') console.error(`connection failed: ${result.reason}`);
} catch (error) {
  failed = count;
  console.error(error);
} finally {
  child.kill('SIGTERM');
  const closed = child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once('close', resolve));
  let forceTimer;
  await Promise.race([closed, new Promise((resolve) => {
    forceTimer = setTimeout(() => {
      shutdownForced = true;
      child.kill('SIGKILL');
      resolve();
    }, 8_000);
  })]);
  clearTimeout(forceTimer);
  if (shutdownForced) await closed;
  for (const line of logs.split(/\r?\n/u)) {
    try {
      const record = JSON.parse(line);
      if (record.kvpList?.some((entry) => entry.event === 'emulator.server_stopped')) stoppedLog = record;
    } catch { /* not a JSON application event */ }
  }
}

const elapsedMs = Math.round(performance.now() - startedAt);
const values = Object.fromEntries((stoppedLog?.kvpList ?? []).map((entry) => Object.entries(entry)).flat());
const activeConnections = Number(values.activeConnections ?? -1);
const activeSessions = Number(values.activeSessions ?? -1);
const exceptions = (logs.match(/"event":"connection\.exception"/gu) ?? []).length;
console.log(JSON.stringify({
  attempted: count,
  success,
  failed,
  durationMs: elapsedMs,
  activeConnectionsAfterShutdown: activeConnections,
  activeSessionsAfterShutdown: activeSessions,
  exceptions,
  shutdownForced,
}, null, 2));
if (success !== count || activeConnections !== 0 || activeSessions !== 0 || exceptions !== 0 || shutdownForced) {
  console.error(logs.slice(-5_000));
  process.exitCode = 1;
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function exerciseConnection(serverPort, sequence) {
  return new Promise((resolve, reject) => {
    const connection = new CoreConnection(`ws://127.0.0.1:${serverPort}/ws`, 0);
    let started = false;
    let gotSession = false;
    let gotRtt = false;
    let settled = false;
    let closingByUs = false;
    let unsubscribe = () => undefined;
    const timeout = setTimeout(() => finish(new Error('connection timed out')), 10_000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      connection.dispose();
      if (error) reject(error);
      else resolve({ sequence, gotSession, gotRtt });
    };
    unsubscribe = connection.subscribe((snapshot) => {
      if (!started) return;
      if (snapshot.state === 'READY') {
        gotSession = snapshot.sessionId !== null;
        gotRtt ||= snapshot.rttMs !== null;
        if (gotRtt) {
          closingByUs = true;
          connection.disconnect();
          finish(gotSession ? null : new Error('session ID missing'));
        }
      } else if (snapshot.state === 'DISCONNECTED') {
        finish(closingByUs && gotSession && gotRtt ? null : new Error(snapshot.error ?? 'connection closed before ping/pong'));
      }
    });
    started = true;
    connection.connect();
  });
}
