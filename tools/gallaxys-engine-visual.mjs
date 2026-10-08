// Extend established hover, touch, motion and eight-direction regression checks.
await import('./gallaxys-parity-visual.mjs');
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH ?? '/usr/lib/node_modules/playwright');
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT ?? 'tmp/gallaxys-engine-parity-v2/after');
const base=process.env.HABBUX_VISUAL_BASE_URL ?? 'http://127.0.0.1:3124';
const manifest=JSON.parse(await readFile('apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json','utf8'));
const directions=JSON.parse(await readFile(resolve(output,'parity-results.json'),'utf8')).directions;
for(const direction of directions) for(const action of ['walk','stand']) for(const avatar of direction[action].avatars) {
  const parts=new Map(avatar.parts.map(p=>[p.part,p]));
  for(const part of ['lh','rh','ls','rs','bd','hd','ch','lg','sh']) {
    assert.ok(parts.get(part)?.visible && parts.get(part)?.alpha===1,`${part} missing in D${direction.direction}/${action}`);
  }
  assert.equal(parts.get('ey')?.visible ?? false,[1,2,3,4,5].includes(direction.direction));
}
const models=(await readFile('apps/emulator/src/main/resources/room-models-v1/models.tsv','utf8')).split('\n').filter(l=>l&&!l.startsWith('#')).map(line=>{
  const [id,w,h,dx,dy,dir,rows]=line.split('\t');
  const elevations=rows.split(',').flatMap(row=>[...row].map(c=>c==='x'?-1:parseInt(c,36)));
  return {roomId:'engine-'+id,name:id,modelId:id,width:Number(w),height:Number(h),capacity:10,
    spawn:{x:0,y:0},door:{x:Number(dx),y:Number(dy),direction:Number(dir)},elevations,walkability:elevations.map(z=>z>=0),occupants:[]};
});
const browser=await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH ?? '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const results={parts:[],models:[],errors:[]};
try {
  for(const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1,hasTouch:width===390});
    const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
    await page.routeWebSocket('**/ws',s=>s.close());
    if(width===1280) for(const gender of ['male','female']) for(const part of manifest.layerOrder) {
      await page.goto(base+`/client/?avatar-lab=1&avatar-gender=${gender}&avatar-parts=${part}`,{waitUntil:'networkidle'});
      const path=`${gender}-part-${part}-matrix.png`;
      await page.locator('.avatar-lab-canvas').screenshot({path:resolve(output,path)});
      results.parts.push({gender,part,path,directions:8,standFrames:1,walkFrames:4});
    }
    await page.goto(base+'/client/?avatar-lab=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.habbuxWorldLab);await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    for(const model of models) {
      await page.evaluate(r=>window.habbuxWorldLab.fixture(r),model);
      await page.evaluate(()=>window.habbuxWorldLab.step(0));
      const state=await page.evaluate(()=>window.habbuxWorldLab.state());
      assert.ok(state.surfaceBuilds>0);assert.ok(state.objects>=4);
      const path=`${width}-all-model-${model.modelId}.png`;
      await page.locator('.world-lab-viewport canvas').screenshot({path:resolve(output,path)});
      results.models.push({width,model:model.modelId,path,objects:state.objects,surfaces:state.surfaces});
    }
    await context.close();
  }
  assert.deepEqual(results.errors,[]);assert.equal(results.models.length,126);
  await writeFile(resolve(output,'engine-results.json'),JSON.stringify(results,null,2));
  const files=(await (await import('node:fs/promises')).readdir(output)).filter(f=>f.endsWith('.png'));
  await writeFile(resolve(output,'index.html'),'<!doctype html><meta charset="utf-8"><title>Habbux Engine V2</title><style>body{background:#14212b;color:white;font:16px sans-serif}img{max-width:100%;display:block}figure{margin:16px}</style><h1>Engine V2 · evidências do renderer</h1>'+files.map(f=>`<figure><figcaption>${f}</figcaption><img loading="lazy" src="${f}"></figure>`).join(''));
  console.log(JSON.stringify({parts:results.parts.length,models:results.models.length,pngs:files.length,errors:results.errors}));
}finally{await browser.close();}
