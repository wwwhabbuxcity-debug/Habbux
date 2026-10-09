// Paired fixtures: original compiled Gallaxys renderer, no hotel session or service changes.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)('/usr/lib/node_modules/playwright');
const base=process.env.HABBUX_VISUAL_BASE_URL??'http://127.0.0.1:3124',output=resolve(process.env.HABBUX_VISUAL_OUTPUT);await mkdir(output,{recursive:true});
const fixtures=JSON.parse(await readFile('docs/gallaxys-migration-v5/model-fixtures.json','utf8'));
const catalog=JSON.parse(await readFile('apps/client/public/assets/materials/v5/classic/catalog.json','utf8'));
function resources(floor,wall){return ['floor','wall'].map(surface=>{const p=catalog.planes.find(p=>p.surface===surface&&p.id===(surface==='floor'?floor:wall));assert.ok(p);const t=catalog.textures.find(t=>t.surface===surface&&t.sourceTextureId===p.textureId);assert.ok(t);return {...t,tint:p.color};});}
const patterned=catalog.planes.find(p=>p.surface==='floor'&&p.textureId==='floor_64_4');
const wallpaper=catalog.planes.find(p=>p.surface==='wall'&&catalog.textures.some(t=>t.sourceTextureId===p.textureId&&t.surface==='wall'&&t.height>=100));
const scenes=[{model:fixtures.find(m=>m.modelId.includes('model_a_')),floor:'101',wall:'101'},
 {model:fixtures[0],floor:'default',wall:'218'},
 {model:fixtures.find(m=>m.modelId.includes('custom_9_')),floor:patterned.id,wall:wallpaper.id}];
assert.ok(scenes.every(s=>s.model));
const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--renderer-process-limit=1']});
const result={scenes:[],errors:[],referenceBundleSha256:createHash('sha256').update(await readFile('/var/www/gallaxys.com/Octane-Renderer/dist/nitro-renderer.js')).digest('hex'),context:'offline original RoomPlaneParser/RoomPlane versus Habbux, identical heightmap and material plane IDs; not authenticated gameplay'};
try{
 const reference=await browser.newPage({viewport:{width:904,height:560}}),candidate=await browser.newPage({viewport:{width:1280,height:900}});
 for(const page of [reference,candidate])page.on('pageerror',e=>result.errors.push(e.message));
 await candidate.routeWebSocket('**/ws',s=>s.close());
 await reference.goto(base+'/reference.html');await reference.waitForFunction(()=>window.referenceReady);
 await candidate.goto(base+'/client/?avatar-lab=1',{waitUntil:'networkidle'});await candidate.waitForFunction(()=>window.habbuxWorldLab);await candidate.evaluate(()=>window.habbuxWorldLab.clock(true));
 for(const {model:m,floor,wall} of scenes){
  const source=await reference.evaluate(({m,floor,wall})=>window.referenceRoom(m,{floor,wall}),{m,floor,wall});
  const room={...m,capacity:10,walkability:m.walkability.map(Boolean),spawn:{x:m.spawnX,y:m.spawnY},door:{x:m.doorX,y:m.doorY,direction:m.doorDirection},occupants:[]};
  await candidate.evaluate(m=>window.habbuxWorldLab.fixture(m),room);await candidate.waitForFunction(()=>window.habbuxWorldLab.state().nativeTextures.length===2);
  await candidate.evaluate(async resources=>{await window.habbuxWorldLab.textures(resources);window.habbuxWorldLab.step(0);},resources(floor,wall));
  const state=await candidate.evaluate(()=>window.habbuxWorldLab.state());assert.equal(state.config.elevationHeight,source.elevationPixels);
  const original=m.modelId+'-gallaxys.png',converted=m.modelId+'-habbux.png';
  await reference.locator('canvas').screenshot({path:resolve(output,original)});await candidate.locator('.world-lab-viewport canvas').screenshot({path:resolve(output,converted)});
  result.scenes.push({modelId:m.modelId,dimensions:[m.width,m.height],floor,wall,source,candidate:{config:state.config,surfaces:state.surfaces,nativeTextures:state.nativeTextures},original,converted});
 }
 assert.deepEqual(result.errors,[]);
 await writeFile(resolve(output,'comparison-v5.json'),JSON.stringify(result,null,2));
 const gallery=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Gallaxys × Habbux V5</title><style>body{background:#14212b;color:#eee;font-family:Arial}article{margin:20px 0}.pair{display:flex;gap:8px}.pair figure{margin:0;max-width:49%}img{width:100%;image-rendering:pixelated}</style><h1>Gallaxys × Habbux V5</h1><p>Mesmo heightmap e mesmos IDs de materiais. Renderer Gallaxys compilado existente, executado em fixture local; sem sessão autenticada. Pisos e papéis são imagens reais convertidas. Paredes internas, máscaras e bordas ainda diferem.</p>${result.scenes.map(s=>`<article><h2>${s.modelId}, ${s.dimensions.join('×')}, piso ${s.floor}/parede ${s.wall}</h2><div class="pair"><figure><figcaption>Gallaxys</figcaption><img src="${s.original}"></figure><figure><figcaption>Habbux</figcaption><img src="${s.converted}"></figure></div></article>`).join('')}</html>`;
 await writeFile(resolve(output,'index.html'),gallery);
 await reference.setViewportSize({width:1280,height:900});
 await reference.route('https://v5-comparison.invalid/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);assert.match(name,/^[a-z0-9_-]+\.png$/);await route.fulfill({contentType:'image/png',body:await readFile(resolve(output,name))});});
 await reference.setContent(gallery.replaceAll('src="','src="https://v5-comparison.invalid/'));
 await reference.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 await reference.screenshot({path:resolve(output,'comparison-side-by-side.png'),fullPage:true});
 console.log(JSON.stringify({scenes:result.scenes.length,errors:result.errors}));
}finally{await browser.close();}
