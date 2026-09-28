import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

class LoadClient {
  constructor(serverPort) {
    this.createdAt = performance.now();
    this.socket = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);
    this.socket.binaryType = 'arraybuffer';
    this.queue = [];
    this.waiters = [];
    this.closed = false;
    this.sentFrames = 0;
    this.closedPromise = new Promise((resolve) => this.socket.addEventListener('close', () => {
      this.closed = true;
      resolve();
      while (this.waiters.length) this.waiters.shift().reject(new Error('WebSocket closed before response'));
    }, { once: true }));
    this.socket.addEventListener('message', (event) => {
      try {
        const frame = decodeFrame(event.data);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(frame);
        else this.queue.push(frame);
      } catch (error) {
        const waiter = this.waiters.shift();
        if (waiter) waiter.reject(error);
      }
    });
  }

  async connect() {
    const opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('WebSocket connect failed')), { once: true });
    });
    await timeout(opened, 5_000, 'WebSocket connection timed out');
    const websocketOpenLatency = performance.now() - this.createdAt;
    const coreStarted = performance.now();
    this.send(1, new Uint8Array());
    const response = await this.nextFrame(5_000);
    assert.equal(response.messageId, 2, 'expected SERVER_HELLO');
    assert.equal(response.payload.byteLength, 16, 'invalid SERVER_HELLO payload');
    return {
      websocketOpenLatency,
      coreHandshakeLatency: performance.now() - coreStarted,
    };
  }

  async login(username, password) {
    const fields = [new TextEncoder().encode(username), new TextEncoder().encode(password)];
    const payload = encodeFields(fields);
    fields.forEach((field) => field.fill(0));
    this.send(7, payload);
    payload.fill(0);
    const response = await this.nextFrame(12_000);
    if (response.messageId === 10) throw new Error(`AUTH_FAILURE category ${response.payload[0] ?? 'missing'}`);
    assert.equal(response.messageId, 9, 'expected AUTH_SUCCESS');
    assert.ok(response.payload.byteLength >= 13, 'AUTH_SUCCESS payload is truncated');
    return response;
  }

  async register(username, email, password) {
    const fields = [username, email, password].map((value) => new TextEncoder().encode(value));
    const payload = encodeFields(fields);
    fields.forEach((field) => field.fill(0));
    this.send(8, payload);
    payload.fill(0);
    const response = await this.nextFrame(12_000);
    if (response.messageId === 10) throw new Error(`AUTH_FAILURE category ${response.payload[0] ?? 'missing'}`);
    assert.equal(response.messageId, 9, 'expected AUTH_SUCCESS for test-account registration');
    assert.ok(response.payload.byteLength >= 13, 'AUTH_SUCCESS payload is truncated');
    return response;
  }

  async ping(sequence) {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setUint32(0, sequence, false);
    const started = performance.now();
    this.send(3, payload);
    payload.fill(0);
    const response = await this.nextFrame(5_000);
    assert.equal(response.messageId, 4, 'expected PONG');
    assert.equal(new DataView(response.payload.buffer, response.payload.byteOffset, 4).getUint32(0, false), sequence,
      'PONG sequence did not match PING');
    return performance.now() - started;
  }

  send(messageId, payload) {
    const frame = encodeFrame(messageId, payload);
    this.socket.send(frame);
    new Uint8Array(frame).fill(0);
    this.sentFrames++;
  }

  nextFrame(milliseconds) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.closed) return Promise.reject(new Error('WebSocket is already closed'));
    return timeout(new Promise((resolve, reject) => this.waiters.push({ resolve, reject })),
      milliseconds, 'Core response timed out');
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return true;
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, 'load complete');
    try { await timeout(this.closedPromise, 2_000, 'WebSocket disconnect timed out'); return true; }
    catch { this.socket.close(); return false; }
  }
}

const scenario = process.env.HABBUX_LOAD_SCENARIO ?? 'session';
assert.ok(['connection', 'session', 'auth'].includes(scenario), 'HABBUX_LOAD_SCENARIO must be connection, session, or auth');
const count = Number(process.env.HABBUX_SMOKE_CONNECTIONS ?? 25);
const warmup = Number(process.env.HABBUX_LOAD_WARMUP ?? 2);
const pingCount = Number(process.env.HABBUX_LOAD_PINGS ?? 3);
const maximum = scenario === 'auth' ? 8 : 100;
assert.ok(Number.isInteger(count) && count > 0 && count <= maximum,
  `connection count must be from 1 to ${maximum} for ${scenario}`);
