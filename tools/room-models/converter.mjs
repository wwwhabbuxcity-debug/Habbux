import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

// Offline boundary: authorization is explicit evidence, never inferred from a source license.
export function normalizeGeometry(input) {
  const rows = Array.isArray(input.heightmap) ? input.heightmap : input.heightmap.replace(/\r\n?/gu, '\n').replace(/\n$/u, '').split('\n');
  const height = rows.length, width = rows[0]?.length;
  if (!Number.isInteger(width) || width < 1 || width > 96 || height < 1 || height > 96 || rows.some(r => typeof r !== 'string' || r.length !== width)) throw Error('heightmap must be rectangular, bounded 1..96');
  if (rows.some(r => !/^[0-9a-wyzx]+$/iu.test(r))) throw Error('unsupported elevation symbol');
  const elevations = rows.join('').toLowerCase().split('').map(c => c === 'x' ? -1 : parseInt(c,36));
  const {x,y,direction} = input.door ?? {};
  if (![x,y,direction].every(Number.isInteger) || x<0 || x>=width || y<0 || y>=height || direction<0 || direction>7) throw Error('door is outside grid or direction invalid');
  const walkable = (a,b) => a>=0 && b>=0 && a<width && b<height && elevations[b*width+a]>=0;
  const directions = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  const nearby = [[x,y], [x+directions[direction][0],y+directions[direction][1]], ...[directions[0],directions[2],directions[4],directions[6],directions[1],directions[3],directions[5],directions[7]].map(([dx,dy])=>[x+dx,y+dy])];
  const spawn = nearby.find(([a,b])=>walkable(a,b));
  if (!spawn) throw Error('door has no adjacent walkable spawn');
  const seen = new Set([spawn[1]*width+spawn[0]]), queue = [...seen];
  for (let i=0;i<queue.length;i++) {
    const index=queue[i], a=index%width,b=Math.floor(index/width);
    for (const [dx,dy] of [directions[0],directions[2],directions[4],directions[6]]) {
      const next=(b+dy)*width+a+dx;
      if (walkable(a+dx,b+dy) && Math.abs(elevations[next]-elevations[index])<=1 && !seen.has(next)) {seen.add(next);queue.push(next);}
    }
  }
  const validTiles=elevations.filter(z=>z>=0).length;
  return {width,height,rows:rows.map(r=>r.toLowerCase()),elevations,door:{x,y,direction},spawn:{x:spawn[0],y:spawn[1]},validTiles,blockedTiles:width*height-validTiles,reachableTiles:seen.size,connected:seen.size===validTiles,maxElevation:Math.max(...elevations),minElevation:Math.min(...elevations.filter(z=>z>=0))};
}

export function convertModel(input, existingIds = new Set()) {
  const p=input.provenance;
  if (!p || !['ORIGINAL','AUTHORIZED'].includes(p.status) || !['author','license','source','evidence'].every(k=>typeof p[k]==='string' && p[k].trim().length>0)) throw Error('authorization/provenance evidence required');
  if (!/^hbx_[a-z0-9_]{1,55}$/u.test(input.id) || existingIds.has(input.id)) throw Error('own unique hbx_ ID required');
  const geometry=normalizeGeometry(input);
  if (!geometry.connected) throw Error('walkable tiles disconnected under step-height limit 1');
  return {id:input.id,...geometry,provenance:{...p},heightmapSha256:createHash('sha256').update(geometry.rows.join('\n')).digest('hex')};
}
export function toCompactTsv(model) {
  return [model.id,model.width,model.height,model.door.x,model.door.y,model.door.direction,model.rows.join(',')].join('\t');
}
export function convertBatch(inputs,existingIds=new Set()) {
  const ids=new Set(existingIds);
  return inputs.map(input=>{const model=convertModel(input,ids);ids.add(model.id);return model;});
}
export function toRoomState(model,roomId) {
  return {roomId:String(roomId),name:`Habbux · ${model.id}`,modelId:model.id,width:model.width,height:model.height,walkability:model.elevations.map(z=>z>=0?1:0),elevations:model.elevations,spawnX:model.spawn.x,spawnY:model.spawn.y,doorX:model.door.x,doorY:model.door.y,doorDirection:model.door.direction,users:[]};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [source,target,existing]=process.argv.slice(2);
  if (!source || !target) throw Error('usage: converter.mjs INPUT.json NEW_OUTPUT.tsv [EXISTING.tsv]');
  const ids=new Set(existing ? readFileSync(existing,'utf8').split('\n').filter(r=>r && !r.startsWith('#')).map(r=>r.split('\t')[0]) : []);
  const models=convertBatch(JSON.parse(readFileSync(source,'utf8')).models,ids);
  writeFileSync(target,'# Original Habbux models V3; provenance in originals.json\n'+models.map(toCompactTsv).join('\n')+'\n',{flag:'wx'});
  console.log(JSON.stringify({converted:models.length,ids:models.map(m=>m.id)}));
}
