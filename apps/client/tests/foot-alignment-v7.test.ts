import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Container } from 'pixi.js';
import { parseAvatarManifest } from '../src/renderer/avatar-manifest.ts';
import { applyAvatarFootAnchor, resolveAvatarFootAnchor } from '../src/renderer/avatar-composition.ts';
import { resolveAvatarFrameSelection } from '../src/renderer/avatar-assets.ts';
import { roomToScreen, screenToRoom, DEFAULT_ISO_CONFIG } from '../src/renderer/isometric.ts';
import { AvatarMovementController } from '../src/renderer/avatar-movement.ts';
import { resolveRoomTileAtScreen } from '../src/renderer/tile-interaction.ts';
import type { RoomState } from '../src/room/room-state.ts';

const raw=JSON.parse(readFileSync('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json','utf8'));
const manifest=parseAvatarManifest(raw);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

for(const gender of ['male','female'] as const) for(let d=0;d<8;d++) {
  test(`${gender} D${d}: STAND/WALK, Z, zoom e DPR preservam apoio no centro com transformação Pixi real`,()=>{
    const support=resolveAvatarFootAnchor(manifest,gender,d);
    const root=new Container(),composition=new Container();root.addChild(composition);
    for(const action of ['std','wlk'] as const) for(let frame=0;frame<(action==='std'?1:4);frame++) {
      const body=resolveAvatarFrameSelection(manifest,gender,'bd',action,d,frame)!;
      applyAvatarFootAnchor(composition,support,body.mirrored);
      assert.equal(resolveAvatarFootAnchor(manifest,gender,d),support,'fixed reference is reused across frames');
      for(const scale of [.25,.63,1,1.2]) for(const z of [0,3,12]) {
        const config={...DEFAULT_ISO_CONFIG,scale,origin:{x:147.25,y:82.75}};
        const center=roomToScreen(5,5,z,config);root.position.set(center.x,center.y);root.scale.set(scale);
        const foot=composition.toGlobal(support);
        close(foot.x,center.x);close(foot.y,center.y);
        for(const dpr of [1,2,3]) assert.ok(Math.hypot(foot.x-center.x,foot.y-center.y)*dpr<1e-8);
        const inverse=screenToRoom(foot.x,foot.y,config,z);close(inverse.x,5);close(inverse.y,5);
        const room:RoomState={roomId:'feet',name:'feet',modelId:'fixture',width:12,height:12,capacity:10,
          spawn:{x:5,y:5},door:{x:0,y:0,direction:0},occupants:[],elevations:Array(144).fill(z),walkability:Array(144).fill(true)};
        assert.deepEqual(resolveRoomTileAtScreen(foot.x,foot.y,room,config),{x:5,y:5,elevation:z,walkable:true});
      }
    }
    root.destroy({children:true});
  });
}
test('trocar as oito direções parado conserva a origem e reflete em torno do apoio',()=>{
  const root=new Container(),composition=new Container();root.addChild(composition);root.position.set(80.25,122.75);root.scale.set(.73);
  for(let d=0;d<8;d++) {
    const support=resolveAvatarFootAnchor(manifest,'male',d);
    applyAvatarFootAnchor(composition,support,d>=4&&d<=6);
    const foot=composition.toGlobal(support);close(foot.x,80.25);close(foot.y,122.75);
    const beside=composition.toGlobal({x:support.x+2,y:support.y});
    close(beside.x-foot.x,(d>=4&&d<=6?-1:1)*2*.73);
  }
  root.destroy({children:true});
});
test('caminho longo com curvas e elevação mantém apoio na posição interpolada e no endpoint autoritativo',()=>{
  const movement=new AvatarMovementController();movement.setPosition(0,0,0,true);
  for(let x=1;x<=10;x++) movement.setPosition(x,0,x/2);
  for(let y=1;y<=10;y++) movement.setPosition(10,y,5);
  const root=new Container(),composition=new Container();root.addChild(composition);
  const config={...DEFAULT_ISO_CONFIG,scale:.57,origin:{x:240,y:110}};
  let total=0;
  while(total<10100){const delta=Math.min(total%2?33:16,10100-total);movement.update(delta);total+=delta;
    const center=roomToScreen(movement.x,movement.y,movement.z,config);root.position.set(center.x,center.y);root.scale.set(config.scale);
    const support=resolveAvatarFootAnchor(manifest,'female',movement.direction);
    applyAvatarFootAnchor(composition,support,movement.direction>=4&&movement.direction<=6);
    const foot=composition.toGlobal(support);close(foot.x,center.x);close(foot.y,center.y);
  }
  assert.deepEqual([movement.x,movement.y,movement.z,movement.moving],[10,10,5,false]);
  root.destroy({children:true});
});
test('metadados rejeitam apoio fora dos sapatos, região errada e reflexão divergente',()=>{
  for(const bad of [
    (m:typeof raw)=>m.footAnchors.genders.male['3'].x=NaN,
    (m:typeof raw)=>m.footAnchors.genders.male['3'].y=200,
    (m:typeof raw)=>m.footAnchors.genders.male['3'].referenceRegion='bad',
    (m:typeof raw)=>m.footAnchors.genders.male['4'].x+=.1,
  ]){const copy=structuredClone(raw);bad(copy);assert.throws(()=>parseAvatarManifest(copy),/Apoio/);}
});
test('legado sem metadados usa somente os sapatos STAND como referência fixa',()=>{
  const copy=structuredClone(raw);delete copy.footAnchors;const legacy=parseAvatarManifest(copy);
  const support=resolveAvatarFootAnchor(legacy,'male',2);
  const frame=resolveAvatarFrameSelection(legacy,'male','sh','std',2,0)!.frame;
  const region=legacy.regions[frame.region]!;
  assert.equal(support.x,-frame.offset.x+region.width/2);
  assert.equal(support.y,-frame.offset.y+region.height);
});
