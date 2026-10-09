import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Texture, TextureSource } from 'pixi.js';
import { createAvatarAssetProvider, loadAvatarManifest } from '../src/renderer/avatar-assets.ts';
import type { AvatarManifest } from '../src/renderer/avatar-manifest.ts';

const manifestUrl = 'https://example.test/avatar-manifest.json';
const profileUrl = '/client/assets/avatar/v5/animation-profile.json';
const rawManifest = JSON.parse(readFileSync('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json', 'utf8'));
const rawProfile = JSON.parse(readFileSync('apps/client/public/assets/avatar/v5/animation-profile.json', 'utf8'));
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

function providerFor(manifest: AvatarManifest) {
  const loads: string[] = [];
  const provider = createAvatarAssetProvider(manifest, 'https://example.test/avatar/', async url => {
    loads.push(url);
    const sheet = Object.values(manifest.sheets).find(value => url.endsWith(value.src))!;
    return new Texture({ source: new TextureSource({ width: sheet.width, height: sheet.height }) });
  });
  return { provider, loads };
}

async function checkFallback(manifest: AvatarManifest) {
  const { provider, loads } = providerFor(manifest);
  try {
    assert.equal(provider.animationSource, 'habbux-v4-original-fallback');
    assert.equal(provider.walkFrameCount, 4);
    await Promise.all([provider.preload('male'), provider.preload('male'), provider.preload('female')]);
    for (let direction = 0; direction < 8; direction++) for (let frame = 0; frame < 4; frame++) {
      const resolved = provider.getFrame('male', 'bd', 'wlk', direction, frame)!;
      assert.ok(resolved, `fallback D${direction}/F${frame} disponível`);
      assert.equal(provider.getFrame('male', 'bd', 'wlk', direction, frame + 4), resolved);
    }
    assert.equal(loads.length, 7, 'falha do perfil mantém sete atlas compartilhados');
    assert.equal(new Set(loads).size, 7);
  } finally {
    provider.dispose();
  }
}

// Failed attempts precede the successful shared profile, which stays cached for
// the lifetime of this isolated test process just as it does in the browser.
test('loader/provider conservam frames V4 quando o perfil retorna erro HTTP', async t => {
  let profileRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === manifestUrl) return response(rawManifest);
    assert.equal(url, profileUrl);
    profileRequests++;
    return new Response('unavailable', { status: 503 });
  });
  await checkFallback(await loadAvatarManifest(manifestUrl));
  assert.equal(profileRequests, 1);
});

test('perfil inválido é rejeitado pelo loader sem impedir os frames do provider', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === manifestUrl) return response(rawManifest);
    assert.equal(url, profileUrl);
    return response({ ...rawProfile, provenance: { ...rawProfile.provenance, status: 'UNKNOWN' } });
  });
  await checkFallback(await loadAvatarManifest(manifestUrl));
});

test('timeout de três segundos cancela a busca do perfil e entrega fallback utilizável', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requested!: (signal: AbortSignal) => void;
  const requestStarted = new Promise<AbortSignal>(resolve => { requested = resolve; });
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    if (url === manifestUrl) return response(rawManifest);
    assert.equal(url, profileUrl);
    assert.ok(options?.signal);
    const signal = options.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      requested(signal);
    });
  });
  const loading = loadAvatarManifest(manifestUrl);
  const signal = await requestStarted;
  t.mock.timers.tick(2_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal.aborted, true);
  await checkFallback(await loading);
});

test('timeout permanece ativo enquanto o corpo do perfil chega em streaming', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reading!: () => void;
  const readingStarted = new Promise<void>(resolve => { reading = resolve; });
  let signal!: AbortSignal;
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    if (url === manifestUrl) return response(rawManifest);
    assert.equal(url, profileUrl);
    assert.ok(options?.signal);
    signal = options.signal;
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode('{"version":1,'));
        } else {
          reading(); // The parser is waiting for the rest of the response body.
        }
      },
    }, { highWaterMark: 0 });
    return new Response(body, { status: 200 });
  });
  const loading = loadAvatarManifest(manifestUrl);
  await readingStarted;
  t.mock.timers.tick(2_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal.aborted, true);
  await checkFallback(await loading);
});

test('loader associa perfil autorizado ao provider, compartilha busca e preserva contagens nativas', async t => {
  const shorter = structuredClone(rawManifest);
  shorter.parts.bd.actions.wlk.frameCount = 3;
  for (const gender of ['male', 'female']) {
    for (const direction of Object.values(shorter.parts.bd.actions.wlk.genders[gender].directions) as { frames: Record<string, unknown> }[]) {
      delete direction.frames['3'];
    }
  }
  const shorterUrl = 'https://example.test/shorter-manifest.json';
  let profileRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === manifestUrl) return response(rawManifest);
    if (url === shorterUrl) return response(shorter);
    assert.equal(url, profileUrl);
    profileRequests++;
    return response(rawProfile);
  });
  const manifests = await Promise.all([loadAvatarManifest(manifestUrl), loadAvatarManifest(shorterUrl)]);
  const entries = manifests.map(providerFor);
  try {
    for (const { provider, loads } of entries) {
      assert.equal(provider.animationSource, rawProfile.provenance.sha256, 'o loader entrega a fonte autorizada ao provider');
      assert.equal(provider.walkFrameCount, 4);
      await Promise.all([provider.preload('male'), provider.preload('male'), provider.preload('female')]);
      for (const gender of ['male', 'female'] as const) for (let direction = 0; direction < 8; direction++) {
        for (let frame = 0; frame < 12; frame++) {
          const count = provider.manifest.parts.bd.actions.wlk!.frameCount;
          const resolved = provider.getFrame(gender, 'bd', 'wlk', direction, frame)!;
          assert.ok(resolved);
          assert.equal(provider.getFrame(gender, 'bd', 'wlk', direction, frame + count), resolved, 'lookup reutiliza o objeto preparado');
        }
        const chestStand = provider.getFrame(gender, 'ch', 'std', direction, 0)!;
        const chestWalk = provider.getFrame(gender, 'ch', 'wlk', direction, 3)!;
        assert.equal(chestWalk.frame, chestStand.frame, 'peito sem WALK mantém fallback STAND');
        assert.equal(chestWalk.texture, chestStand.texture);
      }
      assert.equal(loads.length, 7);
      assert.equal(new Set(loads).size, 7);
    }
    const shortProvider = entries[1]!.provider;
    assert.equal(shortProvider.getFrame('male', 'bd', 'wlk', 2, 4), shortProvider.getFrame('male', 'bd', 'wlk', 2, 1));
    assert.equal(shortProvider.getFrame('male', 'bd', 'wlk', 2, 3), shortProvider.getFrame('male', 'bd', 'wlk', 2, 0));
    assert.notEqual(shortProvider.getFrame('male', 'bd', 'wlk', 2, 3), shortProvider.getFrame('male', 'bd', 'wlk', 2, 2));
    const cachedManifest = await loadAvatarManifest(manifestUrl);
    const { provider: cachedProvider } = providerFor(cachedManifest);
    assert.equal(cachedProvider.animationSource, rawProfile.provenance.sha256);
    cachedProvider.dispose();
    assert.equal(profileRequests, 1, 'retry após falhas funciona; buscas concorrentes e posteriores compartilham perfil validado');
  } finally {
    for (const { provider } of entries) provider.dispose();
  }
});
