import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM_MATERIALS, validateRoomMaterials } from '../src/renderer/room-materials.ts';
import { buildRoomSurfaces, DEFAULT_ROOM_STYLE, fitRoomConfig } from '../src/renderer/room-surfaces.ts';
import { DEFAULT_ISO_CONFIG } from '../src/renderer/isometric.ts';
import type { RoomState } from '../src/room/room-state.ts';
const room: RoomState = { roomId:'1', name:'fixture', modelId:'fixture',width:2,height:2,capacity:10,spawn:{x:0,y:0},door:{x:0,y:0,direction:0},occupants:[],walkability:[true,true,true,true],elevations:[0,0,0,1] };
test('material authorization blocks unknown and reference resources', () => {
  for (const rights of ['UNKNOWN','REFERENCE_ONLY','BLOCKED'] as const) assert.throws(() => validateRoomMaterials({ ...DEFAULT_ROOM_MATERIALS, floor:{ ...DEFAULT_ROOM_MATERIALS.floor, texture:{kind:'boards',rights,provenance:'reference'} } }), /rights/);
});
test('configuration rejects unbounded geometry and invalid colors/opacity/repeat', () => {
  for (const floor of [{opacity:2},{repeatScale:0},{mainColor:-1}]) assert.throws(() => validateRoomMaterials({...DEFAULT_ROOM_MATERIALS,floor:{...DEFAULT_ROOM_MATERIALS.floor,...floor}}));
  assert.throws(() => validateRoomMaterials({...DEFAULT_ROOM_MATERIALS,wallHeight:Infinity}));
});
test('material colors/lighting do not change shared tile vertices or depth', () => {
  const baseline = buildRoomSurfaces(room,DEFAULT_ISO_CONFIG);
  const changed = buildRoomSurfaces(room,DEFAULT_ISO_CONFIG,{...DEFAULT_ROOM_STYLE,materials:{...DEFAULT_ROOM_MATERIALS,floor:{...DEFAULT_ROOM_MATERIALS.floor,mainColor:0xff0000,lighting:{x:1,y:1,cap:1,edge:1}}}});
  assert.deepEqual(changed.floors.map(f=>[f.top.polygon,f.depth]),baseline.floors.map(f=>[f.top.polygon,f.depth]));
  assert.equal(changed.floors.find(f=>f.elevation===1)!.sides[0]!.color,0xff0000);
});
test('material wall height/thickness affect camera and geometry together', () => {
  const style={...DEFAULT_ROOM_STYLE,materials:{...DEFAULT_ROOM_MATERIALS,wallHeight:16,wallThickness:0.3}};
  assert.notDeepEqual(buildRoomSurfaces(room,DEFAULT_ISO_CONFIG,style).walls[0]!.cap,buildRoomSurfaces(room,DEFAULT_ISO_CONFIG).walls[0]!.cap);
  assert.ok(fitRoomConfig(room,300,300,style).scale < fitRoomConfig(room,300,300).scale);
});
test('validation snapshots prevent caller mutation bypassing invalidation', () => {
  const original=structuredClone(DEFAULT_ROOM_MATERIALS);
  const snapshot=validateRoomMaterials(original);
  assert.notEqual(snapshot.floor,original.floor);
  assert.deepEqual(snapshot,original);
});

test('floor and wall reject patterns intended for the other surface', () => {
  assert.throws(() => validateRoomMaterials({...DEFAULT_ROOM_MATERIALS,floor:{...DEFAULT_ROOM_MATERIALS.floor,texture:{kind:'grain',rights:'AUTHORIZED',provenance:'original'}}}), /floor texture/);
  assert.throws(() => validateRoomMaterials({...DEFAULT_ROOM_MATERIALS,wall:{...DEFAULT_ROOM_MATERIALS.wall,texture:{kind:'boards',rights:'AUTHORIZED',provenance:'original'}}}), /wall texture/);
});
