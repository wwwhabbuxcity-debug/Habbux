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
    this.receivedFrames = 0;
    this.closedPromise = new Promise((resolve) => this.socket.addEventListener('close', () => {
      this.closed = true;
      resolve();
      while (this.waiters.length) this.rejectWaiter(this.waiters.shift(), new Error('WebSocket closed before response'));
    }, { once: true }));
    this.socket.addEventListener('message', (event) => {
      try {
        const frame = decodeFrame(event.data);
        this.receivedFrames++;
        const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(frame));
        if (waiterIndex >= 0) this.resolveWaiter(this.waiters.splice(waiterIndex, 1)[0], frame);
        else {
          this.queue.push(frame);
          if (this.queue.length > 4_096) this.socket.close(1011, 'load receive queue exceeded its bound');
        }
      } catch (error) {
        const waiter = this.waiters.shift();
        if (waiter) this.rejectWaiter(waiter, error);
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
    const response = await this.waitForMessage((frame) => frame.messageId === 4
      && frame.payload.byteLength === 4
      && new DataView(frame.payload.buffer, frame.payload.byteOffset, 4).getUint32(0, false) === sequence, 5_000);
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
    return this.waitForMessage(() => true, milliseconds);
  }

  waitForMessage(predicate, milliseconds) {
    const queuedIndex = this.queue.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(this.queue.splice(queuedIndex, 1)[0]);
    if (this.closed) return Promise.reject(new Error('WebSocket is already closed'));
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('Core response timed out'));
      }, milliseconds);
      this.waiters.push(waiter);
    });
  }

  resolveWaiter(waiter, frame) {
    clearTimeout(waiter.timer);
    waiter.resolve(frame);
  }

  rejectWaiter(waiter, error) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return true;
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, 'load complete');
    try { await timeout(this.closedPromise, 2_000, 'WebSocket disconnect timed out'); return true; }
    catch { this.socket.close(); return false; }
  }
}

const scenario = process.env.HABBUX_LOAD_SCENARIO ?? 'session';
assert.ok(['connection', 'session', 'auth', 'rooms', 'hot-room'].includes(scenario),
  'HABBUX_LOAD_SCENARIO must be connection, session, auth, rooms, or hot-room');
const count = Number(process.env.HABBUX_SMOKE_CONNECTIONS
  ?? (['rooms', 'hot-room'].includes(scenario) ? 20 : 25));
const warmup = ['rooms', 'hot-room'].includes(scenario) ? 0 : Number(process.env.HABBUX_LOAD_WARMUP ?? 2);
const pingCount = Number(process.env.HABBUX_LOAD_PINGS ?? 3);
const maximum = scenario === 'auth' ? 8 : 100;
assert.ok(Number.isInteger(count) && count > 0 && count <= maximum,
  `connection count must be from 1 to ${maximum} for ${scenario}`);
assert.ok(Number.isInteger(warmup) && warmup >= 0 && warmup <= 5, 'warmup must be from 0 to 5');
assert.ok(Number.isInteger(pingCount) && pingCount >= 1 && pingCount <= 10, 'ping count must be from 1 to 10');

