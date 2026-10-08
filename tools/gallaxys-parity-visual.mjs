// Isolated real-renderer evidence. Run after a build against a loopback static root.
// Reuses the existing scene, hover/touch, queue and software-rendering benchmarks.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
await import('./isometric-world-visual.mjs');
const { chromium } = createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH ?? '/usr/lib/node_modules/playwright');
const output = resolve(process.env.HABBUX_VISUAL_OUTPUT ?? 'tmp/gallaxys-parity-v1/after');
const base = process.env.HABBUX_VISUAL_BASE_URL ?? 'http://127.0.0.1:3124';
const baseline = process.env.HABBUX_PARITY_BASELINE === '1';
const browser = await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH ?? '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const results = { baseline,matrices:[],directions:[],models:[],motion:[],errors:[] };
const modelIds = ['model_s','model_v','star_lounge','model_oscar','model_room_15','picnic'];
const models = (await readFile('apps/emulator/src/main/resources/room-models-v1/models.tsv','utf8')).split('\n').filter(l=>l&&!l.startsWith('#')).map(line=>{
  const [id,width,height,dx,dy,dir,rows] = line.split('\t');
  const elevations = rows.split(',').flatMap(row=>[...row].map(c=>c.toLowerCase()==='x'?-1:parseInt(c,36)));
  return {roomId:'parity-'+id,name:id,modelId:id,width:Number(width),height:Number(height),capacity:10,
    door:{x:Number(dx),y:Number(dy),direction:Number(dir)},spawn:{x:0,y:0},elevations,walkability:elevations.map(z=>z>=0),occupants:[]};
}).filter(m=>modelIds.includes(m.modelId));
try {
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    const mobile=viewport.width<500;
    const context=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,hasTouch:mobile});
    const page=await context.newPage();
    page.on('pageerror',e=>results.errors.push(e.message));
    await page.routeWebSocket('**/ws',s=>s.close());
    async function open(gender='male') {
      await page.goto(base+`/client/?avatar-lab=1&avatar-gender=${gender}`,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.habbuxWorldLab);
      await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    }
    async function ready() {
      await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      await page.evaluate(()=>window.habbuxWorldLab.step(0));
    }
    await open();
    if (!baseline && !mobile) {
      for(const gender of ['male','female']) {
        await open(gender);
        const path=`${gender}-matrix.png`;
        await page.locator('.avatar-lab-canvas').screenshot({path:resolve(output,path)});
        results.matrices.push({gender,path,standDirections:8,walkDirections:8,walkFrames:4});
      }
    }
    await page.evaluate(()=>window.habbuxWorldLab.scenario('horizontal'));
    await ready();await page.evaluate(()=>window.habbuxWorldLab.step(182));
    const samples=[];
    for(let i=0;i<20;i++) {await page.evaluate(()=>window.habbuxWorldLab.step(16));samples.push(await page.evaluate(()=>window.habbuxWorldLab.state().avatars[0]));}
    const repeatedPositions=samples.slice(1).filter((s,i)=>s.screenX===samples[i].screenX).length;
    if(!baseline) {assert.equal(repeatedPositions,0);assert.ok(samples.some(s=>s.screenX%1!==0));}
    results.motion.push({viewport,repeatedPositions,samples});
    if(!baseline) {
      const fixture={roomId:'directions',name:'two avatars',modelId:'fixture',width:12,height:12,capacity:10,
        door:{x:0,y:0,direction:0},spawn:{x:5,y:5},elevations:Array(144).fill(0),walkability:Array(144).fill(true),
        occupants:[{userId:'1',username:'Male/female 1',x:5,y:5,z:0},{userId:'2',username:'Male/female 2',x:8,y:5,z:0}]};
      const steps=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
      const canvas=page.locator('.world-lab-viewport canvas');
      for(let direction=0;direction<8;direction++) {
        await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture);await ready();
        const [dx,dy]=steps[direction];
        await page.evaluate(({dx,dy})=>window.habbuxWorldLab.destination(5+dx,5+dy),{dx,dy});
        await page.evaluate(()=>window.habbuxWorldLab.step(264));
        const walk=await page.evaluate(()=>window.habbuxWorldLab.state());
        assert.ok(walk.avatars.every(a=>a.action==='wlk'&&a.direction===direction));
        await canvas.screenshot({path:resolve(output,`${viewport.width}-d${direction}-walk.png`)});
        await page.evaluate(()=>window.habbuxWorldLab.step(900));
        const stand=await page.evaluate(()=>window.habbuxWorldLab.state());
        assert.ok(stand.avatars.every(a=>a.action==='std'&&a.direction===direction&&!a.moving));
        await canvas.screenshot({path:resolve(output,`${viewport.width}-d${direction}-stand.png`)});
        results.directions.push({viewport,direction,walk,stand});
      }
      for(const model of models) {
        await page.evaluate(r=>window.habbuxWorldLab.fixture(r),model);await ready();
        await canvas.screenshot({path:resolve(output,`${viewport.width}-model-${model.modelId}.png`)});
        results.models.push({viewport,model:model.modelId,state:await page.evaluate(()=>window.habbuxWorldLab.state())});
      }
      // Resize the same renderer, then verify the elevated surface hit at CSS coordinates.
      await page.evaluate(()=>window.habbuxWorldLab.scenario('elevation'));
      await page.setViewportSize({width:mobile?844:1000,height:mobile?390:720});
      await page.waitForTimeout(120);await page.evaluate(()=>window.habbuxWorldLab.step(0));
      const cfg=await page.evaluate(()=>window.habbuxWorldLab.state().config);
      const bounds=await canvas.boundingBox();
      // Use the plateau interior; the centre of the rising step at x=7 is
      // occluded by the front edge of x=8 and intentionally selects that face.
      const x=bounds.x+cfg.origin.x+(9-3)*cfg.tileWidth*cfg.scale/2;
      const y=bounds.y+cfg.origin.y+(9+3)*cfg.tileHeight*cfg.scale/2-3*cfg.elevationHeight*cfg.scale;
      if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.move(x,y);
      assert.deepEqual(await page.evaluate(()=>window.habbuxWorldLab.state().hover),{x:9,y:3,elevation:3,walkable:true});
      await page.evaluate(()=>window.habbuxWorldLab.step(0));
      await canvas.screenshot({path:resolve(output,`${viewport.width}-resize-elevated-hit.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await context.close();
  }
  assert.deepEqual(results.errors,[]);
  await writeFile(resolve(output,'parity-results.json'),JSON.stringify(results,null,2));
  const pngs=(await import('node:fs/promises')).readdir;
  const files=(await pngs(output)).filter(f=>f.endsWith('.png'));
  await writeFile(resolve(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Habbux parity evidence</title><style>body{background:#14212b;color:white;font:16px sans-serif}img{max-width:100%;display:block}figure{margin:16px}</style><h1>${baseline?'Baseline':'Gallaxys parity V1'}</h1>`+files.map(f=>`<figure><figcaption>${f}</figcaption><img src="${f}" loading="lazy"></figure>`).join(''));
  console.log(JSON.stringify({matrices:results.matrices.length,directions:results.directions.length,models:results.models.length,motion:results.motion.map(m=>({width:m.viewport.width,repeatedPositions:m.repeatedPositions})),pngs:files.length,errors:results.errors}));
} finally {await browser.close();}
