import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNativeRoomTextureResources, validateNativeTexturePng, roomTextureMatrix, type NativeRoomTextureResource } from '../src/renderer/room-texture-resources.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import { DEFAULT_ISO_CONFIG } from '../src/renderer/isometric.ts';
import {GALLAXYS_NATIVE_ROOM_PLANES,GALLAXYS_NATIVE_ROOM_TEXTURES} from '../src/renderer/native-room-material-catalog-v5.ts';
import {nativeTexturesForMaterialPlanes,nativeTexturesForModel} from '../src/renderer/owned-room-textures-v5.ts';
const authorized: NativeRoomTextureResource={id:'native-original',surface:'floor',url:'/client/assets/materials/original.png',sha256:'a'.repeat(64),rights:'AUTHORIZED',provenance:'owner original source',rightsEvidence:'source author declaration',repeatScale:1};
test('native textures require explicit rights evidence and bounded local identity',()=>{
 validateNativeRoomTextureResources([authorized]);
 for(const rights of ['UNKNOWN','BLOCKED','REFERENCE_ONLY'] as const)assert.throws(()=>validateNativeRoomTextureResources([{...authorized,rights}]));
 for(const patch of [{rightsEvidence:''},{sha256:'bad'},{url:'https://example.com/a.png'},{url:'/client/assets/materials/../a.png'},{repeatScale:0}])assert.throws(()=>validateNativeRoomTextureResources([{...authorized,...patch}]));
 assert.throws(()=>validateNativeRoomTextureResources([authorized,authorized]));
});
test('texture projection uses shared plane and scales with geometry',()=>{
 const base=roomTextureMatrix('floor','x',0,1,32,32,DEFAULT_ISO_CONFIG);
 const elevated=roomTextureMatrix('floor','x',2,1,32,32,DEFAULT_ISO_CONFIG);
 assert.equal(base[0],1);assert.equal(base[1],0.5);assert.equal(base[2],-1);assert.equal(base[3],0.5);
 assert.equal(elevated[5],base[5]-32);
 const wall=roomTextureMatrix('wall','x',0,1,32,32,DEFAULT_ISO_CONFIG);
 assert.equal(wall[0],-1);assert.equal(wall[2],0);assert.equal(wall[3],0.5);
});
test('native PNG dimensions are rejected before bitmap decoding; original owner asset accepted',()=>{
 const png=readFileSync('apps/client/public/assets/materials/v5/owned-heart.png');validateNativeTexturePng(png);
 const bomb=Uint8Array.from(png);new DataView(bomb.buffer).setUint32(16,100_000);assert.throws(()=>validateNativeTexturePng(bomb),/1024/);
 assert.throws(()=>validateNativeTexturePng(new Uint8Array(32)),/header/);
 for(const url of ['/client/assets/materials/%2e%2e/a.png','/client/assets/materials/a.png?x=1'])assert.throws(()=>validateNativeRoomTextureResources([{...authorized,url}]));
 assert.throws(()=>validateNativeRoomTextureResources([{...authorized,overlayOpacity:2}]));
});

test('all owner-declared floor and wall PNGs have native hash, dimensions and source material bindings',()=>{
 assert.equal(GALLAXYS_NATIVE_ROOM_TEXTURES.filter(t=>t.surface==='floor').length,6);
 assert.equal(GALLAXYS_NATIVE_ROOM_TEXTURES.filter(t=>t.surface==='wall').length,52);
 assert.equal(GALLAXYS_NATIVE_ROOM_PLANES.filter(p=>p.surface==='floor').length,58);
 assert.equal(GALLAXYS_NATIVE_ROOM_PLANES.filter(p=>p.surface==='wall').length,162);
 for(const resource of GALLAXYS_NATIVE_ROOM_TEXTURES){
  validateNativeRoomTextureResources([resource]);
  assert.match(resource.rightsEvidence,/OWNER_DECLARED_OWNED/);
  const bytes=readFileSync('apps/client/public'+resource.url.slice('/client'.length));
  validateNativeTexturePng(bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),resource.sha256);
  const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  assert.equal(header.getUint32(16),resource.width);assert.equal(header.getUint32(20),resource.height);
 }
 for(const plane of GALLAXYS_NATIVE_ROOM_PLANES){
  const selected=nativeTexturesForMaterialPlanes(plane.surface==='floor'?plane.id:'default',plane.surface==='wall'?plane.id:'218');
  const resource=selected.find(r=>r.surface===plane.surface)!;
  assert.equal(resource.tint,plane.color);
  assert.equal(resource.id,GALLAXYS_NATIVE_ROOM_TEXTURES.find(t=>t.surface===plane.surface&&t.sourceTextureId===plane.textureId)!.id);
 }
 assert.throws(()=>nativeTexturesForMaterialPlanes('unavailable','218'));
 for(const id of ['hbx_gx_model_a_v5','hbx_alcove_v3','hbx_courtyard_v3','hbx_terrace_v3'])assert.equal(nativeTexturesForModel(id).length,2);
 assert.deepEqual(nativeTexturesForModel('fixture'),[]);
 assert.deepEqual(nativeTexturesForModel(null),[]);
 const mutable=nativeTexturesForModel('hbx_alcove_v3') as {tint?:number}[];mutable[0]!.tint=0;
 assert.notEqual(nativeTexturesForModel('hbx_alcove_v3')[0]!.tint,0);
});

test('native source pixel proportions survive tall wallpaper and rectangular floor projection',()=>{
 const tall=GALLAXYS_NATIVE_ROOM_TEXTURES.find(t=>t.surface==='wall'&&t.height===109)!;
 assert.ok(tall);
 const wall=roomTextureMatrix('wall','x',0,tall.repeatScale,tall.width,tall.height,DEFAULT_ISO_CONFIG,tall.verticalRepeatScale);
 assert.equal(wall[0],-1);assert.equal(wall[1],0.5);assert.equal(wall[3],1);
 const rectangular=GALLAXYS_NATIVE_ROOM_TEXTURES.find(t=>t.surface==='floor'&&t.height===16)!;
 const floor=roomTextureMatrix('floor','x',0,rectangular.repeatScale,rectangular.width,rectangular.height,DEFAULT_ISO_CONFIG,rectangular.verticalRepeatScale);
 assert.equal(floor[0],1);assert.equal(floor[1],0.5);assert.equal(floor[2],-1);assert.equal(floor[3],0.5);
 for(const patch of [{verticalRepeatScale:0},{verticalRepeatScale:17},{tint:-1},{tint:0x1000000}])assert.throws(()=>validateNativeRoomTextureResources([{...authorized,...patch}]));
});
