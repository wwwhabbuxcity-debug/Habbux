import os from 'node:os';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const iterations = Number(process.env.HABBUX_BENCH_ITERATIONS ?? 250_000);
if (!Number.isSafeInteger(iterations) || iterations < 1_000 || iterations > 2_000_000) {
  throw new Error('HABBUX_BENCH_ITERATIONS must be between 1000 and 2000000');
}
const source = (await readFile(new URL('../apps/client/src/communication/core.ts', import.meta.url), 'utf8'))
  .replace(/^import\s+\{[\s\S]*?\}\s+from '..\/room\/room-state';\n/u, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { encodeFrame, decodeFrame, CORE_MESSAGE } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const payload = Uint8Array.of(0, 0, 0, 42);
const stableFrame = encodeFrame(CORE_MESSAGE.PING, payload);
const warmup = Math.min(iterations, 20_000);
for (let index = 0; index < warmup; index++) {
  decodeFrame(encodeFrame(CORE_MESSAGE.PING, payload));
}

const encodeRate = measure(() => encodeFrame(CORE_MESSAGE.PING, payload), iterations);
let decodedMessage = 0;
const decodeRate = measure(() => { decodedMessage = decodeFrame(stableFrame).messageId; }, iterations);
if (decodedMessage !== CORE_MESSAGE.PING) throw new Error('benchmark codec result validation failed');
console.log(JSON.stringify({
  benchmark: 'Habbux TypeScript frame codec v1',
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  logicalCpus: os.cpus().length,
  payloadBytes: payload.byteLength,
  iterationsPerOperation: iterations,
  warmupIterations: warmup,
  encode: encodeRate,
  decode: decodeRate,
  note: 'Single-process local baseline; not a network capacity or player-count claim.',
}, null, 2));

function measure(operation, count) {
  const start = performance.now();
  for (let index = 0; index < count; index++) operation();
  const durationMs = performance.now() - start;
  return { durationMs: Number(durationMs.toFixed(2)), operationsPerSecond: Math.round(count / (durationMs / 1_000)) };
}
