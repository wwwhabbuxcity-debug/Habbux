import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {convertModel,convertBatch,normalizeGeometry,toCompactTsv} from '../../tools/room-models/converter.mjs';
const originals=JSON.parse(readFileSync(new URL('../../tools/room-models/originals.json',import.meta.url))).models;
const fixture=()=>structuredClone(originals[0]);
test('original batch compiles with own IDs and runtime-compatible geometry',()=>{
 const models=convertBatch(originals);assert.equal(models.length,3);
 for(const model of models){assert.equal(model.reachableTiles,model.validTiles);assert.equal(toCompactTsv(model).split('\t').length,7);}
 assert.equal(models[1].maxElevation,1);assert.ok(models[2].blockedTiles>0);
});
test('UNKNOWN and REFERENCE_ONLY blocked, provenance and own ID required',()=>{
 for(const status of ['UNKNOWN','REFERENCE_ONLY','AUTHORIZED']){const input=fixture();input.provenance={status};assert.throws(()=>convertModel(input),/provenance/);}
 const input=fixture();input.id='model_a';assert.throws(()=>convertModel(input),/unique/);
 assert.throws(()=>convertModel(fixture(),new Set([fixture().id])),/unique/);
});
test('documented authorization accepted and duplicate batch blocked',()=>{
 const input=fixture();input.provenance.status='AUTHORIZED';assert.equal(convertModel(input).id,input.id);
 assert.throws(()=>convertBatch([fixture(),fixture()]),/unique/);
});
test('rejects malformed maps, excessive dimensions, unsupported chars and doors',()=>{
 for(const heightmap of [['00','0'],['0?'],['0'.repeat(97)],[''],['０']]){const input=fixture();input.heightmap=heightmap;assert.throws(()=>convertModel(input));}
 for(const door of [{x:-1,y:0,direction:2},{x:99,y:0,direction:2},{x:0,y:0,direction:8}]){const input=fixture();input.door=door;assert.throws(()=>convertModel(input),/door/);}
});
test('blocked cells and uppercase base36 normalize, void door resolves locally',()=>{
 const input=fixture();input.heightmap='XAA\r\nXAA\r\n';input.door={x:0,y:0,direction:2};
 const model=convertModel(input);assert.deepEqual(model.spawn,{x:1,y:0});assert.equal(model.maxElevation,10);assert.equal(model.elevations[0],-1);
});
test('remote-only spawn, disconnected islands and elevation jumps rejected',()=>{
 const input=fixture();input.heightmap=['xxx','xxx','xx0'];input.door={x:0,y:0,direction:2};assert.throws(()=>convertModel(input),/spawn/);
 input.heightmap=['0x0'];assert.throws(()=>convertModel(input),/disconnected/);
 input.heightmap=['02'];assert.throws(()=>convertModel(input),/disconnected/);
 input.heightmap=['01','12'];assert.equal(convertModel(input).connected,true);
});
test('metadata inventory can report disconnected reference without authorizing it',()=>{
 assert.equal(normalizeGeometry({heightmap:['0x0'],door:{x:0,y:0,direction:2}}).connected,false);
});
test('CLI writes new output and refuses overwrite',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hbx-model-'));const target=join(dir,'new.tsv');
 try{const args=['tools/room-models/converter.mjs','tools/room-models/originals.json',target];execFileSync(process.execPath,args,{stdio:'pipe'});assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}));assert.match(readFileSync(target,'utf8'),/hbx_terrace_v3/);}finally{rmSync(dir,{recursive:true});}
});

test('TSV bytes match the actual legacy resource and Java loader contract',()=>{
 const legacy=readFileSync(new URL('../../apps/emulator/src/main/resources/room-models-v1/models.tsv',import.meta.url),'utf8');
 const legacyRow=legacy.split('\n').find(r=>r&&!r.startsWith('#'));
 const generated=toCompactTsv(convertModel(fixture()));
 assert.equal([...Buffer.from(legacyRow)].filter(b=>b===9).length,6);
 assert.equal([...Buffer.from(generated)].filter(b=>b===9).length,6);
 assert.equal(generated.includes(String.fromCharCode(92,116)),false);
 const actualResource=readFileSync(new URL('../../apps/emulator/src/main/resources/room-models-v3/originals.tsv',import.meta.url),'utf8');
 assert.deepEqual(actualResource.split('\n').filter(r=>r&&!r.startsWith('#')),convertBatch(originals).map(toCompactTsv));
 for(const row of actualResource.split('\n').filter(r=>r&&!r.startsWith('#'))) {
   const fields=row.split(String.fromCharCode(9));
   assert.equal(fields.length,7);
   assert.equal(fields[6].split(',').length,Number(fields[2]));
   assert.ok(fields[6].split(',').every(r=>r.length===Number(fields[1])));
 }
});
test('CLI detects IDs in a preexisting file using actual TAB bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hbx-model-id-'));
 try {
   const existing=join(dir,'existing.tsv'),target=join(dir,'new.tsv');
   writeFileSync(existing,'hbx_courtyard_v3'+String.fromCharCode(9)+'5'+String.fromCharCode(9)+'4\n');
   assert.throws(()=>execFileSync(process.execPath,['tools/room-models/converter.mjs','tools/room-models/originals.json',target,existing],{stdio:'pipe'}),error=>error.stderr.toString().includes('own unique hbx_ ID required'));
 } finally {rmSync(dir,{recursive:true});}
});
