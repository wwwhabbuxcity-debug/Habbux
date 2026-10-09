// SPDX-License-Identifier: GPL-3.0
// Original Habbux conversion tool; corresponding-source component for the GPL animation subset.
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function convertAvatarAnimationSource(text,provenance) {
  if(provenance?.status!=='AUTHORIZED'||provenance.license!=='GPL-3.0'||!provenance.source||provenance.sha256!==createHash('sha256').update(text).digest('hex')) throw Error('Avatar source provenance gate rejected');
  const tree=ts.createSourceFile('source.ts',text,ts.ScriptTarget.Latest,true);
  const declaration=tree.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations).find(d=>d.name.getText(tree)==='HabboAvatarAnimations');
  const property=(object,key)=>object.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree).replace(/['"]/gu,'')===key)?.initializer;
  const literal=node=>{if(!node||(!ts.isStringLiteral(node)&&!ts.isNumericLiteral(node))) throw Error('Expected factual literal');return ts.isNumericLiteral(node)?Number(node.text):node.text;};
  if(!declaration||!ts.isObjectLiteralExpression(declaration.initializer))throw Error('Missing animation object');
  const animations=property(declaration.initializer,'animations');if(!animations||!ts.isArrayLiteralExpression(animations))throw Error('Missing animations');
  const used=new Set(['bd','hd','hrb','hr','lg','sh','ch','ls','rs','fc','ey','lh','rh']);
  const result={version:1,provenance,actions:{}};
  for(const [sourceId,nativeId] of [['Default','std'],['Move','wlk']]) {
    const animation=animations.elements.find(a=>ts.isObjectLiteralExpression(a)&&literal(property(a,'id'))===sourceId);
    if(!animation)throw Error(`Missing ${sourceId}`);
    const parts=property(animation,'parts');if(!parts||!ts.isArrayLiteralExpression(parts))throw Error('Missing parts');
    const selected={};
    for(const part of parts.elements) {
      if(!ts.isObjectLiteralExpression(part))continue;
      const id=literal(property(part,'setType'));if(!used.has(id))continue;
      const frames=property(part,'frames');if(!frames||!ts.isArrayLiteralExpression(frames))throw Error('Missing frames');
      selected[id]=frames.elements.map(frame=>({number:literal(property(frame,'number')),assetAction:literal(property(frame,'assetPartDefinition'))}));
      if(nativeId==='std')selected[id]=selected[id].slice(0,1); // only standing frame currently rendered
      if(selected[id].some(f=>!Number.isInteger(f.number)||f.number<0||f.assetAction!==nativeId))throw Error(`Unexpected used sequence ${id}`);
    }
    result.actions[nativeId]={sourceId,parts:selected};
  }
  const walk=result.actions.wlk.parts;
  for(const id of ['bd','lg','sh','ls','rs','lh','rh'])if(JSON.stringify(walk[id]?.map(f=>f.number))!=='[0,1,2,3]')throw Error(`Unsupported WALK ${id}`);
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const source=process.argv[2]??'/var/www/gallaxys.com/Octane-Renderer/packages/avatar/src/data/HabboAvatarAnimations.ts';
  const text=readFileSync(source,'utf8');
  const provenance={status:'AUTHORIZED',license:'GPL-3.0',source:'Octane-Renderer/packages/avatar/src/data/HabboAvatarAnimations.ts',sha256:'fb10beff5d0b4aef97301bf1dca9ed1c9ddb695ed13cd7ad1873f4caab8c45a4',licenseUrl:'/client/assets/avatar/v5/gpl-source/COPYING',correspondingSourceUrl:'/client/assets/avatar/v5/gpl-source/HabboAvatarAnimations.ts.txt',licenseFile:'tools/avatar-v5/gpl-source/COPYING',authorization:'Owner authorization V5; source repository GPL-3.0; no graphic asset grant inferred'};
  const output=convertAvatarAnimationSource(text,provenance);
  // Corresponding source is retained verbatim; converter never executes it.
  writeFileSync('tools/avatar-v5/gpl-source/HabboAvatarAnimations.ts',text);
  writeFileSync('apps/client/public/assets/avatar/v5/animation-profile.json',JSON.stringify(output)+'\n');
  const publicSource='apps/client/public/assets/avatar/v5/gpl-source/';
  writeFileSync(publicSource+'HabboAvatarAnimations.ts.txt',text);
  writeFileSync(publicSource+'COPYING',readFileSync('tools/avatar-v5/gpl-source/COPYING'));
  writeFileSync(publicSource+'NOTICE.md',readFileSync('tools/avatar-v5/gpl-source/NOTICE.md'));
  writeFileSync(publicSource+'convert.mjs.txt',readFileSync(new URL('./convert.mjs',import.meta.url)));
  console.log(JSON.stringify({actions:Object.keys(output.actions),standParts:Object.keys(output.actions.std.parts).length,walkParts:Object.keys(output.actions.wlk.parts).length,sha256:provenance.sha256}));
}
