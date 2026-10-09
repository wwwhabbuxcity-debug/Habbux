// Real Pixi captures: directions, foot support, shared geometry and materials.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.HABBUX_PLAYWRIGHT_PATH??'/usr/lib/node_modules/playwright');
const base=process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124';
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT??'tmp/gallaxys-master-integration-v3');
await mkdir(output,{recursive:true});
const {DEFAULT_ROOM_MATERIALS}=await import('../apps/client/src/renderer/room-materials.ts');
const originals=JSON.parse(await readFile('docs/gallaxys-master-integration-v3/models-original-fixtures.json','utf8')).map(m=>({...m,capacity:10,walkability:m.walkability.map(Boolean),spawn:{x:m.spawnX,y:m.spawnY},door:{x:m.doorX,y:m.doorY,direction:m.doorDirection},occupants:[]}));
const legacy=(await readFile('apps/emulator/src/main/resources/room-models-v1/models.tsv','utf8')).split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{
  const [id,w,h,dx,dy,dir,rows]=l.split('\t');const elevations=rows.split(',').flatMap(r=>[...r].map(c=>c==='x'?-1:parseInt(c,36)));
  return{roomId:id,name:id,modelId:id,width:+w,height:+h,capacity:10,spawn:{x:0,y:0},door:{x:+dx,y:+dy,direction:+dir},elevations,walkability:elevations.map(z=>z>=0),occupants:[]};
});
const models=[...legacy,...originals],results={directions:[],models:[],materials:[],scenes:[],matrices:[],movement:[],errors:[]};
const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const fixture=()=>({roomId:'v3',name:'Integration V3',modelId:'fixture',width:12,height:12,capacity:10,spawn:{x:5,y:5},door:{x:0,y:0,direction:2},elevations:Array(144).fill(0),walkability:Array(144).fill(true),occupants:[{userId:'1',username:'Local fixture',x:5,y:5,z:0},{userId:'2',username:'Remote fixture',x:8,y:5,z:0}]});
function checkFoot(state){for(const a of state.avatars){assert.ok(a.foot.errorPhysicalPx<1e-8);assert.deepEqual(a.foot.containerOrigin,a.foot.tileCenter);}}
const browser=await chromium.launch({headless:true,executablePath:process.env.HABBUX_CHROMIUM_PATH??'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
try{
  for(const [width,dpr] of [[1280,1],[390,2],[1000,3]]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:dpr,hasTouch:width===390});
    const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));await page.routeWebSocket('**/ws',s=>s.close());
    const canvas=page.locator('.world-lab-viewport canvas');
    async function open(gender='male'){
      await page.goto(base+`/client/?avatar-lab=1&avatar-gender=${gender}`,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.habbuxWorldLab);await page.evaluate(()=>window.habbuxWorldLab.clock(true));
    }
    async function ready(){await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));await page.evaluate(()=>window.habbuxWorldLab.step(0));}
    await open();
    if(dpr!==3)for(const gender of ['male','female']){
      await open(gender);const samples=await page.evaluate(()=>window.habbuxAvatarLab.samples);
      assert.equal(samples.length,40);assert.ok(samples.every(s=>s.errorPhysicalPx<1e-8));
      const path=`${width}-${gender}-matrix.png`;await page.locator('.avatar-lab-canvas').screenshot({path:resolve(output,path)});results.matrices.push({width,dpr,gender,samples,path});
    }
    await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture());await ready();
    for(let direction=0;direction<8;direction++){
      await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture());await ready();
      const [dx,dy]=directions[direction];await page.evaluate(({dx,dy})=>{window.habbuxWorldLab.destination(5+dx,5+dy);window.habbuxWorldLab.step(101);},{dx,dy});
      const frames=[];
      for(let frame=0;frame<4;frame++){
        const state=await page.evaluate(()=>window.habbuxWorldLab.state());checkFoot(state);
        for(const a of state.avatars){
          assert.equal(a.action,'wlk');assert.equal(a.direction,direction);
          const parts=new Map(a.parts.map(p=>[p.part,p]));
          for(const part of ['lh','rh','ls','rs','bd','hd','ch','lg','sh'])assert.ok(parts.get(part)?.visible&&parts.get(part)?.alpha===1);
          assert.equal(parts.get('ey')?.visible??false,[1,2,3,4,5].includes(direction));
        }
        frames.push(state);
        if(frame===1)await canvas.screenshot({path:resolve(output,`${width}-d${direction}-walk.png`)});
        await page.evaluate(()=>window.habbuxWorldLab.step(82));
      }
      assert.equal(new Set(frames.map(s=>s.avatars[0].frame)).size,4);
      await page.evaluate(()=>window.habbuxWorldLab.step(1200));const stand=await page.evaluate(()=>window.habbuxWorldLab.state());checkFoot(stand);
      assert.ok(stand.avatars.every(a=>!a.moving&&a.action==='std'&&a.direction===direction));
      results.directions.push({width,dpr,direction,frames,stand});
    }
    if(dpr!==3){
      // Deliver the actual server timeline rather than enqueueing an entire path.
      // Cardinal deadline 500, diagonal deadline 1207 observed on tick 1300.
      for(const jitter of [0,50]){
        await page.evaluate(r=>window.habbuxWorldLab.fixture(r),fixture());await ready();
        const measurement=await page.evaluate(jitter=>{
          const lab=window.habbuxWorldLab,samples=[];
          const announce=(sequence,diagonal)=>{
            for(const [userId,offset] of [['1',0],['2',3]])lab.announce({userId,sequence,
              fromX:5+offset+(diagonal?1:0),fromY:5,fromZ:0,x:6+offset+(diagonal?1:0),y:diagonal?6:5,z:0,
              durationMs:diagonal?707:500,remainingMs:diagonal?707:500});
          };
          for(let now=0;now<=1700;now+=10){
            if(now===jitter)announce(1,false);
            if(now===500+jitter){for(const [id,offset] of [['1',0],['2',3]])lab.commit(id,6+offset,5,0);announce(2,true);}
            if(now===1300+jitter)for(const [id,offset] of [['1',0],['2',3]])lab.commit(id,7+offset,6,0);
            lab.step(10);const state=lab.state();samples.push({now,...state.avatars[0],remote:state.avatars[1]});
          }
          const gaps=samples.filter(s=>s.now>=500+jitter&&s.now<=1200+jitter&&!s.moving);
          return{jitterMs:jitter,gapMs:gaps.length*10,samples};
        },jitter);
        assert.equal(measurement.gapMs,0);for(const sample of measurement.samples){checkFoot({avatars:[sample,sample.remote]});}
        assert.deepEqual(measurement.samples.at(-1).x,7);assert.deepEqual(measurement.samples.at(-1).y,6);
        await canvas.screenshot({path:resolve(output,`${width}-announced-jitter${jitter}.png`)});
        results.movement.push({width,...measurement});
      }
      for(const model of models){
        await page.evaluate(r=>window.habbuxWorldLab.fixture(r),model);await ready();const state=await page.evaluate(()=>window.habbuxWorldLab.state());
        assert.ok(state.surfaceBuilds>0);const path=`${width}-model-${model.modelId}.png`;
        await canvas.screenshot({path:resolve(output,path)});results.models.push({width,id:model.modelId,path,state});
      }
      for(const name of ['empty','walls','floor','elevation','stand','horizontal','left','vertical','diagonal','turn','long','near-wall','occlusion']){
        await page.evaluate(name=>window.habbuxWorldLab.scenario(name,2),name);await ready();
        await page.evaluate(()=>window.habbuxWorldLab.step(400));const start=await page.evaluate(()=>window.habbuxWorldLab.state());checkFoot(start);
        const path=`${width}-${name}.png`;await canvas.screenshot({path:resolve(output,path)});
        if(['turn','long'].includes(name)){
          for(const ms of [2000,3000,6000]){await page.evaluate(ms=>window.habbuxWorldLab.step(ms),ms);checkFoot(await page.evaluate(()=>window.habbuxWorldLab.state()));}
          const end=await page.evaluate(()=>window.habbuxWorldLab.state());assert.equal(end.surfaceBuilds,start.surfaceBuilds);assert.ok(end.avatars.every(a=>!a.moving));
        }
        results.scenes.push({width,name,path,state:start});
      }
      for(const [name,configuration] of [
        ['default',DEFAULT_ROOM_MATERIALS],
        ['stone-panel',{...DEFAULT_ROOM_MATERIALS,floor:{...DEFAULT_ROOM_MATERIALS.floor,id:'original-stone',mainColor:0xaaa8a4,secondaryColor:0x545254,repeatScale:2,texture:{kind:'slabs',rights:'AUTHORIZED',provenance:'Habbux original procedural'}},wall:{...DEFAULT_ROOM_MATERIALS.wall,id:'original-panel',mainColor:0xc2a889,texture:{kind:'panels',rights:'AUTHORIZED',provenance:'Habbux original procedural'}}}],
        ['plain',{...DEFAULT_ROOM_MATERIALS,floor:{...DEFAULT_ROOM_MATERIALS.floor,mainColor:0xb2b6c4,texture:undefined,finish:'plain'},wall:{...DEFAULT_ROOM_MATERIALS.wall,mainColor:0xab96bf,texture:undefined,finish:'plain'},wallHeight:12,wallThickness:0.3}],
        ['translucent',{...DEFAULT_ROOM_MATERIALS,floor:{...DEFAULT_ROOM_MATERIALS.floor,opacity:0.65},wall:{...DEFAULT_ROOM_MATERIALS.wall,opacity:0.7}}],
      ]){
        await page.evaluate(()=>window.habbuxWorldLab.scenario('occlusion',2));await ready();await page.evaluate(c=>window.habbuxWorldLab.materials(c),configuration);
        const state=await page.evaluate(()=>window.habbuxWorldLab.state());checkFoot(state);const path=`${width}-material-${name}.png`;
        await canvas.screenshot({path:resolve(output,path)});results.materials.push({width,name,configuration,path,state});
      }
      await page.evaluate(()=>{window.habbuxWorldLab.resetMaterials();window.habbuxWorldLab.scenario('elevation');});
      await page.setViewportSize({width:width===390?844:920,height:width===390?390:650});await page.waitForTimeout(150);await ready();
      const state=await page.evaluate(()=>window.habbuxWorldLab.state()),cfg=state.config,bounds=await canvas.boundingBox();
      const x=bounds.x+cfg.origin.x+(9-3)*cfg.tileWidth*cfg.scale/2,y=bounds.y+cfg.origin.y+(9+3)*cfg.tileHeight*cfg.scale/2-3*cfg.elevationHeight*cfg.scale;
      if(width===390)await page.touchscreen.tap(x,y);else await page.mouse.move(x,y);
      assert.deepEqual(await page.evaluate(()=>window.habbuxWorldLab.state().hover),{x:9,y:3,elevation:3,walkable:true});
      await page.evaluate(()=>window.habbuxWorldLab.step(0));await canvas.screenshot({path:resolve(output,`${width}-resize-hover.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await context.close();
  }
  assert.deepEqual(results.errors,[]);assert.equal(results.models.length,models.length*2);
  await writeFile(resolve(output,'visual-v3.json'),JSON.stringify(results,null,2));
  const pngs=(await readdir(output)).filter(f=>f.endsWith('.png'));
  await writeFile(resolve(output,'index.html'),'<!doctype html><meta charset="utf-8"><title>Habbux Integration V3</title><style>body{background:#14212b;color:white;font:16px sans-serif}img{max-width:100%;display:block}figure{margin:16px}</style><h1>Renderer real · integração V3</h1>'+pngs.map(f=>`<figure><figcaption>${f}</figcaption><img loading="lazy" src="${f}"></figure>`).join(''));
  console.log(JSON.stringify({directions:results.directions.length,models:results.models.length,materials:results.materials.length,scenes:results.scenes.length,movement:results.movement.map(({width,jitterMs,gapMs})=>({width,jitterMs,gapMs})),pngs:pngs.length,errors:results.errors}));
}finally{await browser.close();}