const auth = scenario === 'auth' ? validateAuthConfiguration() : null;
const roomLoad = ['rooms', 'hot-room'].includes(scenario) ? validateRoomLoadConfiguration(scenario, count) : null;
const javaHome = process.env.JAVA_HOME ?? '/usr/lib/jvm/java-25-openjdk-amd64';
const javaExecutable = process.env.JAVA ?? join(javaHome, 'bin/java');
const jar = new URL('../apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar', import.meta.url);
await readFile(jar);
const port = await reserveLoopbackPort();
const childEnvironment = emulatorEnvironment(auth ?? roomLoad, port, Math.min(128, count + warmup + 8));
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
let roomSnapshot = {};
let measurement;
let roomMeasurement = null;
let failures = [];
let results = [];
let seededAccountCreated = false;
let seededAccountCleaned = auth?.seed ? false : null;
let seededAccountRegistrationMs = null;
let roomFixtureCreated = false;
let roomFixtureCleaned = roomLoad ? false : null;
let roomFixtureSetupMs = null;
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

  if (roomLoad) {
    const fixtureStarted = performance.now();
    for (const account of roomLoad.accounts) {
      await registerLoadAccount(port, account);
      roomLoad.createdAccounts.push(account);
    }
    roomLoad.roomIds = await createRoomLoadFixtures(roomLoad);
    roomFixtureCreated = roomLoad.createdAccounts.length === count && roomLoad.roomIds.length === roomLoad.roomCount;
    roomFixtureSetupMs = performance.now() - fixtureStarted;
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
    if (roomLoad) {
      roomMeasurement = await exerciseRoomScenario({ port, config: roomLoad });
      results = roomMeasurement.clients;
    } else {
      const settled = await Promise.allSettled(Array.from({ length: count }, (_, index) =>
        exercise({ port, scenario, auth, pingCount, index })));
      results = settled.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value);
      failures = settled.filter((entry) => entry.status === 'rejected')
        .slice(0, 5).map((entry) => safeError(entry.reason));
    }
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
    if (event?.event === 'room.manager_stopped') roomSnapshot = event;
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
  if (roomLoad) {
    try {
      await cleanupRoomLoadFixtures(roomLoad);
      roomFixtureCleaned = true;
    } catch {
      failures.push('temporary room load fixture cleanup failed');
      roomFixtureCleaned = false;
    }
  }
}

const durationMs = measurement?.elapsedMs ?? Math.round(performance.now() - startupStarted);
const pingLatencies = results.flatMap((result) => result.pingLatencies);
const loginLatencies = results.flatMap((result) => result.loginLatency === null ? [] : [result.loginLatency]);
const websocketOpenLatencies = results.map((result) => result.websocketOpenLatency);
const coreHandshakeLatencies = results.map((result) => result.coreHandshakeLatency);
const serverCpuMs = measurement?.cpuMs ?? null;
if (roomMeasurement?.report) {
  roomMeasurement.report.durationMs = durationMs;
  roomMeasurement.report.roomEventsPerSecond = rate(roomSnapshot.roomEventsProcessed ?? 0, durationMs);
  roomMeasurement.report.queueDelayMs = {
    p50: round((roomSnapshot.queueDelayP50Nanos ?? 0) / 1_000_000, 3),
    p95: round((roomSnapshot.queueDelayP95Nanos ?? 0) / 1_000_000, 3),
    p99: round((roomSnapshot.queueDelayP99Nanos ?? 0) / 1_000_000, 3),
  };
  roomMeasurement.report.roomJoinLatencyMs = {
    p50: round((roomSnapshot.joinP50Nanos ?? 0) / 1_000_000, 3),
    p95: round((roomSnapshot.joinP95Nanos ?? 0) / 1_000_000, 3),
    p99: round((roomSnapshot.joinP99Nanos ?? 0) / 1_000_000, 3),
  };
  roomMeasurement.report.roomMovementLatencyMs = {
    p50: round((roomSnapshot.movementP50Nanos ?? 0) / 1_000_000, 3),
    p95: round((roomSnapshot.movementP95Nanos ?? 0) / 1_000_000, 3),
    p99: round((roomSnapshot.movementP99Nanos ?? 0) / 1_000_000, 3),
  };
  roomMeasurement.report.roomEventsProcessed = roomSnapshot.roomEventsProcessed ?? null;
  roomMeasurement.report.maxMailboxDepth = roomSnapshot.maxMailboxDepth ?? null;
  roomMeasurement.report.rejectedEvents = roomSnapshot.roomEventsRejected ?? null;
}
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
  roomMetrics: roomSnapshot,
  databasePool: databaseSnapshot,
  seededAccountCreated,
  seededAccountRegistrationMs: seededAccountRegistrationMs === null ? null : round(seededAccountRegistrationMs, 2),
  seededAccountCleaned,
  roomFixtureCreated,
  roomFixtureSetupMs: roomFixtureSetupMs === null ? null : round(roomFixtureSetupMs, 2),
  roomFixtureCleaned,
  roomLoad: roomMeasurement?.report ?? null,
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
const noDatabaseLeak = (scenario !== 'auth' && !roomLoad)
  || (databaseSnapshot.active === 0 && databaseSnapshot.pending === 0);
