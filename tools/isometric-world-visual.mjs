// Optional isolated browser proof. Requires an existing Playwright + Chromium;
// never installs dependencies or registers accounts in an online hotel.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HABBUX_PLAYWRIGHT_PATH ?? '/usr/lib/node_modules/playwright');
const output = resolve(process.env.HABBUX_VISUAL_OUTPUT ?? 'tmp/isometric-world-v2/visual');
const base = process.env.HABBUX_VISUAL_BASE_URL ?? 'http://127.0.0.1:3124';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH ?? '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const results=[];
try {
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    const mobile=viewport.width<500;
    const context=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,hasTouch:mobile});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.routeWebSocket('**/ws',socket=>socket.close());
    const started=Date.now();
    await page.goto(base+'/client/?avatar-lab=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.habbuxWorldLab);
    await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    const loadMs=Date.now()-started;
    const canvas=page.locator('.world-lab-viewport canvas');
    const captures=[];
    for (const name of ['empty','walls','floor','elevation','stand','horizontal','left','vertical','diagonal','turn','long','near-wall','occlusion']) {
      await page.evaluate(name=>window.habbuxWorldLab.scenario(name),name);
      await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      await page.evaluate(()=>window.habbuxWorldLab.step(0));
      if(name==='floor') {
        await page.getByRole('button',{name:'Alternar paredes'}).click();
        await page.waitForFunction(()=>window.habbuxWorldLab.state().surfaces===0);
      }
      if (['horizontal','left','vertical','diagonal','long'].includes(name)) await page.evaluate(()=>window.habbuxWorldLab.step(400));
      if (name==='turn') await page.evaluate(()=>window.habbuxWorldLab.step(100+5*707+240));
      const state=await page.evaluate(()=>window.habbuxWorldLab.state());
      if(name==='horizontal')assert.equal(state.avatars[0].direction,1);
      if(name==='left')assert.equal(state.avatars[0].direction,5);
      if(name==='vertical')assert.equal(state.avatars[0].direction,3);
      if(name==='diagonal')assert.equal(state.avatars[0].direction,2);
      await canvas.screenshot({path:resolve(output,`${viewport.width}-${name}.png`)});
      captures.push({name,state});
      if(name==='floor') {
        await page.getByRole('button',{name:'Alternar paredes'}).click();
        await page.waitForFunction(()=>window.habbuxWorldLab.state().surfaces>0);
      }
    }
    // Capture four consecutive real compositor WALK frames in screen E.
    await page.evaluate(()=>{window.habbuxWorldLab.scenario('horizontal');window.habbuxWorldLab.step(101);});
    await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
    const frames=[];
    for(let i=0;i<4;i++) {
      await page.evaluate(()=>window.habbuxWorldLab.step(82));
      frames.push(await page.evaluate(()=>window.habbuxWorldLab.state().avatars[0].frame));
      await canvas.screenshot({path:resolve(output,`${viewport.width}-walk-frame-${i}.png`)});
    }
    assert.equal(new Set(frames).size,4);
    // Hover and touch use CSS coordinates even at DPR 2.
    await page.evaluate(()=>window.habbuxWorldLab.scenario('stand'));
    await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
    await page.evaluate(()=>window.habbuxWorldLab.step(0));
    const config=await page.evaluate(()=>window.habbuxWorldLab.state().config);
    const bounds=await canvas.boundingBox();
    const x=bounds.x+config.origin.x, y=bounds.y+config.origin.y+6*config.tileHeight*config.scale/2;
    if(mobile) await page.touchscreen.tap(x,y); else await page.mouse.move(x,y);
    const hit=await page.evaluate(()=>window.habbuxWorldLab.state().hover);
    assert.deepEqual(hit,{x:3,y:3,elevation:0,walkable:true});
    await page.evaluate(()=>window.habbuxWorldLab.step(0));
    await canvas.screenshot({path:resolve(output,`${viewport.width}-hover.png`)});
    if(mobile) {await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.habbuxWorldLab.state().hover),null);}
    const benchmarks=[];
    for(const count of [2,5,10]) {
      await page.evaluate(count=>window.habbuxWorldLab.scenario('long',count),count);
      await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      const cost=await page.evaluate(()=>{
        const start=performance.now();for(let i=0;i<100;i++)window.habbuxWorldLab.step(16);
        return {cpuSubmitMsPerFrame:(performance.now()-start)/100,heapBytes:performance.memory?.usedJSHeapSize??null,state:window.habbuxWorldLab.state()};
      });
      assert.equal(cost.state.avatars.length,count);
      assert.ok(cost.state.avatars.every(a=>a.moving&&a.queued<=256));
      benchmarks.push({count,...cost});
    }
    const timing=await page.evaluate(async()=>{
      window.habbuxWorldLab.clock(false);
      const deltas=[];let last=performance.now();
      for(let i=0;i<60;i++)await new Promise(resolve=>requestAnimationFrame(now=>{deltas.push(now-last);last=now;resolve();}));
      window.habbuxWorldLab.clock(true);
      return {fps:60000/deltas.reduce((a,b)=>a+b,0),frameMsMean:deltas.reduce((a,b)=>a+b,0)/60,frameMsMax:Math.max(...deltas)};
    });
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    results.push({viewport,dpr:mobile?2:1,loadMs,frames,hit,captures,benchmarks,timing,errors});
    await context.close();
  }
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(({captures,benchmarks,...r})=>({...r,captures:captures.length,benchmarks:benchmarks.map(({state,...b})=>b)})),null,2));
} finally {await browser.close();}
