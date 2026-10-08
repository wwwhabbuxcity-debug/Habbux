import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarMovementController, MOVEMENT_PRESENTATION_BUFFER_MS, MAX_QUEUED_SEGMENTS } from '../src/renderer/avatar-movement.ts';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from '../src/renderer/avatar-animation.ts';
import { DEFAULT_ISO_CONFIG, roomToScreen, screenToRoom, tilePolygon } from '../src/renderer/isometric.ts';
import { resolveAvatarDirection } from '../src/renderer/avatar-direction.ts';
import { buildRoomSurfaces, DEFAULT_ROOM_STYLE, fitRoomConfig } from '../src/renderer/room-surfaces.ts';
import { resolveRoomTileAtScreen } from '../src/renderer/tile-interaction.ts';
import type { RoomState } from '../src/room/room-state.ts';

const room: RoomState = { roomId: '1', name: 'fixture', width: 3, height: 3, capacity: 10,
  modelId: 'fixture', spawn: { x: 0, y: 0 }, door: { x: 0, y: 0, direction: 0 }, occupants: [],
  elevations: Array(9).fill(0), walkability: Array(9).fill(true) };

for (const [dx, dy, direction, sx, sy] of [[1,-1,1,1,0],[1,0,2,1,1],[1,1,3,0,1],[0,1,4,-1,1],[-1,1,5,-1,0],[-1,0,6,-1,-1],[-1,-1,7,0,-1],[0,-1,0,1,-1]]) {
  test(`direção ${direction}: grid (${dx},${dy}) concorda com projeção e sprite`, () => {
    const p = roomToScreen(dx!, dy!);
    assert.equal(Math.sign(p.x), sx); assert.equal(Math.sign(p.y), sy);
    assert.equal(resolveAvatarDirection(dx!, dy!), direction);
  });
}
for (const length of [1,5,10,20]) {
  for (const diagonal of [false,true]) {
    test(`${length} passos ${diagonal ? 'diagonais' : 'cardinais'} preservam tempo com FPS variável e sobra de frame`, () => {
      const m = new AvatarMovementController(); m.setPosition(0, 20, 0, true);
      for (let i = 1; i <= length; i++) m.setPosition(i, diagonal ? 20-i : 20, 0);
      const duration = length * (diagonal ? 707 : 500);
      let elapsed = 0;
      const total = duration + MOVEMENT_PRESENTATION_BUFFER_MS;
      for (const delta of [16,33,8,250,1000]) {
        const take = Math.min(delta, total-elapsed-1); m.update(take); elapsed += take;
      }
      m.update(total-elapsed-1);
      assert.equal(m.moving, true);
      m.update(1); assert.equal(m.moving, false);
      assert.equal(m.x, length); assert.equal(m.y, diagonal ? 20-length : 20);
      assert.equal(m.queuedSegments, 0);
    });
  }
}
test('curva muda orientação no início do segmento sem perder sobra de tempo', () => {
  const m = new AvatarMovementController(); m.setPosition(2, 4, 0, true);
  m.setPosition(3,3); m.setPosition(4,3);
  m.update(100+707+100);
  assert.equal(m.direction, 2); assert.equal(m.x, 3.2); assert.equal(m.y, 3);
  assert.equal(m.moving, true);
});
test('pacotes quantizados pelo tick são absorvidos sem STAND entre diagonais', () => {
  const m = new AvatarMovementController(); m.setPosition(0,0,0,true); m.setPosition(1,1);
  let next = 2;
  // Arrival gaps alternate 700/800 ms, matching carried 707 ms deadlines.
  for (let time = 10; time < 3600; time += 10) {
    if (time >= Math.ceil((next-1)*707/100)*100 && next <= 6) m.setPosition(next,next++);
    m.update(10);
    if (time > 100) assert.equal(m.moving, true, `idle at ${time}`);
  }
});
test('correção autoritativa limpa fila e overflow não perde passos silenciosamente', () => {
  const m = new AvatarMovementController(); m.setPosition(0,0,0,true);
  for (let x=1; x <= MAX_QUEUED_SEGMENTS+2; x++) m.setPosition(x,0);
  assert.equal(m.queuedSegments, 0); assert.equal(m.x, MAX_QUEUED_SEGMENTS+2);
  m.setPosition(1,1,3,true); assert.equal(m.z,3); assert.equal(m.moving,false);
  m.update(NaN); assert.equal(m.x,1);
});
test('WALK conserva cadência com frame demorado e mudança de direção', () => {
  const a = new AvatarAnimationController(WALK_FRAME_DURATION_MS); a.setMoving(true);
  a.update(820); assert.equal(a.snapshot().frame,2);
  a.setMoving(true); a.update(82); assert.equal(a.snapshot().frame,3);
  a.setMoving(false); assert.equal(a.snapshot().action,'std');
});
for (const scale of [0.3,1,1.2,2]) {
  test(`projeção inversa com Z e escala ${scale}; DPR fica fora das coordenadas CSS`, () => {
    const config = {...DEFAULT_ISO_CONFIG,scale,origin:{x:142,y:87}};
    for (const z of [0,1,8,35]) {
      const p = roomToScreen(7,3,z,config), r = screenToRoom(p.x,p.y,config,z);
      assert.ok(Math.abs(r.x-7)<1e-9 && Math.abs(r.y-3)<1e-9);
    }
  });
}
test('piso contínuo extruda só seis bordas externas e paredes encaixam nos vértices', () => {
  const surfaces = buildRoomSurfaces(room,DEFAULT_ISO_CONFIG);
  assert.equal(surfaces.floors.length,9); assert.equal(surfaces.floors.flatMap(f=>f.sides).length,6);
  assert.equal(surfaces.walls.length,6);
  for (const wall of surfaces.walls) {
    const top = tilePolygon(roomToScreen(wall.x,wall.y));
    assert.deepEqual(wall.base,[top[0],top[wall.side==='x'?3:1]]);
    assert.equal(wall.front.polygon[0]!.y-wall.front.polygon[3]!.y,128);
    assert.ok(wall.depth < wall.x+wall.y);
  }
  const [x,y] = surfaces.walls.filter(w=>w.x===0&&w.y===0);
  assert.deepEqual(x!.cap.polygon[3],y!.cap.polygon[3]);
});
test('vazio não gera piso; recortes produzem paredes locais e elevação gera face sem buracos', () => {
  const stepped = {...room,elevations:[0,0,0,0,-1,0,0,1,2],walkability:[true,true,true,true,false,true,true,true,true]};
  const s = buildRoomSurfaces(stepped,DEFAULT_ISO_CONFIG);
  assert.equal(s.floors.length,8); assert.ok(s.walls.length>6);
  const high = s.floors.find(f=>f.x===2&&f.y===2)!;
  assert.equal(high.sides[0]!.polygon[2]!.y-high.sides[0]!.polygon[1]!.y,40);
});
test('camera cabe desktop/mobile incluindo altura, espessura, recorte e hover elevado', () => {
  const elevated = {...room,elevations:Array(9).fill(4)};
  for (const [width,height] of [[1280,720],[390,500],[844,390]]) {
    const config = fitRoomConfig(elevated,width!,height!);
    const s = buildRoomSurfaces(elevated,config);
    for (const face of [...s.floors.map(f=>f.top),...s.walls.flatMap(w=>[w.front,w.cap])]) {
      for (const p of face.polygon) assert.ok(p.x>=0&&p.x<=width!&&p.y>=0&&p.y<=height!);
    }
    const p = roomToScreen(1,1,4,config);
    assert.deepEqual(resolveRoomTileAtScreen(p.x,p.y,elevated,config),{x:1,y:1,elevation:4,walkable:true});
  }
  assert.equal(buildRoomSurfaces(room,DEFAULT_ISO_CONFIG,{...DEFAULT_ROOM_STYLE,walls:false}).walls.length,0);
});
test('2, 5 e 10 avatares mantêm filas independentes e estado removível', () => {
  for (const count of [2,5,10]) {
    const avatars = Array.from({length:count},()=>new AvatarMovementController());
    for (const m of avatars) {m.setPosition(0,0,0,true);m.setPosition(1,-1);m.setPosition(2,-2);m.update(100+707);assert.equal(m.direction,1);}
    avatars[0]!.setPosition(20,20,0,true);
    for (const m of avatars.slice(1)) {m.update(707);assert.equal(m.x,2);assert.equal(m.queuedSegments,0);}
  }
});