assert.ok(Number.isInteger(warmup) && warmup >= 0 && warmup <= 5, 'warmup must be from 0 to 5');
assert.ok(Number.isInteger(pingCount) && pingCount >= 1 && pingCount <= 10, 'ping count must be from 1 to 10');

const auth = scenario === 'auth' ? validateAuthConfiguration() : null;
const javaHome = process.env.JAVA_HOME ?? '/usr/lib/jvm/java-25-openjdk-amd64';
const javaExecutable = process.env.JAVA ?? join(javaHome, 'bin/java');
const jar = new URL('../apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar', import.meta.url);
await readFile(jar);
const port = await reserveLoopbackPort();
const childEnvironment = emulatorEnvironment(auth, port, Math.min(128, count + warmup + 8));
const child = spawn(javaExecutable, [
  '-Xms32m', '-Xmx256m', '-XX:ActiveProcessorCount=2', '-jar', jar.pathname,
], {
  cwd: new URL('../', import.meta.url),
  env: childEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
let pendingLine = '';
let childExit = null;
let childClose = null;
let resolveChildClose;
const childClosed = new Promise((resolve) => { resolveChildClose = resolve; });
let readyResolve;
let readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  logs += chunk;
  pendingLine += chunk;
  const lines = pendingLine.split(/\r?\n/u);
  pendingLine = lines.pop() ?? '';
  for (const line of lines) {
    const event = parseLogLine(line);
    if (event?.event === 'emulator.server_listening') readyResolve();
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { logs += chunk; });
child.once('error', readyReject);
child.once('close', (code, signal) => {
  childClose = { code, signal };
  resolveChildClose();
});
child.once('exit', (code, signal) => {
  childExit = { code, signal };
  if (!logs.includes('emulator.server_listening')) readyReject(new Error(`Emulator exited before listening (${code ?? signal})`));
});

let shutdownForced = false;
let serverSnapshot = {};
let databaseSnapshot = {};
let measurement;
let failures = [];
let results = [];
let seededAccountCreated = false;
let seededAccountCleaned = auth?.seed ? false : null;
let seededAccountRegistrationMs = null;
const startupStarted = performance.now();
try {
  let startupTimer;
  try {
    await Promise.race([ready, new Promise((_, reject) => {
      startupTimer = setTimeout(() => reject(new Error('Emulator startup timeout')), 15_000);
    })]);
  } finally {
    clearTimeout(startupTimer);
  }

  if (auth?.seed) {
    const seedStarted = performance.now();
    await registerLoadAccount(port, auth);
    seededAccountCreated = true;
    seededAccountRegistrationMs = performance.now() - seedStarted;
  }

  for (let index = 0; index < warmup; index++) {
    await exercise({ port, scenario, auth, pingCount: Math.min(1, pingCount), index: -index - 1 });
  }

  const cpuTicks = await clockTicksPerSecond();
  const before = await readProcessMetrics(child.pid);
  const gcBefore = await readGcMetrics(javaHome, child.pid);
  const startedAt = performance.now();
  let peakRssKiB = before?.rssKiB ?? 0;
  let sampling = false;
  const sampler = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      const sample = await readProcessMetrics(child.pid);
      if (sample) peakRssKiB = Math.max(peakRssKiB, sample.rssKiB);
    } catch { /* process exit is captured in the final sample */ }
    finally { sampling = false; }
  }, 250);

  try {
    const settled = await Promise.allSettled(Array.from({ length: count }, (_, index) =>
      exercise({ port, scenario, auth, pingCount, index })));
    results = settled.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value);
    failures = settled.filter((entry) => entry.status === 'rejected')
      .slice(0, 5).map((entry) => safeError(entry.reason));
  } finally {
    clearInterval(sampler);
  }
  const elapsedMs = performance.now() - startedAt;
  const after = await readProcessMetrics(child.pid);
  const gcAfter = await readGcMetrics(javaHome, child.pid);
  measurement = {
    elapsedMs: Math.round(elapsedMs),
    before,
    after,
    peakRssKiB,
    cpuMs: cpuTicks && before && after
      ? Math.round(((after.cpuTicks - before.cpuTicks) / cpuTicks) * 1_000) : null,
    gcBefore,
    gcAfter,
  };
} catch (error) {
  failures.push(safeError(error));
} finally {
  if (!childClose) child.kill('SIGTERM');
  let forceTimer;
  await Promise.race([childClosed, new Promise((resolve) => {
    forceTimer = setTimeout(() => {
      shutdownForced = true;
      child.kill('SIGKILL');
      resolve();
    }, 8_000);
  })]);
  clearTimeout(forceTimer);
  if (shutdownForced) await childClosed;
  const lines = logs.split(/\r?\n/u);
  if (pendingLine) lines.push(pendingLine);
  for (const line of lines) {
    const event = parseLogLine(line);
    if (event?.event === 'emulator.server_stopped') serverSnapshot = event;
    if (event?.event === 'emulator.database_pool_stopped') databaseSnapshot = event;
  }
  if (auth?.seed) {
    try {
      await cleanupSeededAuthAccount(auth);
      seededAccountCleaned = true;
    } catch {
      failures.push('temporary Auth test account cleanup failed');
      seededAccountCleaned = false;
    }
  }
}