const noRoomLeaks = !roomLoad || (roomSnapshot.activeRooms === 0 && roomSnapshot.activeRoomUsers === 0
  && roomSnapshot.liveWorkers === 0 && (roomSnapshot.clean === true || roomSnapshot.clean === 'true')
  && roomSnapshot.roomActivations === roomSnapshot.roomUnloads);
if (report.failed !== 0 || report.disconnectSuccess !== count || !noOrphans || !noDatabaseLeak
    || (auth?.seed && (!seededAccountCreated || !seededAccountCleaned))
    || (roomLoad && (!roomFixtureCreated || !roomFixtureCleaned || !noRoomLeaks))
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

function validateRoomLoadConfiguration(testScenario, clients) {
  const host = process.env.HABBUX_TEST_POSTGRES_HOST;
  const database = process.env.HABBUX_TEST_POSTGRES_DB;
  assert.ok(host === '127.0.0.1' || host === 'localhost', 'room load only allows loopback PostgreSQL');
  assert.equal(database, 'habbux_phase2_test', 'room load only allows the dedicated Habbux test database');
  assert.equal(process.env.HABBUX_LOAD_AUTH_SEED, '1', 'room load requires disposable seeded test accounts');
  for (const key of ['HABBUX_TEST_POSTGRES_PORT', 'HABBUX_TEST_POSTGRES_USER',
    'HABBUX_TEST_POSTGRES_PASSWORD', 'HABBUX_TEST_POSTGRES_MIGRATION_USER',
    'HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD']) {
    assert.ok(process.env[key], `room load requires ${key}`);
  }
  const defaultRooms = testScenario === 'hot-room' ? 1 : 4;
  const roomCount = Number(process.env.HABBUX_LOAD_ROOMS ?? defaultRooms);
  assert.ok(Number.isInteger(roomCount) && roomCount >= 1 && roomCount <= Math.min(25, clients),
    'HABBUX_LOAD_ROOMS must be from 1 to min(25, clients)');
  if (testScenario === 'hot-room') assert.equal(roomCount, 1, 'hot-room scenario requires exactly one room');
  const token = randomBytes(5).toString('hex');
  const accountPrefix = `load_${token}_`;
  const roomPrefix = `loadroom_${token}`;
  const accounts = Array.from({ length: clients }, (_, index) => {
    const username = `${accountPrefix}${String(index).padStart(2, '0')}`;
    assert.ok(username.length <= 20);
    return {
      username,
      email: `${username}@example.test`,
      password: randomBytes(24).toString('base64url'),
    };
  });
  return { host, database, token, accountPrefix, roomPrefix, roomCount, accounts,
    createdAccounts: [], roomIds: [] };
}

async function createRoomLoadFixtures(config) {
  assert.equal(await runRoomLoadSql(config, 'SELECT current_database();'), config.database,
    'room fixture setup connected to a different database');
  const ownerUsername = config.accounts[0].username;
  const insertAndRead = `
    \\set QUIET 1
    INSERT INTO rooms (owner_user_id, name, description, capacity, grid_width, grid_height,
                       grid_walkability, spawn_x, spawn_y)
    SELECT users.id, :'room_prefix' || '_r' || lpad(room_number::text, 2, '0'), '', 100, 64, 64,
           decode(repeat('01', 4096), 'hex'), 0, 0
      FROM users CROSS JOIN generate_series(1, :'room_count'::integer) AS numbers(room_number)
     WHERE users.username = :'owner_username';
    SELECT id FROM rooms
     WHERE left(name, length(:'room_prefix') + 2) = :'room_prefix' || '_r'
       AND substring(name FROM length(:'room_prefix') + 3) ~ '^[0-9]{2}$'
     ORDER BY name;
  `;
  const output = await runRoomLoadSql(config, insertAndRead, {
    room_prefix: config.roomPrefix,
    room_count: String(config.roomCount),
    owner_username: ownerUsername,
  });
  const roomIds = output.split(/\s+/u).filter((value) => /^\d+$/u.test(value)).map(Number);
  assert.equal(roomIds.length, config.roomCount, 'did not create the requested number of isolated rooms');
  assert.ok(roomIds.every((id) => Number.isSafeInteger(id) && id > 0));
  return roomIds;
}

async function cleanupRoomLoadFixtures(config) {
  assert.equal(await runRoomLoadSql(config, 'SELECT current_database();'), config.database,
    'room fixture cleanup connected to a different database');
  const output = await runRoomLoadSql(config, `
    \\set QUIET 1
    DELETE FROM rooms
     WHERE left(name, length(:'room_prefix') + 2) = :'room_prefix' || '_r'
       AND substring(name FROM length(:'room_prefix') + 3) ~ '^[0-9]{2}$';
    DELETE FROM users
     WHERE left(username, length(:'account_prefix')) = :'account_prefix'
       AND substring(username FROM length(:'account_prefix') + 1) ~ '^[0-9]{2}$';
    SELECT (SELECT count(*) FROM rooms
             WHERE left(name, length(:'room_prefix') + 2) = :'room_prefix' || '_r'
               AND substring(name FROM length(:'room_prefix') + 3) ~ '^[0-9]{2}$') || ':' ||
           (SELECT count(*) FROM users
             WHERE left(username, length(:'account_prefix')) = :'account_prefix'
               AND substring(username FROM length(:'account_prefix') + 1) ~ '^[0-9]{2}$');
  `, { room_prefix: config.roomPrefix, account_prefix: config.accountPrefix });
  assert.match(output, /(?:^|\s)0:0(?:$|\s)/u, 'temporary room load rows remained after cleanup');
}

async function runRoomLoadSql(config, sql, variables = {}) {
  const args = ['--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
    '-h', config.host, '-p', process.env.HABBUX_TEST_POSTGRES_PORT,
    '-U', process.env.HABBUX_TEST_POSTGRES_MIGRATION_USER, '-d', config.database];
  for (const [name, value] of Object.entries(variables)) args.push(`--set=${name}=${value}`);
  const environment = {
    PATH: '/usr/bin:/bin',
    PGCONNECT_TIMEOUT: '3',
    PGPASSWORD: process.env.HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD,
  };
  return new Promise((resolve, reject) => {
    const client = spawn('psql', args, { env: environment, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; client.kill('SIGKILL'); }, 5_000);
    client.stdout.setEncoding('utf8');
    client.stdout.on('data', (chunk) => { output += chunk; });
    client.once('error', () => {
      clearTimeout(timer);
      reject(new Error('psql could not start for isolated room load setup/cleanup'));
    });
    client.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('psql timed out during isolated room load setup/cleanup'));
      else if (code !== 0) reject(new Error('psql failed during isolated room load setup/cleanup'));
      else resolve(output.trim());
    });
    client.stdin.on('error', () => {});
    client.stdin.end(sql);
  });
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

