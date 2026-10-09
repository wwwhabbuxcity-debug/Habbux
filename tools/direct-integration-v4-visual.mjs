// Reuse the real renderer and V3 fixtures; bounded captures for the V4 changes.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {resolveConvertedMaterialsForModel} from '../apps/client/src/renderer/gallaxys-material-presets.ts';
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH??'/usr/lib/node_modules/playwright');
const base=process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124',output=resolve(process.env.HABBUX_VISUAL_OUTPUT);
await mkdir(output,{recursive:true});
const originals=JSON.parse(await readFile('docs/gallaxys-master-integration-v3/models-original-fixtures.json','utf8')).map(m=>({...m,capacity:10,walkability:m.walkability.map(Boolean),spawn:{x:m.spawnX,y:m.spawnY},door:{x:m.doorX,y:m.doorY,direction:m.doorDirection},occupants:[{userId:'1',username:'Local fixture',x:m.spawnX,y:m.spawnY,z:m.elevations[m.spawnY*m.width+m.spawnX]},{userId:'2',username:'Remote fixture',x:m.spawnX,y:m.spawnY,z:m.elevations[m.spawnY*m.width+m.spawnX]}]}));
const fixture=()=>({roomId:'v4',name:'V4 fixture',modelId:'fixture',width:12,height:12,capacity:10,spawn:{x:5,y:5},door:{x:0,y:0,direction:2},elevations:Array(144).fill(0),walkability:Array(144).fill(true),occupants:[{userId:'1',username:'Local fixture',x:5,y:5,z:0},{userId:'2',username:'Remote fixture',x:8,y:5,z:0}]});
const results={matrices:[],directions:[],models:[],movement:[],errors:[]},images=[];
function foot(state){assert.ok(state.avatars.every(a=>a.ready&&a.foot.errorPhysicalPx<1e-8));}
const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
try{
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1,hasTouch:width===390}),page=await context.newPage();
    page.on('pageerror',e=>results.errors.push(e.message));await page.routeWebSocket('**/ws',s=>s.close());
    const canvas=page.locator('.world-lab-viewport canvas');
    async function ready(){await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));await page.evaluate(()=>window.habbuxWorldLab.step(0));}
    async function capture(name,locator=canvas){const file=`${width}-${name}.png`;await locator.screenshot({path:resolve(output,file)});images.push(file);return file;}
    for(const gender of ['male','female']){
      await page.goto(base+`/client/?avatar-lab=1&avatar-gender=${gender}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.habbuxWorldLab);await page.evaluate(()=>window.habbuxWorldLab.clock(true));
      const samples=await page.evaluate(()=>window.habbuxAvatarLab.samples);assert.equal(samples.length,40);assert.ok(samples.every(s=>s.errorPhysicalPx<1e-8));
      results.matrices.push({width,gender,samples,path:await capture(`${gender}-matrix`,page.locator('.avatar-lab-canvas'))});
    }
    const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(let direction=0;direction<8;direction++){
      await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture());await ready();await page.evaluate(d=>window.habbuxWorldLab.facing(d),direction);
      const stand=await page.evaluate(()=>window.habbuxWorldLab.state());foot(stand);assert.ok(stand.avatars.every(a=>a.action==='std'));
      const standPath=await capture(`d${direction}-stand`),[dx,dy]=directions[direction];
      await page.evaluate(({dx,dy})=>{window.habbuxWorldLab.destination(5+dx,5+dy);window.habbuxWorldLab.step(101);},{dx,dy});
      const frames=[];
      for(let frame=0;frame<4;frame++){
        const state=await page.evaluate(()=>window.habbuxWorldLab.state());foot(state);assert.ok(state.avatars.every(a=>a.action==='wlk'&&a.frame===frame&&a.direction===direction));assert.equal(state.surfaceBuilds,stand.surfaceBuilds);
        frames.push(state.avatars);if(frame===1)await capture(`d${direction}-walk`);await page.evaluate(()=>window.habbuxWorldLab.step(82));
      }
      await page.evaluate(()=>window.habbuxWorldLab.step(1000));const stopped=await page.evaluate(()=>window.habbuxWorldLab.state());foot(stopped);assert.ok(stopped.avatars.every(a=>a.action==='std'));
      results.directions.push({width,direction,standPath,frames});
    }
    for(const model of originals){
      await page.evaluate(r=>window.habbuxWorldLab.fixture(r),model);await ready();const state=await page.evaluate(()=>window.habbuxWorldLab.state());foot(state);
      assert.deepEqual(state.materials,resolveConvertedMaterialsForModel(model.modelId));
      const cfg=state.config,bounds=await canvas.boundingBox(),x=model.spawn.x,y=model.spawn.y,z=model.elevations[y*model.width+x];
      const pointer={x:bounds.x+cfg.origin.x+(x-y)*cfg.tileWidth*cfg.scale/2,y:bounds.y+cfg.origin.y+(x+y)*cfg.tileHeight*cfg.scale/2-z*cfg.elevationHeight*cfg.scale};
      if(width===390)await page.touchscreen.tap(pointer.x,pointer.y);else await page.mouse.move(pointer.x,pointer.y);
      assert.deepEqual(await page.evaluate(()=>window.habbuxWorldLab.state().hover),{x,y,elevation:z,walkable:true});
      results.models.push({width,modelId:model.modelId,path:await capture(model.modelId),materials:state.materials,surfaceBuilds:state.surfaceBuilds});
    }
    for(const name of ['horizontal','vertical','diagonal','turn','long','near-wall','occlusion']){
      await page.evaluate(name=>window.habbuxWorldLab.scenario(name,2),name);await ready();const before=await page.evaluate(()=>window.habbuxWorldLab.state());
      for(const ms of [100,82,200,500,700,900]){await page.evaluate(ms=>window.habbuxWorldLab.step(ms),ms);foot(await page.evaluate(()=>window.habbuxWorldLab.state()));}
      const after=await page.evaluate(()=>window.habbuxWorldLab.state());assert.equal(after.surfaceBuilds,before.surfaceBuilds);results.movement.push({width,name,surfaceBuilds:after.surfaceBuilds,avatars:after.avatars});
    }
    await context.close();
  }
  assert.deepEqual(results.errors,[]);
  if(process.env.HABBUX_GALLAXYS_REFERENCE){
    for(let d=0;d<8;d++)for(const action of ['std','wlk'])await copyFile(resolve(process.env.HABBUX_GALLAXYS_REFERENCE,`gallaxys-${action}-d${d}.png`),resolve(output,`gallaxys-${action}-d${d}.png`));
  }
  await writeFile(resolve(output,'visual-v4.json'),JSON.stringify(results,null,2));
  const comparison=process.env.HABBUX_GALLAXYS_REFERENCE?Array.from({length:8},(_,d)=>`<article><h2>Direção ${d}</h2><p>Imager Gallaxys × Habbux; figuras/paletas e contextos diferentes, sem paridade autenticada.</p><img src="gallaxys-std-d${d}.png"><img width="430" src="1280-d${d}-stand.png"><img src="gallaxys-wlk-d${d}.png"><img width="430" src="1280-d${d}-walk.png"></article>`).join(''):'';
  await writeFile(resolve(output,'index.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Habbux V4</title><style>body{background:#17232e;color:white;font-family:Arial}article{padding:12px;border-bottom:1px solid #697d90}img{max-width:100%;image-rendering:pixelated;vertical-align:middle}</style><h1>Conversão seletiva V4</h1><p>Referências já existentes; sem novo download, autorização de sprites ou sessão autenticada Gallaxys.</p>${comparison}${images.map(i=>`<article>${i}<br><img src="${i}"></article>`).join('')}</html>`);
  console.log(JSON.stringify({matrices:results.matrices.length,directions:results.directions.length,models:results.models.length,scenes:results.movement.length,captures:images.length,errors:results.errors}));
}finally{await browser.close();}