const durationMs = measurement?.elapsedMs ?? Math.round(performance.now() - startupStarted);
const pingLatencies = results.flatMap((result) => result.pingLatencies);
const loginLatencies = results.flatMap((result) => result.loginLatency === null ? [] : [result.loginLatency]);
const websocketOpenLatencies = results.map((result) => result.websocketOpenLatency);
const coreHandshakeLatencies = results.map((result) => result.coreHandshakeLatency);
const serverCpuMs = measurement?.cpuMs ?? null;
const report = {
  scenario,
  warmupConnections: warmup,
  attempted: count,
  connected: results.length,
  handshakeSuccess: results.length,
  authSuccess: results.filter((result) => result.authenticated).length,
  failed: count - results.length,
  disconnectSuccess: results.filter((result) => result.disconnected).length,
  durationMs,
  completedConnectionCyclesPerSecond: rate(results.length, durationMs),
  clientMessagesPerSecond: rate(results.reduce((total, result) => total + result.clientFramesSent, 0), durationMs),
  latencyMs: {
    websocketOpen: percentiles(websocketOpenLatencies),
    coreHandshake: percentiles(coreHandshakeLatencies),
    login: percentiles(loginLatencies),
    pingPong: percentiles(pingLatencies),
  },
  emulator: {
    cpuMs: serverCpuMs,
    cpuPercentOfOneCore: serverCpuMs === null || !durationMs ? null : round(serverCpuMs / durationMs * 100, 1),
    rssMiB: toMiB(measurement?.after?.rssKiB),
    peakRssMiB: toMiB(measurement && Math.max(
      measurement.peakRssKiB,
      measurement.before?.rssKiB ?? 0,
      measurement.after?.rssKiB ?? 0,
    )),
    threads: measurement?.after?.threads ?? null,
    heapUsedMiB: gcUsedHeapMiB(measurement?.gcAfter),
    gcCollections: gcDelta(measurement?.gcBefore, measurement?.gcAfter, ['YGC', 'FGC', 'CGC']),
    gcSeconds: gcDelta(measurement?.gcBefore, measurement?.gcAfter, ['YGCT', 'FGCT', 'CGCT']),
  },
  serverMetrics: serverSnapshot,
  databasePool: databaseSnapshot,
  seededAccountCreated,
  seededAccountRegistrationMs: seededAccountRegistrationMs === null ? null : round(seededAccountRegistrationMs, 2),
  seededAccountCleaned,
  processExitCode: childClose?.code ?? null,
  processExitSignal: childClose?.signal ?? null,
  processExited: Boolean(childClose && ['SIGTERM', null].includes(childClose.signal)
    && ([0, 143].includes(childClose.code) || childClose.signal === 'SIGTERM')
    && serverSnapshot.event === 'emulator.server_stopped' && !shutdownForced),
  shutdownForced,
  failures,
};
console.log(JSON.stringify(report, null, 2));

