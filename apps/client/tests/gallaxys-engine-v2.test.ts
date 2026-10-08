import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAvatarManifest, type AvatarPart } from '../src/renderer/avatar-manifest.ts';
import { resolveAvatarFrameSelection } from '../src/renderer/avatar-assets.ts';
import { resolveAvatarPartLayer, avatarPartTint } from '../src/renderer/avatar-composition.ts';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from '../src/renderer/avatar-animation.ts';

const raw = JSON.parse(readFileSync('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json','utf8'));
const manifest = parseAvatarManifest(raw);

for (const gender of ['male','female'] as const) {
  test(`${gender}: olhos usam a orientação da cabeça, inclusive frente; costas não recebem olhos`, () => {
    for (let d=0;d<8;d++) {
      const eye = resolveAvatarFrameSelection(manifest,gender,'ey','wlk',d,3);
      if ([0,6,7].includes(d)) { assert.equal(eye,undefined); continue; }
      const head = resolveAvatarFrameSelection(manifest,gender,'hd','std',d,0)!;
      assert.ok(eye);
      assert.equal(Number(eye.frame.region.split('_').at(-2)), Number(head.frame.region.split('_').at(-2)));
      assert.equal(eye.mirrored,head.mirrored);
      const e = manifest.regions[eye.frame.region]!, h = manifest.regions[head.frame.region]!;
      assert.ok(-eye.frame.offset.x >= -head.frame.offset.x);
      assert.ok(-eye.frame.offset.x+e.width <= -head.frame.offset.x+h.width);
      assert.ok(-eye.frame.offset.y >= -head.frame.offset.y);
      assert.ok(-eye.frame.offset.y+e.height <= -head.frame.offset.y+h.height);
    }
  });
  test(`${gender}: braços/mãos têm todas as poses, conectam às mangas e usam a mesma reflexão`, () => {
    for (const [hand,sleeve] of [['lh','ls'],['rh','rs']] as const) for (let d=0;d<8;d++) {
      for (const action of ['std','wlk'] as const) for (let f=0;f<(action==='std'?1:4);f++) {
        const h = resolveAvatarFrameSelection(manifest,gender,hand,action,d,f)!;
        const s = resolveAvatarFrameSelection(manifest,gender,sleeve,action,d,f)!;
        assert.ok(h && s);
        assert.equal(h.mirrored,s.mirrored);
        const hr=manifest.regions[h.frame.region]!, sr=manifest.regions[s.frame.region]!;
        const sx=-s.frame.offset.x, sy=-s.frame.offset.y, hx=-h.frame.offset.x, hy=-h.frame.offset.y;
        assert.ok(hx+hr.width>=sx && hx<=sx+sr.width);
        assert.ok(hy<sy+sr.height && hy+hr.height>sy,'skin must overlap sleeve cuff');
        assert.ok(hr.width>0 && hr.height>0);
        assert.ok(h.frame.region.startsWith('habbux_hands_original_v1:'));
      }
    }
  });
}
test('camadas mantêm braço distante atrás do tronco e braço próximo na frente em todas as direções', () => {
  for (let d=0;d<8;d++) {
    const layer=(p:AvatarPart)=>resolveAvatarPartLayer(p,d);
    assert.ok(Math.min(layer('lh'),layer('rh'))<layer('ch'));
    assert.ok(Math.max(layer('lh'),layer('rh'))>layer('ch'));
    assert.ok(layer('lh')<layer('ls') && layer('rh')<layer('rs'));
    assert.ok(layer('hrb')<layer('hd') && layer('hd')<layer('ey') && layer('ey')<layer('hr'));
    assert.equal(avatarPartTint('lh'),avatarPartTint('hd'));
    if(d>=4 && d<=6) assert.equal(layer('lh'),resolveAvatarPartLayer('lh',6-d));
  }
});
test('manifesto legado de onze partes continua válido sem mãos opcionais',()=>{
  const legacy=structuredClone(raw);
  delete legacy.parts.lh;delete legacy.parts.rh;delete legacy.sheets.habbux_hands_original_v1;
  legacy.layerOrder=legacy.layerOrder.filter((p:string)=>p!=='lh'&&p!=='rh');
  legacy.regions=Object.fromEntries(Object.entries(legacy.regions).filter(([k])=>!k.startsWith('habbux_hands_original_v1:')));
  const parsed=parseAvatarManifest(legacy);
  assert.equal(resolveAvatarFrameSelection(parsed,'male','lh','std',3,0),undefined);
  const invalid=structuredClone(legacy);invalid.layerOrder.push('lh','rh');
  assert.throws(()=>parseAvatarManifest(invalid),/ausente/);
});
test('clock sem snapshots conserva quatro frames e fase através de STAND/WALK',()=>{
  const clock=new AvatarAnimationController(WALK_FRAME_DURATION_MS);
  clock.setMoving(true);clock.advance(82*2+17);
  assert.equal(clock.currentFrame,2);clock.setMoving(false);assert.equal(clock.currentAction,'std');
  clock.advance(500);clock.setMoving(true);clock.advance(65);
  assert.equal(clock.currentFrame,3);assert.equal(clock.currentAction,'wlk');
  assert.equal(clock.snapshot().elapsedMs,0);
});
