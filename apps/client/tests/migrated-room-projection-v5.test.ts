import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ROOM_STYLE,styleForMigratedRoom,fitRoomConfig,buildRoomSurfaces} from '../src/renderer/room-surfaces.ts';
import {DEFAULT_ROOM_MATERIALS} from '../src/renderer/room-materials.ts';
import {roomToScreen} from '../src/renderer/isometric.ts';
import {resolveRoomTileAtScreen} from '../src/renderer/tile-interaction.ts';
import type {RoomState} from '../src/room/room-state.ts';
const room:RoomState={roomId:'v5',name:'projection',modelId:'hbx_gx_fixture_v5',width:3,height:3,capacity:10,spawn:{x:1,y:1},door:{x:0,y:0,direction:2},elevations:[-1,-1,-1,-1,2,2,-1,2,2],walkability:[false,false,false,false,true,true,false,true,true],occupants:[]};
test('migrated logical levels project 32px with shared floor and picking; previous models preserve 16px',()=>{
 const style=styleForMigratedRoom(room.modelId,DEFAULT_ROOM_STYLE),config=fitRoomConfig(room,390,450,style);
 const ground=roomToScreen(1,1,0,config),top=roomToScreen(1,1,2,config);
 assert.equal(config.elevationHeight,32);assert.ok(Math.abs(ground.y-top.y-64*config.scale)<1e-8);
 assert.deepEqual(resolveRoomTileAtScreen(top.x,top.y,room,config),{x:1,y:1,elevation:2,walkable:true});
 assert.ok(buildRoomSurfaces(room,config,style).floors.some(f=>f.x===1&&f.y===1&&f.top.polygon.some(p=>p.y===top.y-config.tileHeight*config.scale/2)));
 assert.equal(style.wallHeight,3.6);assert.equal(style.floorThickness,0.25);assert.equal(style.wallThickness,0.25);
 assert.equal(styleForMigratedRoom('hbx_alcove_v3',DEFAULT_ROOM_STYLE),DEFAULT_ROOM_STYLE);
 assert.equal(fitRoomConfig({...room,modelId:'legacy'},390,450).elevationHeight,16);
});
test('imported geometry overrides material geometry together and preserves visibility and original config',()=>{
 const caller={...DEFAULT_ROOM_STYLE,materials:{...DEFAULT_ROOM_MATERIALS,walls:false},walls:false};
 const snapshot=structuredClone(caller),style=styleForMigratedRoom(room.modelId,caller);
 assert.equal(style.materials!.wallHeight,3.6);assert.equal(style.materials!.walls,false);assert.deepEqual(caller,snapshot);
 for(const elevationHeight of [0,Infinity,65])assert.throws(()=>fitRoomConfig(room,390,450,{...style,elevationHeight}));
});
test('high migrated floors remain selectable when height shifts both grid axes by nine tiles',()=>{
 const width=26,height=14,elevations=Array(width*height).fill(-1),walkability=Array(width*height).fill(false);
 elevations[12*width+21]=9;walkability[12*width+21]=true;
 const high={...room,width,height,elevations,walkability},style=styleForMigratedRoom(room.modelId,DEFAULT_ROOM_STYLE);
 const config=fitRoomConfig(high,390,450,style),center=roomToScreen(21,12,9,config);
 assert.deepEqual(resolveRoomTileAtScreen(center.x,center.y,high,config),{x:21,y:12,elevation:9,walkable:true});
});
test('migrated interior holes retain blocked geometry without adding tall walls; earlier contours preserved',()=>{
 const hole={...room,width:5,height:5,elevations:Array(25).fill(0),walkability:Array(25).fill(true),door:{x:0,y:2,direction:2}};
 hole.elevations[12]=-1;hole.walkability[12]=false;
 const style=styleForMigratedRoom(hole.modelId,DEFAULT_ROOM_STYLE),config=fitRoomConfig(hole,390,450,style);
 const native=buildRoomSurfaces(hole,config,style),earlier=buildRoomSurfaces(hole,config,DEFAULT_ROOM_STYLE);
 assert.equal(native.floors.length,24);assert.ok(!native.floors.some(f=>f.x===2&&f.y===2));
 assert.ok(!native.walls.some(w=>(w.x===3&&w.y===2&&w.side==='x')||(w.x===2&&w.y===3&&w.side==='y')));
 assert.ok(earlier.walls.some(w=>w.x===3&&w.y===2&&w.side==='x'));
 assert.ok(!native.walls.some(w=>w.x===0&&w.y===2));
 assert.ok(native.walls.some(w=>w.x===1&&w.y===2&&w.side==='x'));
});