const noOrphans = serverSnapshot.activeConnections === 0 && serverSnapshot.activeSessions === 0;
const noDatabaseLeak = scenario !== 'auth'
  || (databaseSnapshot.active === 0 && databaseSnapshot.pending === 0);
if (report.failed !== 0 || report.disconnectSuccess !== count || !noOrphans || !noDatabaseLeak
    || (auth?.seed && (!seededAccountCreated || !seededAccountCleaned))
    || !report.processExited || shutdownForced) {
  if (logs) console.error(logs.slice(-5_000));
  process.exitCode = 1;
}

function validateAuthConfiguration() {
  const host = process.env.HABBUX_TEST_POSTGRES_HOST;
  const database = process.env.HABBUX_TEST_POSTGRES_DB;
  assert.ok(host === '127.0.0.1' || host === 'localhost', 'AUTH scenario only allows loopback PostgreSQL');
  assert.equal(database, 'habbux_phase2_test', 'AUTH scenario only allows the dedicated Habbux test database');
  for (const key of ['HABBUX_TEST_POSTGRES_PORT', 'HABBUX_TEST_POSTGRES_USER', 'HABBUX_TEST_POSTGRES_PASSWORD']) {
    assert.ok(process.env[key], `AUTH scenario requires ${key}`);
  }
  if (process.env.HABBUX_LOAD_AUTH_SEED === '1') {
    assert.ok(process.env.HABBUX_TEST_POSTGRES_MIGRATION_USER
      && process.env.HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD,
    'temporary account cleanup requires the isolated migration role');
    const username = `load_${randomBytes(7).toString('hex')}`;
    const credential = randomBytes(24).toString('base64url');
    return { username, email: `${username}@example.test`, password: credential, seed: true };
  }
  const username = process.env.HABBUX_LOAD_AUTH_USERNAME;
  const password = process.env.HABBUX_LOAD_AUTH_PASSWORD;
  assert.ok(username?.startsWith('load_') && username.length <= 20,
    'AUTH scenario requires a dedicated test account whose username starts with load_');
  assert.ok(password && Buffer.byteLength(password, 'utf8') <= 512, 'AUTH scenario requires a bounded test password');
  return { username, password, seed: false };
}

function emulatorEnvironment(authConfig, serverPort, maxConnections) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith('HABBUX_TEST_POSTGRES_') || key.startsWith('HABBUX_LOAD_AUTH_')) delete environment[key];
  }
  Object.assign(environment, {
    HABBUX_ENV: 'test',
    HABBUX_EVENT_LOOP_THREADS: '1',
    HABBUX_SHUTDOWN_TIMEOUT_MS: '5000',
    HABBUX_BIND_HOST: '127.0.0.1',
    HABBUX_PORT: String(serverPort),
    HABBUX_MAX_CONNECTIONS: String(maxConnections),
    HABBUX_HANDSHAKE_TIMEOUT_MS: '5000',
    HABBUX_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    HABBUX_AUTH_THREADS: '2',
    HABBUX_AUTH_QUEUE_LIMIT: '8',
  });
  if (authConfig) {
    environment.POSTGRES_HOST = process.env.HABBUX_TEST_POSTGRES_HOST;
    environment.POSTGRES_PORT = process.env.HABBUX_TEST_POSTGRES_PORT;
    environment.POSTGRES_DB = process.env.HABBUX_TEST_POSTGRES_DB;
    environment.POSTGRES_USER = process.env.HABBUX_TEST_POSTGRES_USER;
    environment.POSTGRES_PASSWORD = process.env.HABBUX_TEST_POSTGRES_PASSWORD;
    environment.POSTGRES_POOL_MIN = '1';
    environment.POSTGRES_POOL_MAX = '2';
    environment.POSTGRES_CONNECTION_TIMEOUT_MS = '1500';
    environment.POSTGRES_IDLE_TIMEOUT_MS = '600000';
    environment.POSTGRES_MAX_LIFETIME_MS = '1800000';
  } else {
    for (const key of Object.keys(environment)) if (key.startsWith('POSTGRES_')) delete environment[key];
  }
  return environment;
}

