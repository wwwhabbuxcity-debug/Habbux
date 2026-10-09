// SPDX-License-Identifier: GPL-3.0
// Reproduce the migrated resource using the distributed source subset only.
import {readFileSync,writeFileSync} from 'node:fs';
import {convertModel,toCompactTsv,PRESERVE_GEOMETRY_V5} from './converter.mjs';
const [sourceFile,targetFile]=process.argv.slice(2);
if(!sourceFile||!targetFile)throw Error('usage: reproduce-v5.mjs SOURCE_SUBSET.json NEW_OUTPUT.tsv');
const source=JSON.parse(readFileSync(sourceFile,'utf8'));
if(source.license!=='GPL-3.0'||!Array.isArray(source.models)||source.models.length>64)throw Error('Invalid source subset');
const ids=new Set();
const converted=source.models.map(input=>{
 const id=`hbx_gx_${input.name.replace(/[^a-z0-9_]/giu,'_').toLowerCase()}_v5`;
 const model=convertModel({...input,id,provenance:{status:'AUTHORIZED',author:'Polaris / Arcturus Community contributors',license:'GPL-3.0',source:source.source,evidence:'Distributed licensed source subset; see COPYING and NOTICE'}},ids,PRESERVE_GEOMETRY_V5);
 ids.add(id);return model;
});
writeFileSync(targetFile,'# Gallaxys heightmap conversions; GPL-3.0, see tools/room-models/gpl-source/COPYING\n'+converted.map(toCompactTsv).join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({converted:converted.length}));
