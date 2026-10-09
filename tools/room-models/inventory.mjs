import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeGeometry,convertBatch,toRoomState} from './converter.mjs';

const backup=process.argv[2];
if (!backup?.startsWith('/root/backups/')) throw Error('explicit operational reference backup path required');
const sources=[];
for (const table of ['room_models','room_models_custom']) {
  const sql=`SELECT JSON_OBJECT('id',${table==='room_models'?'name':'id'},'name',name,'door',JSON_OBJECT('x',door_x,'y',door_y,'direction',door_dir),'heightmap',heightmap) FROM gallaxys_polaris.${table} ORDER BY ${table==='room_models'?'name':'id'}`;
  const raw=execFileSync('mariadb',['--batch','--raw','--skip-column-names','-e',sql],{encoding:'utf8',maxBuffer:4*1024*1024}).trim();
  const rows=raw ? raw.split('\n').map(r=>JSON.parse(r)) : [];
  writeFileSync(`${backup}/${table}-reference.json`,JSON.stringify({table,models:rows},null,2)+'\n',{flag:'wx',mode:0o600});
  for (const row of rows) {
    let geometry,validationError;
    try { geometry=normalizeGeometry(row); } catch(error) {validationError=error.message;}
    const normalized=row.heightmap.replace(/\r\n?/gu,'\n').replace(/\n$/u,'');
    const sourceRows=normalized.split('\n');
    const elevations=[...normalized.replace(/\n/gu,'')].filter(c=>c!=='x' && c!=='X').map(c=>parseInt(c,36)).filter(Number.isFinite);
    sources.push({sourceTable:table,sourceId:row.id,name:row.name,status:'UNKNOWN',runtimeImport:'BLOCKED',provenance:`gallaxys_polaris.${table} read-only SELECT`,licenseEvidence:'No model-specific authorization found; code GPL does not establish data rights',heightmapSha256:createHash('sha256').update(normalized).digest('hex'),heightmapReference:`${backup}/${table}-reference.json`,widths:[...new Set(sourceRows.map(r=>r.length))],height:sourceRows.length,validTiles:elevations.length,maxElevation:elevations.length?Math.max(...elevations):null,door:row.door,...(geometry?{width:geometry.width,blockedTiles:geometry.blockedTiles,reachableTiles:geometry.reachableTiles,connected:geometry.connected,spawn:geometry.spawn,geometryValid:true}:{geometryValid:false,validationError})});
  }
}
const legacy=readFileSync('apps/emulator/src/main/resources/room-models-v1/models.tsv','utf8');
const originals=convertBatch(JSON.parse(readFileSync('tools/room-models/originals.json','utf8')).models,new Set(legacy.split('\n').filter(r=>r&&!r.startsWith('#')).map(r=>r.split('\t')[0])));
writeFileSync('docs/gallaxys-master-integration-v3/models-inventory.json',JSON.stringify({schemaVersion:1,source:'Live Gallaxys database, read-only metadata',found:sources.length,authorized:0,externalConverted:0,legacyPreserved:63,legacySha256:createHash('sha256').update(legacy).digest('hex'),originalConverted:originals.length,models:sources,originals},null,2)+'\n',{flag:'wx'});
writeFileSync('docs/gallaxys-master-integration-v3/models-original-fixtures.json',JSON.stringify(originals.map((m,i)=>toRoomState(m,9000000000000000064n+BigInt(i))),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({found:sources.length,authorized:0,externalConverted:0,valid:sources.filter(s=>s.geometryValid).length,invalid:sources.filter(s=>!s.geometryValid).length,connected:sources.filter(s=>s.connected).length,legacyPreserved:63,originalConverted:originals.length}));