async function exercise({ port: serverPort, scenario: testScenario, auth: authCredentials, pingCount: pings, index }) {
  const client = new LoadClient(serverPort);
  const start = performance.now();
  let websocketOpenLatency = null;
  let coreHandshakeLatency = null;
  let loginLatency = null;
  let authenticated = false;
  let disconnected = false;
  const pingLatencies = [];
  try {
    const connectionLatency = await client.connect();
    websocketOpenLatency = connectionLatency.websocketOpenLatency;
    coreHandshakeLatency = connectionLatency.coreHandshakeLatency;
    if (testScenario === 'auth') {
      const loginStarted = performance.now();
      await client.login(authCredentials.username, authCredentials.password);
      loginLatency = performance.now() - loginStarted;
      authenticated = true;
    }
    if (testScenario !== 'connection') {
      const toSend = testScenario === 'auth' ? 1 : pings;
      for (let sequence = 0; sequence < toSend; sequence++) {
        pingLatencies.push(await client.ping((index * 16 + sequence) >>> 0));
      }
    }
    disconnected = await client.close();
    return {
      websocketOpenLatency,
      coreHandshakeLatency,
      loginLatency,
      authenticated,
      disconnected,
      pingLatencies,
      clientFramesSent: 1 + (testScenario === 'auth' ? 1 : 0) + pingLatencies.length,
      elapsedMs: performance.now() - start,
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}

async function registerLoadAccount(serverPort, credentials) {
  const client = new LoadClient(serverPort);
  try {
    await client.connect();
    await client.register(credentials.username, credentials.email, credentials.password);
    assert.equal(await client.close(), true, 'temporary account connection did not close cleanly');
  } catch (error) {
    await client.close();
    throw error;
  }
}

async function cleanupSeededAuthAccount(credentials) {
  assert.match(credentials.username, /^load_[a-f0-9]{14}$/u, 'temporary account is outside the cleanup allowlist');
  const host = process.env.HABBUX_TEST_POSTGRES_HOST;
  const portValue = process.env.HABBUX_TEST_POSTGRES_PORT;
  const database = process.env.HABBUX_TEST_POSTGRES_DB;
  assert.ok((host === '127.0.0.1' || host === 'localhost') && database === 'habbux_phase2_test',
    'cleanup only allows the loopback Habbux test database');
  const environment = {
    PATH: '/usr/bin:/bin',
    PGCONNECT_TIMEOUT: '3',
    PGPASSWORD: process.env.HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD,
  };
  const common = ['--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
    '-h', host, '-p', portValue, '-U', process.env.HABBUX_TEST_POSTGRES_MIGRATION_USER,
    '-d', database];
  const query = (sql, username) => new Promise((resolve, reject) => {
    const args = username === undefined ? common : [...common, `--set=load_user=${username}`];
    const client = spawn('psql', args, { env: environment, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      client.kill('SIGKILL');
    }, 5_000);
    client.stdout.setEncoding('utf8');
    client.stdout.on('data', (chunk) => { output += chunk; });
    client.once('error', () => {
      clearTimeout(timer);
      reject(new Error('psql could not start for isolated load cleanup'));
    });
    client.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('psql timed out during isolated load cleanup'));
      else if (code !== 0) reject(new Error('psql failed during isolated load cleanup'));
      else resolve(output.trim());
    });
    client.stdin.on('error', () => {});
    client.stdin.end(sql);
  });
  assert.equal(await query('SELECT current_database();'), 'habbux_phase2_test', 'cleanup connected to a different database');
  const username = credentials.username;
  const before = await query("SELECT count(*) FROM users WHERE username = :'load_user';", username);
  assert.ok(before === '0' || before === '1', 'temporary account count is outside the expected range');
  if (before === '1') {
    await query("BEGIN; DELETE FROM user_credentials WHERE user_id IN (SELECT id FROM users WHERE username = :'load_user'); DELETE FROM users WHERE username = :'load_user'; COMMIT;", username);
  }
  assert.equal(await query("SELECT count(*) FROM users WHERE username = :'load_user';", username), '0',
    'temporary account remained after cleanup');
}

