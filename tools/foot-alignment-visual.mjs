// Real Pixi/browser proof. Existing scenarios also preserve hover/touch/walls.
await import('./gallaxys-parity-visual.mjs');
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { roomToScreen } from '../apps/client/src/renderer/isometric.ts';
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH??'/usr/lib/node_modules/playwright');
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT??'tmp/foot-alignment-v7/after');
const base=process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124';
const baseline=process.env.HABBUX_BASELINE_URL;
const manifest=JSON.parse(await readFile('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json','utf8'));
const steps=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const before=[],after=[],transitions=[],matrices=[],errors=[];
const existing=JSON.parse(await readFile(resolve(output,'parity-results.json'),'utf8'));
for(const d of existing.directions)for(const action of ['walk','stand'])for(const avatar of d[action].avatars){
  assert.ok(avatar.foot.errorPhysicalPx<1e-8);after.push({width:d.viewport.width,kind:'existing-'+action,direction:d.direction,avatar});
}
function fixture(dx=0,dy=0,z=0){return {roomId:'feet',name:'Feet V7',modelId:'fixture',width:12,height:12,capacity:10,
  spawn:{x:6,y:6},door:{x:0,y:0,direction:0},elevations:Array(144).fill(z),walkability:Array(144).fill(true),
  occupants:[{userId:'1',username:'Local fixture',x:6-dx,y:6-dy,z},{userId:'2',username:'Remote fixture',x:9-dx,y:6-dy,z}]};}
