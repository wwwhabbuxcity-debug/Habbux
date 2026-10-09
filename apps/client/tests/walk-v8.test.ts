import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarMovementController } from '../src/renderer/avatar-movement.ts';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from '../src/renderer/avatar-animation.ts';
import { decodeRoomMovementStep, type RoomMovementStep } from '../src/room/room-state.ts';

function step(sequence: number, fromX: number, fromY: number, x: number, y: number, remainingMs?: number): RoomMovementStep {
  const durationMs = fromX !== x && fromY !== y ? 707 : 500;
  return { sequence, fromX, fromY, fromZ: 0, x, y, z: 0, durationMs, remainingMs: remainingMs ?? durationMs };
}

test('cardinal→diagonal: pré-anúncio remove os 300 ms de pausa sem mudar velocidade', () => {
  const legacy = new AvatarMovementController(), future = new AvatarMovementController();
  legacy.setPosition(0,0,0,true); future.setPosition(0,0,0,true);
  future.announce(step(1,0,0,1,0));
  let legacyIdle = 0, futureIdle = 0;
  for (let time = 0; time <= 1500; time += 10) {
    if (time === 500) { legacy.setPosition(1,0); future.announce(step(2,1,0,2,1)); }
    if (time === 1300) legacy.setPosition(2,1);
    legacy.update(10); future.update(10);
    if (time >= 1100 && time < 1400 && !legacy.moving) legacyIdle += 10;
    if (time >= 110 && time < 1300 && !future.moving) futureIdle += 10;
  }
  assert.equal(legacyIdle,300); // 200 ms endpoint gap + 100 ms fresh startup buffer.
  assert.equal(futureIdle,0);
  assert.deepEqual([future.x,future.y,future.moving],[2,1,false]);
});

test('20 tiles mistos, 8 direções, tick quantizado e jitter inferior ao buffer conservam fase WALK', () => {
  const directions = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const m = new AvatarMovementController(), a = new AvatarAnimationController(WALK_FRAME_DURATION_MS);
  m.setPosition(10,10,0,true);
  let x=10,y=10,deadline=0;
  const events: {at:number;event:RoomMovementStep}[]=[];
  for(let i=0;i<20;i++) {
    const [dx,dy]=directions[i%8]!; const event=step(i+1,x,y,x+dx!,y+dy!);
    const at=Math.ceil(deadline/100)*100 + (i===0?20:(i%2)*5);
    events.push({at,event:{...event,remainingMs:Math.max(1,event.durationMs-(Math.ceil(deadline/100)*100-deadline))}});
    deadline+=event.durationMs;x+=dx!;y+=dy!;
  }
  let next=0,walking=0;
  for(let time=0;time<deadline+200;time+=5) {
    while(next<events.length && events[next]!.at<=time) m.announce(events[next++]!.event);
    const consumed=m.update(5);walking+=consumed;
    if(consumed>0){a.setMoving(true);a.advance(consumed,4);}a.setMoving(m.moving);
    if(time>=130 && time<deadline+110) assert.equal(m.moving,true,`idle ${time}`);
    if(m.moving) assert.equal(a.currentFrame,Math.floor(walking/82)%4);
  }
  assert.deepEqual([m.x,m.y,m.moving,m.queuedSegments],[x,y,false,0]);
  assert.equal(walking,deadline);
});

test('sequências repetidas ignoradas; terminal limpa fila; novos segmentos remotos não repetem buffer', () => {
  const m=new AvatarMovementController();m.setPosition(0,0,0,true);
  m.announce(step(1,0,0,1,0));m.announce(step(2,1,0,2,1));m.announce(step(2,1,0,2,1));
  assert.equal(m.queuedSegments,1);m.update(250);
  m.announce({...step(3,0,0,0,0),durationMs:0,remainingMs:0});
  assert.deepEqual([m.x,m.y,m.moving,m.queuedSegments],[0,0,false,0]);
  m.announce(step(4,0,0,1,0));m.update(10);assert.equal(m.x,0.02);
});

test('observador entra durante segmento e atraso maior que buffer não prediz endpoint desconhecido', () => {
  const m=new AvatarMovementController();m.setPosition(0,0,0,true);
  m.announce(step(1,0,0,1,0,200));assert.equal(m.x,0.6);
  m.update(300);assert.equal(m.x,1);assert.equal(m.moving,false);
  m.update(500);assert.equal(m.x,1);
  m.announce(step(2,1,0,2,1,600));m.update(10);
  assert.ok(m.x>1);assert.equal(m.moving,true);
});

test('codec limita sequência, geometria e duração, incluindo terminal explícito', () => {
  const payload=new Uint8Array(26),v=new DataView(payload.buffer);
  v.setBigUint64(0,42n);v.setBigUint64(8,1n);payload.set([0,0,0,1,1,0],16);v.setUint16(22,707);v.setUint16(24,707);
  assert.equal(decodeRoomMovementStep(payload).durationMs,707);
  assert.throws(()=>decodeRoomMovementStep(payload.slice(0,25)));
  const bad=payload.slice();new DataView(bad.buffer).setUint16(22,500);assert.throws(()=>decodeRoomMovementStep(bad));
  payload.fill(0,16);v.setUint16(22,0);v.setUint16(24,0);assert.equal(decodeRoomMovementStep(payload).durationMs,0);
  v.setBigUint64(8,BigInt(Number.MAX_SAFE_INTEGER)+1n);assert.throws(()=>decodeRoomMovementStep(payload));
});


test('terminal no endpoint garantido conserva duração restante e não teleporta', () => {
  const m=new AvatarMovementController();m.setPosition(0,0,0,true);m.announce(step(1,0,0,1,0));m.update(300);
  assert.equal(m.x,0.4);m.announce({...step(2,1,0,1,0),durationMs:0,remainingMs:0});
  assert.equal(m.x,0.4);m.update(300);assert.deepEqual([m.x,m.moving],[1,false]);
});

test('controller rejeita anúncio direto adulterado sem consumir sequência', () => {
  const m=new AvatarMovementController();m.setPosition(0,0,0,true);
  m.announce({...step(1,0,0,1,0),durationMs:707});assert.equal(m.x,0);
  m.announce({...step(1,0,0,1,0),remainingMs:501});assert.equal(m.x,0);
  m.announce(step(1,0,0,1,0));m.update(200);assert.equal(m.x,0.2);
});