function encodeFields(fields) {
  const size = fields.reduce((total, field) => total + 2 + field.byteLength, 0);
  const payload = new Uint8Array(size);
  const view = new DataView(payload.buffer);
  let offset = 0;
  for (const field of fields) {
    view.setUint16(offset, field.byteLength, false);
    offset += 2;
    payload.set(field, offset);
    offset += field.byteLength;
  }
  return payload;
}

function encodeFrame(messageId, payload) {
  const frame = new ArrayBuffer(8 + payload.byteLength);
  const view = new DataView(frame);
  view.setUint8(0, 1);
  view.setUint16(1, messageId, false);
  view.setUint8(3, 0);
  view.setUint32(4, payload.byteLength, false);
  new Uint8Array(frame, 8).set(payload);
  return frame;
}

function decodeFrame(input) {
  assert.ok(input instanceof ArrayBuffer, 'Core response must be binary');
  const bytes = new Uint8Array(input);
  assert.ok(bytes.byteLength >= 8, 'Core frame header is truncated');
  const view = new DataView(input);
  const length = view.getUint32(4, false);
  assert.equal(view.getUint8(0), 1, 'unsupported protocol version');
  assert.equal(view.getUint8(3), 0, 'reserved flags must be zero');
  assert.equal(length, bytes.byteLength - 8, 'Core frame length mismatch');
  return { messageId: view.getUint16(1, false), payload: bytes.slice(8) };
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function readProcessMetrics(pid) {
  const [status, stat] = await Promise.all([
    readFile(`/proc/${pid}/status`, 'utf8'),
    readFile(`/proc/${pid}/stat`, 'utf8'),
  ]);
  const rss = status.match(/^VmRSS:\s+(\d+)\s+kB$/mu);
  const threads = status.match(/^Threads:\s+(\d+)$/mu);
  const close = stat.lastIndexOf(')');
  const fields = stat.slice(close + 1).trim().split(/\s+/u);
  return {
    rssKiB: rss ? Number(rss[1]) : null,
    threads: threads ? Number(threads[1]) : null,
    cpuTicks: Number(fields[11]) + Number(fields[12]),
  };
}

async function readGcMetrics(javaDirectory, pid) {
  try {
    const { stdout } = await execFile(join(javaDirectory, 'bin/jstat'), ['-gc', String(pid)], { timeout: 3_000 });
    const rows = stdout.trim().split(/\r?\n/u);
    const names = rows[0].trim().split(/\s+/u);
    const values = rows.at(-1).trim().split(/\s+/u).map(Number);
    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
  } catch { return null; }
}

async function clockTicksPerSecond() {
  try { return Number((await execFile('getconf', ['CLK_TCK'])).stdout.trim()); }
  catch { return null; }
}

function parseLogLine(line) {
  try {
    const record = JSON.parse(line);
    const values = Object.fromEntries((record.kvpList ?? []).flatMap((entry) => Object.entries(entry)));
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string' && /^\d+$/u.test(value)) values[key] = Number(value);
    }
    return values.event ? values : null;
  } catch { return null; }
}

function percentiles(values) {
  if (!values.length) return { sampleCount: 0, p50: null, p95: null, p99: null };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (percentile) => round(sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)], 2);
  return { sampleCount: sorted.length, p50: at(0.50), p95: at(0.95), p99: at(0.99) };
}

function gcUsedHeapMiB(metrics) {
  if (!metrics) return null;
  const usedKiB = ['S0U', 'S1U', 'EU', 'OU'].reduce((total, key) => total + (metrics[key] ?? 0), 0);
  return round(usedKiB / 1024, 2);
}

function gcDelta(before, after, keys) {
  if (!before || !after) return null;
  return round(keys.reduce((total, key) => total + (after[key] ?? 0) - (before[key] ?? 0), 0), 3);
}

function toMiB(kibibytes) { return kibibytes == null ? null : round(kibibytes / 1024, 2); }
function rate(amount, milliseconds) { return milliseconds > 0 ? round(amount / milliseconds * 1_000, 2) : 0; }
function round(value, digits) { return Number(value.toFixed(digits)); }
function safeError(error) { return error instanceof Error ? error.message.slice(0, 180) : 'load client failed'; }
function timeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