function assertFeet(state){for(const a of state.avatars){assert.ok(a.foot.errorPhysicalPx<1e-8,JSON.stringify(a.foot));assert.deepEqual(a.foot.containerOrigin,a.foot.tileCenter);}}
const browser=await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH??'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
try{
  for(const [width,height,dpr] of [[1280,900,1],[390,844,2],[1000,720,3]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width===390});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**/ws',s=>s.close());
    const canvas=page.locator('.world-lab-viewport canvas');
    async function open(url){await page.goto(url+'/client/?avatar-lab=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.habbuxWorldLab);await page.evaluate(()=>window.habbuxWorldLab.clock(true));}
    async function ready(){await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));await page.evaluate(()=>window.habbuxWorldLab.step(0));}
    if(baseline&&dpr!==3){
      await open(baseline);
      for(let d=0;d<8;d++){
        const [dx,dy]=steps[d];await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture(dx,dy));await ready();
        await page.evaluate(()=>{window.habbuxWorldLab.destination(6,6);window.habbuxWorldLab.step(1200);});
        const state=await page.evaluate(()=>window.habbuxWorldLab.state());
        for(let i=0;i<state.avatars.length;i++){
          const a=state.avatars[i],gender=i===0?'male':'female',support=manifest.footAnchors.genders[gender][d];
          const ranges=['lg','sh'].map(part=>{const f=manifest.parts[part].actions.std.genders[gender].directions[d].frames[0],r=manifest.regions[f.region];return [-f.offset.x,-f.offset.x+r.width];});
          const registration=(Math.min(...ranges.map(r=>r[0]))+Math.max(...ranges.map(r=>r[1])))/2;
          // Actual old container positions + old compositor's known transform.
          const screen={x:a.screenX+state.config.scale*(d>=4&&d<=6?-1:1)*(support.x-registration),y:a.screenY+state.config.scale*support.y};
          const tile=roomToScreen(a.x,a.y,a.z,state.config);
          before.push({width,dpr,gender,direction:d,screen,tile,errorCssPx:Math.hypot(screen.x-tile.x,screen.y-tile.y),errorPhysicalPx:Math.hypot(screen.x-tile.x,screen.y-tile.y)*dpr,method:'actual old container + verified compositor transform'});
        }
        await canvas.screenshot({path:resolve(output,`${width}-before-d${d}.png`)});
      }
    }
    await open(base);
    if(dpr!==3)for(const gender of ['male','female']){
      await page.goto(base+`/client/?avatar-lab=1&avatar-gender=${gender}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.habbuxAvatarLab&&window.habbuxWorldLab);
      await page.evaluate(()=>window.habbuxWorldLab.clock(true));const samples=await page.evaluate(()=>window.habbuxAvatarLab.samples);
      assert.equal(samples.length,40);assert.ok(samples.every(s=>s.errorPhysicalPx<1e-8));matrices.push({width,dpr,gender,samples});
      await page.locator('.avatar-lab-canvas').screenshot({path:resolve(output,`${width}-${gender}-foot-matrix.png`)});
    }
    await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture());await ready();await page.evaluate(()=>window.habbuxWorldLab.footDebug(true));
    const initial=await page.evaluate(()=>window.habbuxWorldLab.state());
    for(let d=0;d<8;d++){
      await page.evaluate(d=>{window.habbuxWorldLab.facing(d);window.habbuxWorldLab.step(0);},d);
      const state=await page.evaluate(()=>window.habbuxWorldLab.state());assertFeet(state);
      assert.deepEqual(state.avatars.map(a=>[a.screenX,a.screenY]),initial.avatars.map(a=>[a.screenX,a.screenY]));
      for(const avatar of state.avatars)after.push({width,dpr,kind:'idle-rotation',direction:d,avatar});
      await canvas.screenshot({path:resolve(output,`${width}-after-idle-d${d}.png`)});
    }
    for(let d=0;d<8;d++){
      const [dx,dy]=steps[d];await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture());await ready();
      await page.evaluate(({dx,dy})=>{window.habbuxWorldLab.destination(6+dx,6+dy);window.habbuxWorldLab.step(101);},{dx,dy});
      for(let f=0;f<4;f++){
        const state=await page.evaluate(()=>window.habbuxWorldLab.state());assertFeet(state);assert.ok(state.avatars.every(a=>a.action==='wlk'&&a.direction===d));
        for(const avatar of state.avatars)after.push({width,dpr,kind:'walk-frame',direction:d,frame:f,avatar});
        if(f===1)await canvas.screenshot({path:resolve(output,`${width}-after-walk-d${d}.png`)});
        await page.evaluate(()=>window.habbuxWorldLab.step(82));
      }
      const moving=await page.evaluate(()=>window.habbuxWorldLab.state());
      await page.evaluate(d=>{window.habbuxWorldLab.facing((d+1)%8);window.habbuxWorldLab.step(0);},d);
      const turned=await page.evaluate(()=>window.habbuxWorldLab.state());assertFeet(turned);
      assert.deepEqual(turned.avatars.map(a=>[a.screenX,a.screenY]),moving.avatars.map(a=>[a.screenX,a.screenY]));
      await page.evaluate(()=>window.habbuxWorldLab.step(1200));const end=await page.evaluate(()=>window.habbuxWorldLab.state());assertFeet(end);
      assert.deepEqual(end.avatars.map(a=>[a.x,a.y,a.moving]),[[6+dx,6+dy,false],[9+dx,6+dy,false]]);
      transitions.push({width,direction:d,walkingTurnStable:true,end});
    }
    for(const scenario of ['long','turn']){
      await page.evaluate(s=>window.habbuxWorldLab.scenario(s,2),scenario);await ready();const start=await page.evaluate(()=>window.habbuxWorldLab.state());
      for(const ms of [100,2000,3000,6000]){await page.evaluate(ms=>window.habbuxWorldLab.step(ms),ms);assertFeet(await page.evaluate(()=>window.habbuxWorldLab.state()));}
      const end=await page.evaluate(()=>window.habbuxWorldLab.state());assert.ok(end.avatars.every(a=>!a.moving));assert.equal(end.surfaceBuilds,start.surfaceBuilds);
      if(scenario==='long')assert.deepEqual(end.avatars.map(a=>[a.x,a.y]),[[21,1],[21,2]]);
      transitions.push({width,scenario,end});
    }
    await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture(0,0,3));await ready();assertFeet(await page.evaluate(()=>window.habbuxWorldLab.state()));
    await page.setViewportSize({width:width===390?844:920,height:width===390?390:650});await page.waitForTimeout(120);await ready();
    const resized=await page.evaluate(()=>window.habbuxWorldLab.state());assertFeet(resized);
    const bounds=await canvas.boundingBox(),point=resized.avatars[0].foot.tileCenter;
    if(width===390)await page.touchscreen.tap(bounds.x+point.x,bounds.y+point.y);else await page.mouse.move(bounds.x+point.x,bounds.y+point.y);
    assert.deepEqual(await page.evaluate(()=>window.habbuxWorldLab.state().hover),{x:6,y:6,elevation:3,walkable:true});
    await page.evaluate(()=>window.habbuxWorldLab.step(0));await canvas.screenshot({path:resolve(output,`${width}-resize-z3-hover.png`)});
    transitions.push({width,kind:'resize-z3-hover',state:await page.evaluate(()=>window.habbuxWorldLab.state())});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  const maxBefore=Math.max(...before.map(v=>v.errorPhysicalPx)),maxAfter=Math.max(...after.map(v=>v.avatar.foot.errorPhysicalPx));
  await writeFile(resolve(output,'foot-results.json'),JSON.stringify({before,after,transitions,matrices,errors,maxBeforePhysicalPx:maxBefore,maxAfterPhysicalPx:maxAfter},null,2));
  const pngs=(await readdir(output)).filter(f=>f.endsWith('.png'));
  await writeFile(resolve(output,'index.html'),'<!doctype html><meta charset="utf-8"><title>Habbux Foot V7</title><style>body{background:#14212b;color:white;font:16px sans-serif}img{max-width:100%;display:block}</style>'+pngs.map(f=>`<figure><figcaption>${f}</figcaption><img src="${f}" loading="lazy"></figure>`).join(''));
  console.log(JSON.stringify({before:before.length,after:after.length,matrices:matrices.length,pngs:pngs.length,maxBeforePhysicalPx:maxBefore,maxAfterPhysicalPx:maxAfter,errors}));
}finally{await browser.close();}
