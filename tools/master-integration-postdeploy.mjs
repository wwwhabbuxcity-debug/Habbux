// Public HTTPS/WSS smoke; no account creation or use of user credentials.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.env.HABBUX_PUBLIC_BASE_URL??'https://tyvo.online';
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT??'tmp/gallaxys-master-integration-v3/public');
await mkdir(output,{recursive:true});
const http=[];
for(const [path,file] of [['/','apps/web/dist/index.html'],['/client/','apps/client/dist/index.html'],['/game/',null]]){
  const response=await fetch(base+path),body=await response.text();assert.equal(response.status,200);
  const hash=createHash('sha256').update(body).digest('hex');
  if(file)assert.equal(hash,createHash('sha256').update(await readFile(file)).digest('hex'));
  http.push({path,status:response.status,sha256:hash,cacheControl:response.headers.get('cache-control')});
}
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH??'/usr/lib/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH??'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const pages=[];
try{
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1,hasTouch:width===390});
    const page=await context.newPage(),errors=[],failedRequests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failedRequests.push({status:r.status(),url:r.url()});});
    await page.goto(base+'/',{waitUntil:'networkidle'});await page.screenshot({path:resolve(output,`${width}-home.png`)});
    await page.goto(base+'/game/',{waitUntil:'networkidle'});await page.screenshot({path:resolve(output,`${width}-game-anonymous.png`)});
    await page.goto(base+'/client/?avatar-lab=1',{waitUntil:'networkidle'});
    if(await page.locator('#connection-state').textContent()==='DISCONNECTED')await page.locator('#connection-toggle').click();
    await page.waitForFunction(()=>document.querySelector('#connection-state')?.textContent==='READY');
    await page.waitForFunction(()=>window.habbuxWorldLab);await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    for(const scenario of ['stand','horizontal','vertical']){
      await page.evaluate(name=>window.habbuxWorldLab.scenario(name,2),scenario);await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      await page.evaluate(()=>window.habbuxWorldLab.step(400));const state=await page.evaluate(()=>window.habbuxWorldLab.state());
      assert.ok(state.avatars.every(a=>a.foot.errorPhysicalPx<1e-8));
      await page.locator('.world-lab-viewport canvas').screenshot({path:resolve(output,`${width}-${scenario}.png`)});
    }
    const continuity=[];
    if(process.env.HABBUX_VERIFY_CONTINUITY==='1')for(const jitter of [0,50]){
      await page.evaluate(()=>window.habbuxWorldLab.fixture({roomId:'public-v4-fixture',name:'V4 fixture',modelId:'fixture',width:12,height:12,capacity:10,spawn:{x:5,y:5},door:{x:0,y:0,direction:2},elevations:Array(144).fill(0),walkability:Array(144).fill(true),occupants:[{userId:'1',username:'Local fixture',x:5,y:5,z:0},{userId:'2',username:'Remote fixture',x:8,y:5,z:0}]}));
      await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));
      const measurement=await page.evaluate(jitter=>{
        const lab=window.habbuxWorldLab;let gapMs=0,maxFootError=0;
        function announce(sequence,diagonal){for(const [userId,offset] of [['1',0],['2',3]])lab.announce({userId,sequence,fromX:5+offset+(diagonal?1:0),fromY:5,fromZ:0,x:6+offset+(diagonal?1:0),y:diagonal?6:5,z:0,durationMs:diagonal?707:500,remainingMs:diagonal?707:500});}
        for(let now=0;now<=1700;now+=10){
          if(now===jitter)announce(1,false);
          if(now===500+jitter){for(const [id,offset] of [['1',0],['2',3]])lab.commit(id,6+offset,5,0);announce(2,true);}
          if(now===1300+jitter)for(const [id,offset] of [['1',0],['2',3]])lab.commit(id,7+offset,6,0);
          lab.step(10);const avatars=lab.state().avatars;
          if(now>=500+jitter&&now<=1200+jitter&&avatars.some(a=>!a.moving||a.action!=='wlk'))gapMs+=10;
          maxFootError=Math.max(maxFootError,...avatars.map(a=>a.foot.errorPhysicalPx));
        }
        return{jitterMs:jitter,gapMs,maxFootError,end:lab.state().avatars.map(a=>({x:a.x,y:a.y}))};
      },jitter);
      assert.equal(measurement.gapMs,0);assert.ok(measurement.maxFootError<1e-8);assert.deepEqual(measurement.end,[{x:7,y:6},{x:10,y:6}]);continuity.push(measurement);
    }
    // Repeat with this browser's existing HTTP cache; index is no-cache and JS hashed.
    await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#connection-state')?.textContent==='READY');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
    pages.push({width,wss:'READY',reloadWithCache:'PASS',errors,failedRequests,continuity,authenticatedRoom:'NOT RUN'});await context.close();
  }
  await writeFile(resolve(output,'postdeploy.json'),JSON.stringify({http,pages},null,2));console.log(JSON.stringify({http,pages}));
}finally{await browser.close();}