async function exerciseRoomScenario({ port: serverPort, config }) {
  const scenarioStartedAt = performance.now();
  const clients = config.accounts.map(() => new LoadClient(serverPort));
  const clientRows = clients.map((client, index) => ({
    client,
    index,
    connectLatency: null,
    handshakeLatency: null,
    loginLatency: null,
    userId: null,
    roomId: null,
    roomIndex: index % config.roomCount,
    spawn: null,
    target: null,
    movementLatency: null,
    chatLatency: null,
    pingLatency: null,
    joinLatency: null,
    leaveLatency: null,
    moved: false,
    chatted: false,
    left: false,
  }));
  try {
    const connected = await Promise.all(clientRows.map(async (row) => {
      const result = await row.client.connect();
      row.connectLatency = result.websocketOpenLatency;
      row.handshakeLatency = result.coreHandshakeLatency;
      return result;
    }));
    assert.equal(connected.length, clients.length);

    await mapWithConcurrency(clientRows, 2, async (row) => {
      const started = performance.now();
      const authSuccess = await row.client.login(config.accounts[row.index].username,
        config.accounts[row.index].password);
      row.loginLatency = performance.now() - started;
      row.userId = readPositiveUint64(authSuccess.payload, 0, 'AUTH_SUCCESS user id');
    });

    await Promise.all(clientRows.map(async (row) => {
      row.roomId = config.roomIds[row.roomIndex];
      const payload = encodeUint64(row.roomId);
      const started = performance.now();
      row.client.send(13, payload);
      const joined = await row.client.waitForMessage((frame) => frame.messageId === 14 || frame.messageId === 15, 8_000);
      if (joined.messageId === 15) throw new Error(`room join failed with category ${joined.payload[0] ?? 'missing'}`);
      assert.equal(joined.payload.byteLength, 10, 'ROOM_JOIN_SUCCESS has an invalid size');
      assert.equal(readPositiveUint64(joined.payload, 0, 'joined room id'), row.roomId);
      row.spawn = { x: joined.payload[8], y: joined.payload[9] };
      const snapshot = await row.client.waitForMessage((frame) => frame.messageId === 18
        && frame.payload.byteLength >= 8
        && readPositiveUint64(frame.payload, 0, 'snapshot room id') === row.roomId, 8_000);
      assert.ok(snapshot.payload.byteLength >= 16, 'room snapshot is truncated');
      row.joinLatency = performance.now() - started;
    }));

    const movementGroups = planAdjacentRoomMoves(clientRows);
    assert.equal(movementGroups.reduce((sum, group) => sum + group.length, 0), clientRows.length,
      'could not plan one collision-free move for every test client');
    await Promise.all(movementGroups.map(async (group) => {
      for (const row of group) {
        const started = performance.now();
        row.client.send(19, Uint8Array.of(row.target.x, row.target.y));
        const update = await row.client.waitForMessage((frame) => frame.messageId === 20
          && frame.payload.byteLength === 11
          && readPositiveUint64(frame.payload, 0, 'movement user id') === row.userId, 8_000);
        assert.equal(update.payload[8], row.target.x, 'authoritative movement X did not match');
        assert.equal(update.payload[9], row.target.y, 'authoritative movement Y did not match');
        row.movementLatency = performance.now() - started;
        row.moved = true;
      }
    }));

    await Promise.all(clientRows.map(async (row) => {
      const message = `load_${config.token}_${String(row.index).padStart(2, '0')}`;
      const payload = encodeChat(message);
      const started = performance.now();
      row.client.send(24, payload);
      const echoed = await row.client.waitForMessage((frame) => frame.messageId === 25
        && frame.payload.byteLength >= 10
        && readPositiveUint64(frame.payload, 0, 'chat user id') === row.userId
        && decodeChatText(frame.payload) === message, 8_000);
      assert.equal(decodeChatText(echoed.payload), message);
      row.chatLatency = performance.now() - started;
      row.chatted = true;
    }));

    await Promise.all(clientRows.map(async (row) => {
      row.pingLatency = await row.client.ping((row.index * 977 + 1) >>> 0);
      const started = performance.now();
      row.client.send(16, new Uint8Array());
      const response = await row.client.waitForMessage((frame) => frame.messageId === 17, 8_000);
      assert.equal(response.payload.byteLength, 0, 'ROOM_LEAVE_SUCCESS must be empty');
      row.leaveLatency = performance.now() - started;
      row.left = true;
    }));

    const closed = await Promise.all(clientRows.map((row) => row.client.close()));
    assert.ok(closed.every(Boolean), 'one or more room load clients did not disconnect cleanly');
    const receivedFrames = clientRows.reduce((sum, row) => sum + row.client.receivedFrames, 0);
    const sentFrames = clientRows.reduce((sum, row) => sum + row.client.sentFrames, 0);
    const report = {
      clients: clients.length,
      rooms: config.roomCount,
      usersPerRoom: countUsersPerRoom(clientRows, config.roomCount),
      connectSuccess: connected.length,
      authSuccess: clientRows.filter((row) => row.userId !== null).length,
      joinSuccess: clientRows.filter((row) => row.joinLatency !== null).length,
      moveAttempted: movementGroups.reduce((sum, group) => sum + group.length, 0),
      moveSuccess: clientRows.filter((row) => row.moved).length,
      chatSuccess: clientRows.filter((row) => row.chatted).length,
      pingSuccess: clientRows.filter((row) => row.pingLatency !== null).length,
      leaveSuccess: clientRows.filter((row) => row.left).length,
      disconnectSuccess: closed.filter(Boolean).length,
      clientMessagesSent: sentFrames,
      clientMessagesReceived: receivedFrames,
      clientMessagesPerSecond: null,
      serverMessagesPerSecond: null,
      latencyMs: {
        websocketOpen: percentiles(clientRows.map((row) => row.connectLatency)),
        coreHandshake: percentiles(clientRows.map((row) => row.handshakeLatency)),
        login: percentiles(clientRows.map((row) => row.loginLatency)),
        join: percentiles(clientRows.map((row) => row.joinLatency)),
        movement: percentiles(clientRows.map((row) => row.movementLatency).filter(Number.isFinite)),
        chat: percentiles(clientRows.map((row) => row.chatLatency)),
        pingPong: percentiles(clientRows.map((row) => row.pingLatency)),
        leave: percentiles(clientRows.map((row) => row.leaveLatency)),
      },
    };
    const durationMs = Math.max(performance.now() - scenarioStartedAt, 1);
    report.clientMessagesPerSecond = rate(sentFrames, durationMs);
    report.serverMessagesPerSecond = rate(receivedFrames, durationMs);
    return {
      durationMs,
      report,
      clients: clientRows.map((row) => ({
        authenticated: row.userId !== null,
        disconnected: closed[row.index],
        websocketOpenLatency: row.connectLatency,
        coreHandshakeLatency: row.handshakeLatency,
        loginLatency: row.loginLatency,
        pingLatencies: row.pingLatency === null ? [] : [row.pingLatency],
        clientFramesSent: row.client.sentFrames,
      })),
    };
  } catch (error) {
    await Promise.all(clients.map((client) => client.close()));
    throw error;
  }
}

