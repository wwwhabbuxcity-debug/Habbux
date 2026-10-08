// Compare releases in one browser, with paced GPU work and explicit warm-up.
// Only the already-installed Chromium/Playwright are used. SwiftShader != real GPU.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH ?? '/usr/lib/node_modules/playwright');
const output = resolve(process.env.HABBUX_VISUAL_OUTPUT ?? 'tmp/gallaxys-engine-parity-v2/after');
const candidate = process.env.HABBUX_VISUAL_BASE_URL ?? 'http://127.0.0.1:3124';
const baseline = process.env.HABBUX_BASELINE_URL;
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH ?? '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const results = [];
try {
  const releases=process.env.HABBUX_CACHE_EXPERIMENT === '1'
    ? [['cached',candidate,'&room-cache=1'],['geometry',candidate,'&room-cache=0']]
    : [...(baseline?[['baseline',baseline,'']]:[]),['candidate',candidate,'']];
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) for (const [release,base,query] of releases) {
    const context = await browser.newContext({viewport,deviceScaleFactor:viewport.width<500?2:1});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.routeWebSocket('**/ws',s=>s.close());
    await page.goto(base+'/client/?avatar-lab=1'+query,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.habbuxWorldLab);
    await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    for(const count of (process.env.HABBUX_BENCH_COUNTS ?? '2,5,10').split(',').map(Number)) {
      await page.evaluate(n=>window.habbuxWorldLab.scenario('long',n),count);
      await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      const measurement=await page.evaluate(async()=>{
        const lab=window.habbuxWorldLab;
        const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
        // Paused autonomous ticker: one render per RAF, exact walking phase.
        for(let i=0;i<30;i++){lab.step(16);await frame();}
        const before=lab.state();const deltas=[];const cpu=[];
        let last=await frame();
        for(let i=0;i<90;i++) {
          const start=performance.now();lab.step(16);cpu.push(performance.now()-start);
          const now=await frame();deltas.push(now-last);last=now;
        }
        const after=lab.state();
        const gl=document.querySelector('.world-lab-viewport canvas').getContext('webgl2');
        const ext=gl?.getExtension('WEBGL_debug_renderer_info');
        return {fps:90000/deltas.reduce((a,b)=>a+b,0),meanFrameMs:deltas.reduce((a,b)=>a+b,0)/90,
          p95FrameMs:[...deltas].sort((a,b)=>a-b)[85],maxFrameMs:Math.max(...deltas),cpuSubmitMs:cpu.reduce((a,b)=>a+b,0)/90,
          objects:after.objects,surfaceBuildsBefore:before.surfaceBuilds??null,surfaceBuildsAfter:after.surfaceBuilds??null,
          heapBytes:performance.memory?.usedJSHeapSize??null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
      });
      if(release==='candidate') assert.equal(measurement.surfaceBuildsBefore,measurement.surfaceBuildsAfter,'walk must not rebuild surfaces');
      results.push({viewport,release,count,...measurement});
      if (count === 10 && process.env.HABBUX_BURST === '1') {
        const burst=await page.evaluate(async()=>{
          const lab=window.habbuxWorldLab;
          // Reproduce the former test: 100 synchronous GPU submissions before
          // measuring ticker frames, with no queue drain / unmeasured warm-up.
          const started=performance.now();for(let i=0;i<100;i++)lab.step(16);
          const submitMs=(performance.now()-started)/100;
          lab.clock(false);const deltas=[];let last=performance.now();
          for(let i=0;i<60;i++)await new Promise(resolve=>requestAnimationFrame(now=>{deltas.push(now-last);last=now;resolve();}));
          lab.clock(true);
          return {fps:60000/deltas.reduce((a,b)=>a+b,0),maxFrameMs:Math.max(...deltas),cpuSubmitMs:submitMs};
        });
        results.push({viewport,release,count,method:'legacy-burst',...burst});
      }
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  await writeFile(resolve(output,'performance.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(({viewport,release,count,fps,cpuSubmitMs,objects})=>({width:viewport.width,release,count,fps,cpuSubmitMs,objects}))));
} finally {await browser.close();}
