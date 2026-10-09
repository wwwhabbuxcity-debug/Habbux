import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertModel,toCompactTsv,PRESERVE_GEOMETRY_V5} from '../../tools/room-models/converter.mjs';
const mapping=JSON.parse(readFileSync('docs/gallaxys-migration-v5/model-mapping.json','utf8'));
const sources=JSON.parse(readFileSync('tools/room-models/gpl-source/cleandb-models.json','utf8')).models;
const owned=JSON.parse(readFileSync('tools/room-models/owned-source/custom-models.json','utf8')).models;
const rows=['gallaxys-gpl.tsv','gallaxys-owned.tsv'].flatMap(f=>readFileSync(`apps/emulator/src/main/resources/room-models-v5/${f}`,'utf8').split('\n').filter(r=>r&&!r.startsWith('#')));
test('64 origin entries exhaustively mapped with no overwrite and invalid exclusions',()=>{
 assert.equal(mapping.found,64);assert.equal(mapping.sourceMatched,61);assert.equal(mapping.converted,61);assert.equal(mapping.gplConverted,58);assert.equal(mapping.ownerDeclared,3);assert.equal(mapping.rejectedInvalid,3);assert.equal(mapping.blocked,0);
 assert.equal(rows.length,61);assert.equal(new Set(rows.map(r=>r.split('\t')[0])).size,61);
 const legacy=new Set(['room-models-v1/models.tsv','room-models-v3/originals.tsv'].flatMap(f=>readFileSync(`apps/emulator/src/main/resources/${f}`,'utf8').split('\n').map(r=>r.split('\t')[0])));
 for(const row of rows)assert.equal(legacy.has(row.split('\t')[0]),false);
});
test('each migrated source preserves heightmap, door, connected spawn and byte TSV',()=>{
 for(const entry of mapping.mapping.filter(m=>m.status==='CONVERTED')) {
  const source=[...sources,...owned].find(m=>m.name===entry.sourceName);assert.ok(source);
  const model=convertModel({...source,id:entry.destinationId,provenance:source.provenance??{status:'AUTHORIZED',author:'Polaris contributors',license:'GPL-3.0',source:'CleanDB.sql',evidence:'Repository GPL database; exact correspondence'}},new Set(),PRESERVE_GEOMETRY_V5);
  assert.equal(createHash('sha256').update(source.heightmap).digest('hex'),entry.sourceSha256);assert.deepEqual(model.door,entry.door);assert.deepEqual(model.spawn,entry.spawn);assert.equal(model.reachableTiles,entry.reachableTiles);assert.ok(rows.includes(toCompactTsv(model)));
 }
});

test('owner-declared custom sources stay separate from GPL and preserve isolated spawn',()=>{
 assert.deepEqual(owned.map(m=>m.name),['custom_9','custom_10','custom_13']);
 for(const source of owned){
  assert.equal(source.provenance.status,'OWNER_DECLARED_OWNED');
  assert.equal(source.provenance.license,'LicenseRef-Habbux-Owner-Declared');
  assert.match(source.provenance.evidence,/ambos sao meu pode fazer total acesso/);
  assert.equal(createHash('sha256').update(source.heightmap).digest('hex'),source.provenance.sourceSha256);
  assert.equal(sources.some(m=>m.name===source.name),false);
  const entry=mapping.mapping.find(m=>m.sourceName===source.name);
  assert.equal(entry.rights,'OWNER_DECLARED_OWNED');assert.equal(entry.license,source.provenance.license);
 }
 const isolated=mapping.mapping.find(m=>m.sourceName==='custom_10');
 assert.equal(isolated.connected,false);assert.equal(isolated.reachableTiles,1);
 const source=owned.find(m=>m.name==='custom_10');
 assert.deepEqual(isolated.spawn,{x:source.door.x,y:source.door.y});
 assert.throws(()=>convertModel({...source,id:isolated.destinationId,provenance:{...source.provenance,evidence:''}},new Set(),PRESERVE_GEOMETRY_V5),/provenance/);
});

test('V5 preservation policy keeps disconnected geometry and pads only absent cells',()=>{
 const provenance={status:'ORIGINAL',author:'Habbux',license:'internal',source:'fixture',evidence:'original test'};
 const input={id:'hbx_policy_test',heightmap:['02','0'],door:{x:0,y:0,direction:2},provenance};
 assert.throws(()=>convertModel(input));
 const model=convertModel(input,new Set(),PRESERVE_GEOMETRY_V5);
 assert.deepEqual(model.elevations,[0,2,0,-1]);assert.equal(model.connected,false);assert.equal(model.reachableTiles,2);
 input.heightmap=['0\u0001'];assert.throws(()=>convertModel(input,new Set(),PRESERVE_GEOMETRY_V5),/symbol/);
});
