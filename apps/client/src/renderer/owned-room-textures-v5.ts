import type { NativeRoomTextureResource } from './room-texture-resources.ts';
import { GALLAXYS_NATIVE_ROOM_PLANES, GALLAXYS_NATIVE_ROOM_TEXTURES } from './native-room-material-catalog-v5.ts';

/** Native floor and wall images are shared; source plane colors are applied as tints. */
export function nativeTexturesForMaterialPlanes(floorPlaneId: string, wallPlaneId: string): readonly NativeRoomTextureResource[] {
  return (['floor', 'wall'] as const).map(surface => {
    const planeId = surface === 'floor' ? floorPlaneId : wallPlaneId;
    const plane = GALLAXYS_NATIVE_ROOM_PLANES.find(p => p.surface === surface && p.id === planeId);
    if (!plane) throw new Error('Unknown native room material plane');
    const texture = GALLAXYS_NATIVE_ROOM_TEXTURES.find(t => t.surface === surface && t.sourceTextureId === plane.textureId);
    if (!texture) throw new Error('Native room material image missing');
    return { ...texture, tint: plane.color };
  });
}

const classicDefaults = nativeTexturesForMaterialPlanes('default', '218');
const v3Planes: Readonly<Record<string, string>> = Object.freeze({
  hbx_courtyard_v3: '101', hbx_terrace_v3: '102', hbx_alcove_v3: '103',
});
const v3Textures = new Map(Object.entries(v3Planes).map(([modelId, planeId]) =>
  [modelId, nativeTexturesForMaterialPlanes(planeId, planeId)] as const));

export function nativeTexturesForModel(modelId: string | null): readonly NativeRoomTextureResource[] {
  if (modelId === null) return [];
  const configured = v3Textures.get(modelId);
  if (configured) return structuredClone(configured);
  // Existing room IDs are preserved; migrated rooms use the source basic floor/white wall.
  return modelId.startsWith('hbx_gx_') && modelId.endsWith('_v5') ? structuredClone(classicDefaults) : [];
}