function planAdjacentRoomMoves(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.roomId)) grouped.set(row.roomId, []);
    grouped.get(row.roomId).push(row);
  }
  const plannedGroups = [];
  for (const occupants of grouped.values()) {
    const occupied = new Set(occupants.map((row) => `${row.spawn.x},${row.spawn.y}`));
    const pending = new Set(occupants);
    const planned = [];
    while (pending.size > 0) {
      let progressed = false;
      for (const row of [...pending]) {
        const candidates = [
          [row.spawn.x, row.spawn.y - 1], [row.spawn.x - 1, row.spawn.y],
          [row.spawn.x + 1, row.spawn.y], [row.spawn.x, row.spawn.y + 1],
        ];
        const free = candidates.find(([x, y]) => x >= 0 && x < 64 && y >= 0 && y < 64
          && !occupied.has(`${x},${y}`));
        if (free) {
          row.target = { x: free[0], y: free[1] };
          occupied.delete(`${row.spawn.x},${row.spawn.y}`);
          occupied.add(`${free[0]},${free[1]}`);
          pending.delete(row);
          planned.push(row);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    if (planned.length > 0) plannedGroups.push(planned);
  }
  return plannedGroups;
}

function countUsersPerRoom(rows, roomCount) {
  return Array.from({ length: roomCount }, (_, roomIndex) => rows.filter((row) => row.roomIndex === roomIndex).length);
}

async function mapWithConcurrency(items, concurrency, task) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

function encodeUint64(value) {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setBigUint64(0, BigInt(value), false);
  return payload;
}

function readUint64(payload, offset) {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getBigUint64(offset, false);
}

function readPositiveUint64(payload, offset, label) {
  assert.ok(payload.byteLength >= offset + 8, `${label} is truncated`);
  const value = readUint64(payload, offset);
  assert.ok(value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), `${label} is outside the safe range`);
  return Number(value);
}

function encodeChat(text) {
  const encoded = new TextEncoder().encode(text);
  const payload = new Uint8Array(2 + encoded.byteLength);
  new DataView(payload.buffer).setUint16(0, encoded.byteLength, false);
  payload.set(encoded, 2);
  return payload;
}

function decodeChatText(payload) {
  if (payload.byteLength < 10) return '';
  const size = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint16(8, false);
  if (size !== payload.byteLength - 10) return '';
  try { return new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(10)); }
  catch { return ''; }
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
