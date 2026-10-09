// Same Chromium, paced frames, explicit warm-up. Software GPU results only.
import {createRequire} from 'node:module';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH??'/usr/lib/node_modules/playwright');
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT??'tmp/gallaxys-master-integration-v3');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH??'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const results=[];
const nativeRequested=process.env.HABBUX_BENCH_SCENARIOS?.split(',').includes('native-2');
const nativeFixture=nativeRequested?JSON.parse(await readFile('docs/gallaxys-master-integration-v3/models-original-fixtures.json','utf8')).find(m=>m.modelId==='hbx_alcove_v3'):null;
try{
  const bases={baseline:process.env.HABBUX_BASELINE_URL,candidate:process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124'};
  const order=(process.env.HABBUX_BENCH_ORDER??(bases.baseline?'baseline,candidate':'candidate')).split(',');
  for(const width of [1280,390])for(const [run,release] of order.entries()){
    const base=bases[release];assert.ok(base,`URL required for ${release}`);
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.routeWebSocket('**/ws',s=>s.close());
    await page.addInitScript(()=>{
      window.habbuxDrawCalls=0;
      // Patch only this diagnostic browser. Count calls from the actual room canvas.
      for(const prototype of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
        for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
          if(!Object.hasOwn(prototype,name))continue;
          const original=prototype[name];if(!original)continue;
          prototype[name]=function(...args){if(this.canvas?.closest('.world-lab-viewport'))window.habbuxDrawCalls++;return Reflect.apply(original,this,args);};
        }
      }
    });
    await page.goto(base+'/client/?avatar-lab=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.habbuxWorldLab);
    await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    for(const [scenario,count] of [['empty',0],['floor',0],['stand',2],['hover',2],['long',2],['long',10],...(nativeRequested?[['native',2]]:[])]){
      if(process.env.HABBUX_BENCH_SCENARIOS&&!process.env.HABBUX_BENCH_SCENARIOS.split(',').includes(`${scenario}-${count}`))continue;
      if(scenario==='native'){
        await page.evaluate(m=>window.habbuxWorldLab.fixture({...m,capacity:10,walkability:m.walkability.map(Boolean),spawn:{x:m.spawnX,y:m.spawnY},door:{x:m.doorX,y:m.doorY,direction:m.doorDirection},occupants:Array.from({length:2},(_,i)=>({userId:String(i+1),username:'Native fixture',x:m.spawnX,y:m.spawnY,z:m.elevations[m.spawnY*m.width+m.spawnX]}))}),nativeFixture);
        if(release==='candidate')await page.waitForFunction(()=>window.habbuxWorldLab.state().nativeTextures.length===2);
      }else await page.evaluate(({scenario,count})=>window.habbuxWorldLab.scenario(scenario==='hover'?'stand':scenario,count),{scenario,count});
      await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      if(scenario==='floor'){
        await page.getByRole('button',{name:'Alternar paredes'}).click();
        await page.waitForFunction(()=>window.habbuxWorldLab.state().surfaces===0);
      }
      const measured=await page.evaluate(async scenario=>{
        const lab=window.habbuxWorldLab,frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
        for(let i=0;i<30;i++){lab.step(16);await frame();}
        const before=lab.state(),cpu=[],frameMs=[];window.habbuxDrawCalls=0;let last=await frame();
        for(let i=0;i<90;i++){
          const start=performance.now();
          if(scenario==='hover'){
            const canvas=document.querySelector('.world-lab-viewport canvas'),rect=canvas.getBoundingClientRect(),c=before.config,x=3+i%2,y=3;
            canvas.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:rect.x+c.origin.x+(x-y)*c.tileWidth*c.scale/2,clientY:rect.y+c.origin.y+(x+y)*c.tileHeight*c.scale/2}));
          }
          lab.step(16);cpu.push(performance.now()-start);
          const now=await frame();frameMs.push(now-last);last=now;
        }
        const after=lab.state(),gl=document.querySelector('.world-lab-viewport canvas').getContext('webgl2');
        const ext=gl?.getExtension('WEBGL_debug_renderer_info');
        return{fps:90000/frameMs.reduce((a,b)=>a+b,0),cpuSubmitMs:cpu.reduce((a,b)=>a+b,0)/90,
          p95FrameMs:[...frameMs].sort((a,b)=>a-b)[85],drawCallsPerFrame:window.habbuxDrawCalls/90,
          heapBytes:performance.memory?.usedJSHeapSize??null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,
          objects:after.objects,sprites:after.spriteCount??null,textureSources:after.textureSourceCount??null,
          geometryBuildMs:after.geometryBuildMs??null,surfaceInstructions:after.surfaceInstructions??null,surfaceBuildsBefore:before.surfaceBuilds,surfaceBuildsAfter:after.surfaceBuilds};
      },scenario);
      assert.equal(measured.surfaceBuildsBefore,measured.surfaceBuildsAfter);
      results.push({width,dpr:width===390?2:1,release,run,scenario,count,...measured});
      if(scenario==='floor'){
        await page.getByRole('button',{name:'Alternar paredes'}).click();
        await page.waitForFunction(()=>window.habbuxWorldLab.state().surfaces>0);
      }
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  await writeFile(resolve(output,'performance-v3.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(({width,release,scenario,count,fps,cpuSubmitMs,drawCallsPerFrame,objects})=>({width,release,scenario,count,fps,cpuSubmitMs,drawCallsPerFrame,objects}))));
}finally{await browser.close();}
