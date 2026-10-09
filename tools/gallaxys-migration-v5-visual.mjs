// Bounded captures; every migrated model uses the production room renderer.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/usr/lib/node_modules/playwright');
const base=process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124';
const output=resolve(process.env.HABBUX_VISUAL_OUTPUT);await mkdir(output,{recursive:true});
const mapFixture=m=>({...m,capacity:10,walkability:m.walkability.map(Boolean),spawn:{x:m.spawnX,y:m.spawnY},door:{x:m.doorX,y:m.doorY,direction:m.doorDirection},occupants:[{userId:'1',username:'Fixture',x:m.spawnX,y:m.spawnY,z:m.elevations[m.spawnY*m.width+m.spawnX]}]});
const fixtures=JSON.parse(await readFile('docs/gallaxys-migration-v5/model-fixtures.json','utf8')).map(mapFixture);
const catalog=JSON.parse(await readFile('apps/client/public/assets/materials/v5/classic/catalog.json','utf8'));
const owned=JSON.parse(await readFile('docs/gallaxys-master-integration-v3/models-original-fixtures.json','utf8')).map(mapFixture).find(m=>m.modelId==='hbx_alcove_v3');
const expectedSource='fb10beff5d0b4aef97301bf1dca9ed1c9ddb695ed13cd7ad1873f4caab8c45a4';
const results={matrices:[],models:[],directions:[],textures:[],nativeImages:[],catalogues:[],errors:[],captures:[]};
const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1,hasTouch:width===390});
  const page=await context.newPage(),requests=[];page.on('pageerror',e=>results.errors.push(e.message));page.on('request',r=>{if(r.url().includes('/materials/v5/classic/')&&r.url().endsWith('.png'))requests.push(r.url());});await page.routeWebSocket('**/ws',s=>s.close());
  const canvas=page.locator('.world-lab-viewport canvas');
  async function ready(){await page.waitForFunction(()=>window.habbuxWorldLab.state().avatars.every(a=>a.ready));await page.evaluate(()=>window.habbuxWorldLab.step(0));}
  function foot(s){assert.ok(s.avatars.every(a=>a.ready&&a.foot.errorPhysicalPx<1e-8&&a.animationSource===expectedSource));}
  async function capture(name,locator=canvas){const path=`${width}-${name}.png`;await locator.screenshot({path:resolve(output,path)});results.captures.push(path);return path;}
  for(const gender of ['male','female']){
   await page.goto(base+`/client/?avatar-lab=1&avatar-gender=${gender}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.habbuxWorldLab);await page.evaluate(()=>window.habbuxWorldLab.clock(true));await ready();
   const samples=await page.evaluate(()=>window.habbuxAvatarLab.samples);assert.equal(samples.length,40);assert.ok(samples.every(s=>s.errorPhysicalPx<1e-8));
   results.matrices.push({width,gender,samples:40,path:await capture(`${gender}-matrix`,page.locator('.avatar-lab-canvas'))});
  }
  for(const [index,m] of fixtures.entries()){
   await page.evaluate(m=>window.habbuxWorldLab.fixture(m),m);await ready();await page.waitForFunction(()=>window.habbuxWorldLab.state().nativeTextures.length===2);const state=await page.evaluate(()=>window.habbuxWorldLab.state());foot(state);assert.equal(state.config.elevationHeight,32);
   await canvas.scrollIntoViewIfNeeded();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   // A rear spawn can be covered by a raised foreground floor. Pick the
   // frontmost walkable tile so this checks the visible surface, not hidden ground.
   const visible=m.elevations.map((z,i)=>({x:i%m.width,y:Math.floor(i/m.width),z,walkable:m.walkability[i]})).filter(p=>p.walkable).sort((a,b)=>(b.x+b.y+b.z*.01)-(a.x+a.y+a.z*.01))[0];
   const cfg=state.config,bounds=await canvas.boundingBox(),{x,y,z}=visible;
   const px=bounds.x+cfg.origin.x+(x-y)*cfg.tileWidth*cfg.scale/2,py=bounds.y+cfg.origin.y+(x+y)*cfg.tileHeight*cfg.scale/2-z*cfg.elevationHeight*cfg.scale;
   if(width===390)await page.touchscreen.tap(px,py);else await page.mouse.move(px,py);
   await page.waitForFunction(({x,y,z})=>{const h=window.habbuxWorldLab.state().hover;return h?.x===x&&h?.y===y&&h?.elevation===z&&h?.walkable;},{x,y,z}).catch(async error=>{console.error(JSON.stringify({width,index,modelId:m.modelId,expected:{x,y,z},actual:(await page.evaluate(()=>window.habbuxWorldLab.state())).hover,px,py,element:await page.evaluate(({px,py})=>document.elementFromPoint(px,py)?.tagName,{px,py})}));throw error;});
   assert.deepEqual(await page.evaluate(()=>window.habbuxWorldLab.state().hover),{x,y,elevation:z,walkable:true},`${width}/${m.modelId}: hover`);
   await page.evaluate(()=>window.habbuxWorldLab.step(82));assert.equal((await page.evaluate(()=>window.habbuxWorldLab.state())).surfaceBuilds,state.surfaceBuilds);
   const path=[0,Math.floor(fixtures.length/2),fixtures.length-1].includes(index)?await capture(m.modelId):undefined;
   results.models.push({width,modelId:m.modelId,dimensions:[m.width,m.height],footError:state.avatars[0].foot.errorPhysicalPx,hover:'PASS',staticGeometry:'PASS',path});
  }
  const simple={roomId:'v5-directions',name:'V5',modelId:'fixture',width:12,height:12,capacity:10,spawn:{x:5,y:5},door:{x:0,y:0,direction:2},elevations:Array(144).fill(0),walkability:Array(144).fill(true),occupants:[{userId:'1',username:'Fixture',x:5,y:5,z:0}]};
  for(const [direction,[dx,dy]] of [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]].entries()){
   await page.evaluate(m=>window.habbuxWorldLab.fixture(m),simple);await ready();await page.evaluate(d=>window.habbuxWorldLab.facing(d),direction);foot(await page.evaluate(()=>window.habbuxWorldLab.state()));
   if(width===1280&&[0,2].includes(direction))await capture(`d${direction}-stand`);
   await page.evaluate(({dx,dy})=>{window.habbuxWorldLab.destination(5+dx,5+dy);window.habbuxWorldLab.step(101);},{dx,dy});
   for(let frame=0;frame<4;frame++){
    const state=await page.evaluate(()=>window.habbuxWorldLab.state());foot(state);assert.ok(state.avatars.every(a=>a.action==='wlk'&&a.direction===direction&&a.frame===frame));
    if(width===1280&&[0,2].includes(direction)&&frame===1)await capture(`d${direction}-walk`);await page.evaluate(()=>window.habbuxWorldLab.step(82));
   }
   await page.evaluate(()=>window.habbuxWorldLab.step(1000));assert.equal((await page.evaluate(()=>window.habbuxWorldLab.state())).avatars[0].action,'std');results.directions.push({width,direction,frames:4,footError:0});
  }
  await page.evaluate(m=>window.habbuxWorldLab.fixture(m),owned);await ready();await page.waitForFunction(()=>window.habbuxWorldLab.state().nativeTextures.length===2);await page.evaluate(()=>window.habbuxWorldLab.step(0));
  const before=await page.evaluate(()=>window.habbuxWorldLab.state()),requestCount=requests.length;foot(before);const resources=before.nativeTextures;
  await page.evaluate(async resources=>{await Promise.all([window.habbuxWorldLab.textures(resources),window.habbuxWorldLab.textures(resources)]);for(let i=0;i<20;i++)window.habbuxWorldLab.step(82);},resources);
  let after=await page.evaluate(()=>window.habbuxWorldLab.state());assert.equal(after.surfaceBuilds,before.surfaceBuilds);assert.equal(requests.length,requestCount);foot(after);
  const path=await capture('native-floor-wall');
  const mismatch=await page.evaluate(async resources=>{try{await window.habbuxWorldLab.textures(resources.map(r=>({...r,sha256:'0'.repeat(64)})));return false;}catch{return true;}},resources);
  assert.ok(mismatch);after=await page.evaluate(()=>window.habbuxWorldLab.state());assert.deepEqual(after.nativeTextures,resources);assert.equal(after.surfaceBuilds,before.surfaceBuilds);
  await page.evaluate(()=>window.habbuxWorldLab.textures([]));assert.equal((await page.evaluate(()=>window.habbuxWorldLab.state())).nativeTextures.length,0);
  await page.evaluate(async resources=>{await Promise.all([window.habbuxWorldLab.textures(resources),window.habbuxWorldLab.textures(resources)]);},resources);
  after=await page.evaluate(()=>window.habbuxWorldLab.state());assert.equal(after.nativeTextures.length,2);assert.equal(after.textureSourceCount,before.textureSourceCount);
  results.textures.push({width,id:resources[0].id,path,repeatedLoads:'shared',unchangedPerFrame:true,hashFailurePreservesPrevious:true,clearAndReload:'PASS'});
  const images=width===1280?catalog.textures:catalog.textures.filter(t=>t.surface==='floor').slice(0,1).concat(catalog.textures.filter(t=>t.surface==='wall').sort((a,b)=>b.height-a.height).slice(0,5));
  for(const image of images){
   const pair=resources.map(r=>r.surface===image.surface?{...image,tint:0xffffff}:r);
   await page.evaluate(async pair=>{await window.habbuxWorldLab.textures(pair);window.habbuxWorldLab.step(0);},pair);
   const s=await page.evaluate(()=>window.habbuxWorldLab.state());foot(s);assert.equal(s.nativeTextures.find(t=>t.surface===image.surface).sha256,image.sha256);assert.ok(s.surfaceInstructions.textures>0);
   results.nativeImages.push({width,id:image.id,dimensions:[image.width,image.height],render:'PASS'});
  }
  await page.goto(base+'/game/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.querySelector('#room-explore-select')?.disabled);
  const entries=await page.locator('#room-explore-select option').evaluateAll(options=>options.map(o=>({id:o.value,name:o.textContent})));
  assert.equal(entries.length,62);assert.equal(entries.at(-1).id,'9000000000000000127');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.catalogues.push({width,entries:entries.length,lastId:entries.at(-1).id,status:'PASS'});
  await context.close();
 }
 assert.deepEqual(results.errors,[]);
 let comparison='';const reference=process.env.HABBUX_GALLAXYS_REFERENCE;
 if(reference)for(const d of [0,2])for(const a of ['std','wlk']){
  const from=`gallaxys-${a}-d${d}.png`;await copyFile(resolve(reference,from),resolve(output,from));comparison+=`<article><h2>${a} direção ${d}</h2><p>Imager Gallaxys × Habbux. Figura/paleta e contexto diferentes; sem sessão autenticada Gallaxys.</p><img src="${from}"><img width="430" src="1280-d${d}-${a==='std'?'stand':'walk'}.png"></article>`;
 }
 await writeFile(resolve(output,'visual-v5.json'),JSON.stringify(results,null,2));
 await writeFile(resolve(output,'index.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Migração V5</title><style>body{background:#17232e;color:white;font-family:Arial}article{padding:12px;border-bottom:1px solid #697d90}img{max-width:100%;image-rendering:pixelated;vertical-align:middle}</style><h1>Migração V5</h1><p>61 geometrias convertidas (58 GPL e 3 próprias declaradas) testadas nos dois tamanhos. Capturas de quartos representam o Habbux; não são comparação autenticada de quartos Gallaxys. 6 pisos e 52 paredes clássicos convertidos com pixels preservados; fontes e declaração de propriedade registradas.</p>${comparison}${results.captures.map(i=>`<article>${i}<br><img src="${i}"></article>`).join('')}</html>`);
 console.log(JSON.stringify({models:results.models.length,matrices:results.matrices.length,directions:results.directions.length,textures:results.textures.length,images:results.nativeImages.length,captures:results.captures.length,errors:results.errors}));
}finally{await browser.close();}
