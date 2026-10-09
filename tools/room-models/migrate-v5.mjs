import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {convertModel,toCompactTsv,toRoomState,PRESERVE_GEOMETRY_V5} from './converter.mjs';
const sourcePath=process.argv[2] ?? '/var/www/gallaxys.com/Polaris-Emulator-main/Database/Default Database/CleanDB.sql';
const sql=readFileSync(sourcePath,'utf8');
const source={source:'Polaris-Emulator-main/Database/Default Database/CleanDB.sql',license:'GPL-3.0',models:[]};
for(const table of ['room_models','room_models_custom']) {
 const section=sql.split('INSERT INTO `'+table+'`')[1]?.split(';',1)[0];
 if(!section) throw Error('missing source model table');
 for(const line of section.split('\n')) {
  const m=/^\s*\((?:\d+, )?'([^']+)', (\d+), (\d+), (\d+), '([^']*)'/u.exec(line);
  if(m) source.models.push({name:m[1],door:{x:Number(m[2]),y:Number(m[3]),direction:Number(m[4])},heightmap:m[5].replace(/\\r\\n|\\r|\\n/gu,'\n').replace(/\n$/u,''),sourceTable:table});
 }
}
const backup=process.argv[3] ?? '/root/backups/habbux-gallaxys-master-integration-v3-20261009T021559Z/reference';
const outputRoot=process.argv[4] ?? '.';
const writeNew=(path,content)=>{const target=resolve(outputRoot,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content,{flag:'wx'});};
const operational=['room_models','room_models_custom'].flatMap(table=>JSON.parse(readFileSync(`${backup}/${table}-reference.json`,'utf8')).models.map(m=>({...m,sourceTable:table})));
const owned=JSON.parse(readFileSync('tools/room-models/owned-source/custom-models.json','utf8')).models;
const norm=h=>h.replace(/\r\n?/gu,'\n').replace(/\n$/u,'');
const hash=h=>createHash('sha256').update(norm(h)).digest('hex');
const existingIds=new Set(['room-models-v1/models.tsv','room-models-v3/originals.tsv'].flatMap(file=>readFileSync(`apps/emulator/src/main/resources/${file}`,'utf8').split('\n').filter(r=>r&&!r.startsWith('#')).map(r=>r.split('\t')[0])));
const converted=[],gplConverted=[],ownedConverted=[],mapping=[],usedSource=[];
let sourceMatched=0;
for(const original of operational) {
 const matched=source.models.find(m=>hash(m.heightmap)===hash(original.heightmap)&&JSON.stringify(m.door)===JSON.stringify(original.door));
 if(matched)sourceMatched++;
 const base={sourceTable:original.sourceTable,sourceId:original.id,sourceName:original.name,sourceSha256:hash(original.heightmap),door:original.door};
 const ownerSource=owned.find(m=>m.id===original.id&&m.name===original.name&&m.sourceTable===original.sourceTable&&m.provenance?.status==='OWNER_DECLARED_OWNED'&&m.provenance.sourceSha256===hash(original.heightmap)&&hash(m.heightmap)===hash(original.heightmap)&&JSON.stringify(m.door)===JSON.stringify(original.door));
 if(!matched&&!ownerSource){mapping.push({...base,status:'BLOCKED',reason:'No exact licensed source match or specific owner-declared source receipt'});continue;}
 const id=`hbx_gx_${original.name.replace(/[^a-z0-9_]/giu,'_').toLowerCase()}_v5`;
 try {
  const provenance=matched?{status:'AUTHORIZED',author:'Polaris / Arcturus Community contributors; individual model authors not separately specified',license:'GPL-3.0',source:`tools/room-models/gpl-source/cleandb-models.json#${matched.name}`,evidence:'Exact heightmap+door correspondence to database shipped in GPL-3.0 repository; README expressly includes database; COPYING preserved. Scope interpretation documented in V5 models.md.'}:ownerSource.provenance;
  const model=convertModel({...original,id,provenance},existingIds,PRESERVE_GEOMETRY_V5);
  existingIds.add(id);converted.push(model);
  if(matched){gplConverted.push(model);usedSource.push(matched);}else ownedConverted.push(model);
  mapping.push({...base,destinationId:id,status:'CONVERTED',rights:provenance.status,license:provenance.license,width:model.width,height:model.height,validTiles:model.validTiles,reachableTiles:model.reachableTiles,connected:model.connected,policy:"preserveDisconnected+padRightBlocked",spawn:model.spawn});
 }catch(error){mapping.push({...base,status:'REJECTED_INVALID',license:matched?'GPL-3.0':ownerSource.provenance.license,reason:error.message});}
}
writeNew('apps/emulator/src/main/resources/room-models-v5/gallaxys-gpl.tsv','# Gallaxys heightmap conversions; GPL-3.0, see tools/room-models/gpl-source/COPYING\n'+gplConverted.map(toCompactTsv).join('\n')+'\n');
writeNew('apps/emulator/src/main/resources/room-models-v5/gallaxys-owned.tsv','# Owner-declared original Gallaxys custom models; see tools/room-models/owned-source/NOTICE.md\n'+ownedConverted.map(toCompactTsv).join('\n')+'\n');
writeNew('docs/gallaxys-migration-v5/model-mapping.json',JSON.stringify({found:operational.length,sourceMatched,ownerDeclared:ownedConverted.length,converted:converted.length,gplConverted:gplConverted.length,rejectedInvalid:mapping.filter(m=>m.status==='REJECTED_INVALID').length,blocked:mapping.filter(m=>m.status==='BLOCKED').length,mapping},null,2)+'\n');
writeNew('docs/gallaxys-migration-v5/model-fixtures.json',JSON.stringify([...gplConverted,...ownedConverted].map((m,i)=>toRoomState(m,9000000000000000067n+BigInt(i))),null,2)+'\n');
// Distribute only source definitions actually needed by the conversions.
writeNew('tools/room-models/gpl-source/cleandb-models.json',JSON.stringify({...source,models:usedSource},null,2)+'\n');
console.log(JSON.stringify({found:operational.length,gpl:gplConverted.length,owned:ownedConverted.length,converted:converted.length,rejected:mapping.filter(m=>m.status==='REJECTED_INVALID').length,blocked:mapping.filter(m=>m.status==='BLOCKED').length}));
