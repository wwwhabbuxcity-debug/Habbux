import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAvatarManifest } from '../src/renderer/avatar-manifest.ts';
import { resolveAvatarFrameSelection } from '../src/renderer/avatar-assets.ts';
import { buildRoomSurfaces, fitRoomConfig } from '../src/renderer/room-surfaces.ts';
import { DEFAULT_ISO_CONFIG } from '../src/renderer/isometric.ts';
import type { RoomState } from '../src/room/room-state.ts';

const manifest = parseAvatarManifest(JSON.parse(readFileSync('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json','utf8')));
const room: RoomState = { roomId:'parity',name:'fixture',modelId:'fixture',width:3,height:3,capacity:10,
  spawn:{x:0,y:0},door:{x:0,y:0,direction:0},occupants:[],elevations:Array(9).fill(0),walkability:Array(9).fill(true) };

test('STAND feminino usa anatomia completa já existente, compatível com WALK nas oito direções',()=>{
  for(let d=0;d<8;d++) {
    const f = resolveAvatarFrameSelection(manifest,'female','bd','std',d,0)!;
    const complete = resolveAvatarFrameSelection(manifest,'male','bd','std',d,0)!;
    assert.deepEqual(f.frame.offset,complete.frame.offset);
    assert.equal(f.frame.region,complete.frame.region);
    assert.ok(!f.frame.region.includes('_999_'));
  }
});
test('nenhuma peça usa pixels de outra orientação e aliases conservam seu registro real',()=>{
  const offsets = new Map<string,string>();
  for(const part of Object.values(manifest.parts)) for(const action of Object.values(part.actions)) {
    for(const gender of Object.values(action!.genders)) for(const direction of Object.values(gender.directions)) {
      for(const frame of Object.values(direction.frames)) {
        assert.equal(Number(frame.region.split('_').at(-2)),direction.renderDirection,frame.region);
        const offset = JSON.stringify(frame.offset), previous = offsets.get(frame.region);
        if(previous) assert.equal(offset,previous,frame.region);
        offsets.set(frame.region,offset);
      }
    }
  }
});
test('planchas têm cor contínua através dos tiles e junta espaçada em quatro células',()=>{
  const r = {...room,width:8,elevations:Array(24).fill(0),walkability:Array(24).fill(true)};
  const s = buildRoomSurfaces(r,DEFAULT_ISO_CONFIG);
  const row = s.floors.filter(f=>f.y===0).sort((a,b)=>a.x-b.x);
  assert.equal(new Set(row.slice(0,4).map(f=>f.top.color)).size,1);
  assert.notEqual(row[0]!.top.color,row[4]!.top.color);
});
test('encontro de paredes no canto interno compartilha o mesmo vértice externo e não recebe tampas sobrepostas',()=>{
  const r = {...room,elevations:[0,0,0,0,-1,0,0,0,0]};
  const s = buildRoomSurfaces(r,DEFAULT_ISO_CONFIG);
  const x = s.walls.find(w=>w.x===2&&w.y===1&&w.side==='x')!;
  const y = s.walls.find(w=>w.x===1&&w.y===2&&w.side==='y')!;
  assert.deepEqual(x.cap.polygon[1],y.cap.polygon[1]);
  assert.deepEqual(x.cap.polygon[2],y.cap.polygon[2]);
  assert.equal(x.end,null);assert.equal(y.end,null);
});
test('paredes de alturas distintas mantêm teto e espessura contínuos',()=>{
  const r = {...room,elevations:[0,1,2,0,1,2,0,1,2]};
  const s = buildRoomSurfaces(r,DEFAULT_ISO_CONFIG);
  const a = s.walls.find(w=>w.x===0&&w.y===0&&w.side==='y')!;
  const b = s.walls.find(w=>w.x===1&&w.y===0&&w.side==='y')!;
  assert.deepEqual(a.cap.polygon[1],b.cap.polygon[0]);
  assert.deepEqual(a.cap.polygon[2],b.cap.polygon[3]);
  assert.equal(a.end,null);
});

const models = readFileSync('apps/emulator/src/main/resources/room-models-v1/models.tsv','utf8').trim().split('\n').filter(l=>!l.startsWith('#'));
assert.equal(models.length,63);
for(const line of models) {
  const [id,w,h,dx,dy,dir,rows] = line.split('\t');
  test(`modelo real ${id}: faces e junções finitas cabem em desktop, mobile e landscape`,()=>{
    const elevations = rows!.split(',').flatMap(row=>[...row].map(c=>c==='x'?-1:parseInt(c,36)));
    const r: RoomState = {...room,modelId:id!,width:Number(w),height:Number(h),elevations,walkability:elevations.map(z=>z>=0),
      door:{x:Number(dx),y:Number(dy),direction:Number(dir)}};
    assert.equal(elevations.length,r.width*r.height);
    for(const [width,height] of [[1280,720],[390,500],[844,390]]) {
      const cfg = fitRoomConfig(r,width!,height!), s = buildRoomSurfaces(r,cfg);
      assert.equal(s.floors.length,elevations.filter(z=>z>=0).length);
      const caps = new Map<string,unknown>();
      for(const wall of s.walls) {
        for(const [index,outerIndex] of [[0,3],[1,2]]) {
          const key = JSON.stringify(wall.cap.polygon[index!]), p = wall.cap.polygon[outerIndex!];
          if(caps.has(key)) assert.deepEqual(p,caps.get(key));
          caps.set(key,p);
        }
      }
      for(const face of [...s.floors.flatMap(f=>[f.top,...f.sides]),...s.walls.flatMap(w=>[w.front,w.cap,w.end,w.startEnd].filter(f=>f!==null))]) {
        for(const p of face.polygon) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=width!&&p.y>=0&&p.y<=height!);
      }
    }
  });
}
