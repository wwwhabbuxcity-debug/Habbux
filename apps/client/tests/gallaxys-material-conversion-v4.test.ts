import test from 'node:test';
import assert from 'node:assert/strict';
import { GALLAXYS_NUMERIC_MATERIAL_PRESETS as presets, configureConvertedMaterials, resolveConvertedMaterialsForModel } from '../src/renderer/gallaxys-material-presets.ts';
import { DEFAULT_ROOM_MATERIALS, validateRoomMaterials } from '../src/renderer/room-materials.ts';
test('converted facts contain 3 floors and 3 walls with distinct new IDs', () => {
  assert.equal(presets.filter(p=>p.surface==='floor').length,3);
  assert.equal(presets.filter(p=>p.surface==='wall').length,3);
  assert.equal(new Set(presets.map(p=>p.id)).size,6);
  assert.equal(presets.find(p=>p.surface==='floor'&&p.sourcePlane==='101')!.color,10053120);
});
test('each converted numeric preset passes renderer validation using only original patterns', () => {
  const firstFloor=presets.find(p=>p.surface==='floor')!;
  const firstWall=presets.find(p=>p.surface==='wall')!;
  for(const p of presets){
    const config=configureConvertedMaterials(p.surface==='floor'?p.id:firstFloor.id,p.surface==='wall'?p.id:firstWall.id);
    validateRoomMaterials(config);
    assert.equal(config[p.surface].mainColor,p.color);
    assert.equal(config[p.surface].texture!.provenance,'Habbux original procedural geometry');
    assert.equal(config[p.surface].texture!.rights,'AUTHORIZED');
  }
});
test('unknown or swapped surface IDs are rejected and defaults stay unchanged',()=>{
  const before=structuredClone(DEFAULT_ROOM_MATERIALS);
  assert.throws(()=>configureConvertedMaterials('unknown','unknown'));
  const floor=presets.find(p=>p.surface==='floor')!,wall=presets.find(p=>p.surface==='wall')!;
  assert.throws(()=>configureConvertedMaterials(wall.id,floor.id));
  configureConvertedMaterials(floor.id,wall.id);
  assert.deepEqual(DEFAULT_ROOM_MATERIALS,before);
});

test('only the three original models select converted material pairs',()=>{
  for (const [modelId, color] of [['hbx_courtyard_v3',10053120],['hbx_terrace_v3',10527664],['hbx_alcove_v3',8561614]] as const) {
    assert.equal(resolveConvertedMaterialsForModel(modelId)!.floor.mainColor,color);
  }
  for (const id of ['model_a','diagnostic-fixture','toString','__proto__']) assert.equal(resolveConvertedMaterialsForModel(id),undefined);
});

test('converted colors preserve caller wall visibility, geometry and original patterns',()=>{
  const base={...DEFAULT_ROOM_MATERIALS,walls:false,wallHeight:3,wallThickness:0.3,floorThickness:1,
    floor:{...DEFAULT_ROOM_MATERIALS.floor,texture:{...DEFAULT_ROOM_MATERIALS.floor.texture!,kind:'slabs' as const}}};
  const before=structuredClone(base),configured=resolveConvertedMaterialsForModel('hbx_terrace_v3',base)!;
  assert.equal(configured.walls,false);assert.equal(configured.wallHeight,3);assert.equal(configured.wallThickness,0.3);assert.equal(configured.floorThickness,1);
  assert.equal(configured.floor.texture!.kind,'slabs');assert.equal(configured.floor.mainColor,10527664);assert.deepEqual(base,before);
});
