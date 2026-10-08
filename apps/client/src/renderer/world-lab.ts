import type { RoomState } from '../room/room-state';
import { RoomRenderer } from './room-renderer';
import { DEFAULT_ROOM_STYLE } from './room-surfaces';

export type WorldLabScenario = 'empty' | 'walls' | 'floor' | 'elevation' | 'stand' | 'horizontal' | 'left' | 'vertical' | 'diagonal' | 'turn' | 'long' | 'near-wall' | 'occlusion';
interface LabControl {
  scenario(name: WorldLabScenario, count?: number): void;
  step(ms: number): void;
  state(): object;
  clock(paused: boolean): void;
  destination(x: number, y: number): void;
  fixture(room: RoomState): void;
}
declare global { interface Window { habbuxWorldLab?: LabControl } }

/** DEV-only fixtures; all pixels and movement come from the production renderer. */
export async function mountWorldLab(host: HTMLElement): Promise<() => void> {
  const controls = document.createElement('div');
  const select = document.createElement('select');
  select.setAttribute('aria-label','Cenário do mundo isométrico');
  const scenarios: WorldLabScenario[] = ['empty','walls','floor','elevation','stand','horizontal','left','vertical','diagonal','turn','long','near-wall','occlusion'];
  for (const name of scenarios) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
  const label = document.createElement('p');
  label.textContent = 'Mundo V2 · geometria e AvatarView reais. Âncora e limites aparecem na matriz acima.';
  const viewport = document.createElement('div'); viewport.className = 'world-lab-viewport';
  const status = document.createElement('p');
  controls.append(label,select,status); host.append(controls,viewport);
  let room: RoomState;
  let running = true;
  const style = {...DEFAULT_ROOM_STYLE, cacheBackground: new URLSearchParams(window.location.search).get('room-cache') === '1'};
  let renderer = new RoomRenderer(viewport,status,(x,y)=>api.destination(x,y),style);
  await renderer.mount();
  function scenario(name: WorldLabScenario, count = 1): void {
    renderer.setRoom(null);
    const width = name==='long' ? 24 : 12, height=12;
    const elevations: number[] = Array(width*height).fill(0);
    if (name==='elevation') for (let y=0;y<height;y++) for (let x=6;x<width;x++) elevations[y*width+x] = Math.min(3,x-5);
    if (name==='occlusion') for (let y=3;y<=4;y++) for (let x=3;x<=4;x++) elevations[y*width+x]=-1;
    let startX=2, startY=7;
    if (name==='left') {startX=7;startY=2;}
    if (name==='vertical'||name==='diagonal'||name==='long') {startX=1;startY=1;}
    if (name==='near-wall') {startX=1;startY=0;}
    if (name==='occlusion') {startX=4;startY=2;}
    room = {roomId:'world-lab',name:'World Lab V2',modelId:'diagnostic-fixture',width,height,capacity:10,
      spawn:{x:1,y:1},door:{x:0,y:0,direction:2},elevations,walkability:elevations.map(z=>z>=0),
      occupants:['empty','walls','floor','elevation'].includes(name)?[]:Array.from({length:Math.min(10,Math.max(1,count))},(_,i)=>({userId:String(i+1),username:`Lab ${i+1}`,x:startX,y:startY+i,z:0}))};
    renderer.setRoom(room);
    const length=name==='long'?20:5;
    if (['horizontal','left','vertical','diagonal','turn','long'].includes(name)) {
      for (let step=1;step<=length;step++) {
        const dx=name==='left'?-1:1;
        const dy=name==='horizontal'||name==='turn'?-1:name==='left'||name==='vertical'?1:0;
        moveAll(dx,dy);
      }
      if (name==='turn') for (let step=0;step<3;step++) moveAll(0,1);
    }
    renderer.stepDiagnostics(0);
  }
  function moveAll(dx: number,dy: number): void {
    room={...room,occupants:room.occupants.map(o=>({...o,x:o.x+dx,y:o.y+dy,z:room.elevations[(o.y+dy)*room.width+o.x+dx]??0}))};
    renderer.setRoom(room);
  }
  const api: LabControl = {
    scenario, step:ms=>renderer.stepDiagnostics(ms), state:()=>renderer.diagnostics(),
    clock:paused=>{running=!paused;renderer.setDiagnosticsClock(paused);},
    fixture:next=>{renderer.setRoom(null);room=next;renderer.setRoom(room);renderer.stepDiagnostics(0);},
    destination:(x,y)=>{
      // This fixture driver does not replace server pathfinding. Only adjacent
      // valid diagnostic steps are allowed; the network room remains separate.
      const o=room.occupants[0]; if (!o || !room.walkability[y*room.width+x]) return;
      const dx=x-o.x,dy=y-o.y; if (Math.abs(dx)>1||Math.abs(dy)>1) return;
      moveAll(dx,dy);
    },
  };
  window.habbuxWorldLab=api;
  select.addEventListener('change',()=>scenario(select.value as WorldLabScenario));
  scenario('stand');
  // Compare optional floor-only presentation without changing game defaults.
  const toggle = document.createElement('button'); toggle.type='button'; toggle.textContent='Alternar paredes';
  let visibleWalls=true;
  toggle.addEventListener('click',()=>{
    visibleWalls=!visibleWalls;
    renderer.dispose();
    renderer=new RoomRenderer(viewport,status,(x,y)=>api.destination(x,y),{...style,walls:visibleWalls});
    void renderer.mount().then(()=>{renderer.setRoom(room);renderer.setDiagnosticsClock(!running);});
  });
  controls.append(toggle);
  return ()=>{delete window.habbuxWorldLab;renderer.dispose();controls.remove();viewport.remove();};
}
