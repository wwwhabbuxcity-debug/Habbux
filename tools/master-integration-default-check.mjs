// Final default materials must keep the published static rendering pixel for pixel.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH??'/usr/lib/node_modules/playwright');
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT??'tmp/gallaxys-master-integration-v3/default-check');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH??'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const results=[];
try{
  for(const width of [1280,390])for(const scene of ['empty','elevation','occlusion']){
    const pair=[];
    for(const [release,base] of [['baseline',process.env.HABBUX_BASELINE_URL??'http://127.0.0.1:3125'],['candidate',process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124']]){
      const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1});
      const page=await context.newPage();await page.routeWebSocket('**/ws',s=>s.close());
      await page.goto(base+'/client/?avatar-lab=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.habbuxWorldLab);
      await page.evaluate(scene=>{window.habbuxWorldLab.clock(true);window.habbuxWorldLab.scenario(scene,0);},scene);
      const pixels=await page.evaluate(async()=>{
        const lab=window.habbuxWorldLab;lab.step(0);
        const canvas=document.querySelector('.world-lab-viewport canvas'),gl=canvas.getContext('webgl2');
        const pixels=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const digest=await crypto.subtle.digest('SHA-256',pixels);
        return {width:canvas.width,height:canvas.height,nonzero:pixels.some(v=>v>0),rgbaSha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),state:lab.state()};
      });
      assert.ok(pixels.nonzero);pair.push({release,...pixels});
      await page.locator('.world-lab-viewport canvas').screenshot({path:resolve(output,`${width}-${scene}-${release}.png`)});await context.close();
    }
    assert.deepEqual([pair[0].width,pair[0].height],[pair[1].width,pair[1].height]);
    assert.equal(pair[0].rgbaSha256,pair[1].rgbaSha256,`${width}/${scene}: default pixel regression`);
    results.push({width,scene,pair});
  }
  await writeFile(resolve(output,'default-check.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({pairs:results.length,pixelIdentical:true}));
}finally{await browser.close();}
