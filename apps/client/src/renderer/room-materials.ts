/** Original procedural material definitions. External resources require proven rights. */
export type MaterialRights = 'AUTHORIZED' | 'UNKNOWN' | 'REFERENCE_ONLY' | 'BLOCKED';
export interface RoomMaterial {
  readonly id: string;
  readonly mainColor: number;
  readonly secondaryColor: number;
  readonly opacity: number;
  readonly repeatScale: number; // world/grid units, independent of viewport
  readonly lighting: { readonly x: number; readonly y: number; readonly cap: number; readonly edge: number };
  readonly texture?: { readonly kind: 'boards' | 'slabs' | 'grain' | 'panels'; readonly rights: MaterialRights; readonly provenance: string };
  readonly finish: 'plain' | 'trimmed';
}
export interface RoomMaterialConfiguration {
  readonly floor: RoomMaterial;
  readonly wall: RoomMaterial;
  readonly floorThickness: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly walls: boolean;
}
const lighting = Object.freeze({ x: 0.8, y: 1, cap: 1.12, edge: 0.66 });
export const DEFAULT_ROOM_MATERIALS: RoomMaterialConfiguration = Object.freeze({
  floor: Object.freeze({ id: 'habbux-original-wood-v4', mainColor: 0xb6a080, secondaryColor: 0x6d604d, opacity: 1, repeatScale: 1, lighting: Object.freeze({ x: 0.62, y: 0.76, cap: 1, edge: 0.66 }), texture: Object.freeze({ kind: 'boards' as const, rights: 'AUTHORIZED' as const, provenance: 'Habbux original procedural geometry' }), finish: 'trimmed' as const }),
  wall: Object.freeze({ id: 'habbux-original-plaster-v4', mainColor: 0x9ab5bd, secondaryColor: 0x667b84, opacity: 1, repeatScale: 1, lighting, texture: Object.freeze({ kind: 'grain' as const, rights: 'AUTHORIZED' as const, provenance: 'Habbux original procedural geometry' }), finish: 'trimmed' as const }),
  floorThickness: 0.5, wallHeight: 8, wallThickness: 0.16, walls: true,
});
export function validateRoomMaterials(configuration: RoomMaterialConfiguration): RoomMaterialConfiguration {
  for (const material of [configuration.floor, configuration.wall]) {
    if (!material.id || material.id.length > 128) throw new Error('Invalid material id');
    for (const color of [material.mainColor, material.secondaryColor]) if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw new Error('Invalid material color');
    if (!Number.isFinite(material.opacity) || material.opacity < 0 || material.opacity > 1) throw new Error('Invalid material opacity');
    if (!Number.isFinite(material.repeatScale) || material.repeatScale < 0.25 || material.repeatScale > 16) throw new Error('Invalid material repeat scale');
    for (const factor of [material.lighting.x, material.lighting.y, material.lighting.cap, material.lighting.edge]) if (!Number.isFinite(factor) || factor < 0 || factor > 2) throw new Error('Invalid material lighting');
    if (!['plain', 'trimmed'].includes(material.finish)) throw new Error('Invalid material finish');
    if (material.texture && !['boards', 'slabs', 'grain', 'panels'].includes(material.texture.kind)) throw new Error('Invalid material texture');
    if (material.texture && (material.texture.rights !== 'AUTHORIZED' || !material.texture.provenance.trim())) throw new Error('Material texture rights are not authorized');
  }
  for (const [value, max] of [[configuration.floorThickness, 8], [configuration.wallHeight, 32], [configuration.wallThickness, 1]]) if (!Number.isFinite(value) || value! < 0 || value! > max!) throw new Error('Invalid material geometry');
  if (configuration.floor.texture && !['boards', 'slabs'].includes(configuration.floor.texture.kind)) throw new Error('Invalid floor texture kind');
  if (configuration.wall.texture && !['grain', 'panels'].includes(configuration.wall.texture.kind)) throw new Error('Invalid wall texture kind');
  // Clone to prevent diagnostic callers mutating the renderer without invalidation.
  return structuredClone(configuration);
}
