import { DEFAULT_ROOM_MATERIALS, validateRoomMaterials, type RoomMaterialConfiguration } from './room-materials.ts';

/** Numeric facts only, no pixels or source rendering code. See V4 materials report. */
export const GALLAXYS_ROOM_MATERIAL_SOURCE_SHA256 = 'b029cafab61309969075d75f53cd6582d23f90c823878ee5100cd6f953f2180b';
export interface ConvertedMaterialPreset {
  readonly id: string;
  readonly surface: 'floor' | 'wall';
  readonly sourcePlane: string;
  readonly sourceMaterial: string;
  readonly color: number;
}
const floorFacts: readonly (readonly [string, string, number])[] = [["101","floor_64_1",10053120],["102","floor_64_1",10527664],["103","floor_64_1",8561614]];
const wallFacts: readonly (readonly [string, string, number])[] = [["101","wall_64_1",16763904],["102","wall_64_1",13412864],["103","wall_64_1",16514816]];

export const GALLAXYS_NUMERIC_MATERIAL_PRESETS: readonly ConvertedMaterialPreset[] = Object.freeze(
  ([['floor', floorFacts], ['wall', wallFacts]] as const).flatMap(([surface, facts]) => facts.map(([sourcePlane, sourceMaterial, color]) => Object.freeze({
    id: `habbux-gx-numeric-v4-${surface}-${sourcePlane}`, surface, sourcePlane, sourceMaterial, color,
  }))),
);
/** Applies converted numeric color to an existing original Habbux pattern. */
export function configureConvertedMaterials(floorId: string, wallId: string, base: RoomMaterialConfiguration = DEFAULT_ROOM_MATERIALS): RoomMaterialConfiguration {
  const floor = GALLAXYS_NUMERIC_MATERIAL_PRESETS.find(p => p.surface === 'floor' && p.id === floorId);
  const wall = GALLAXYS_NUMERIC_MATERIAL_PRESETS.find(p => p.surface === 'wall' && p.id === wallId);
  if (!floor || !wall) throw new Error('Unknown converted material preset');
  const secondary = (color: number): number => {
    const c = (shift: number): number => Math.round(((color >> shift) & 255) * 0.6);
    return (c(16) << 16) | (c(8) << 8) | c(0);
  };
  return validateRoomMaterials({ ...base,
    floor: { ...base.floor, id: floor.id, mainColor: floor.color, secondaryColor: secondary(floor.color) },
    wall: { ...base.wall, id: wall.id, mainColor: wall.color, secondaryColor: secondary(wall.color) },
  });
}

export const CONVERTED_MATERIAL_MODEL_PAIRS = Object.freeze({
  hbx_courtyard_v3: ['habbux-gx-numeric-v4-floor-101', 'habbux-gx-numeric-v4-wall-101'],
  hbx_terrace_v3: ['habbux-gx-numeric-v4-floor-102', 'habbux-gx-numeric-v4-wall-102'],
  hbx_alcove_v3: ['habbux-gx-numeric-v4-floor-103', 'habbux-gx-numeric-v4-wall-103'],
} as const);
export function resolveConvertedMaterialsForModel(modelId: string | null, base: RoomMaterialConfiguration = DEFAULT_ROOM_MATERIALS): RoomMaterialConfiguration | undefined {
  const pair = modelId !== null && Object.hasOwn(CONVERTED_MATERIAL_MODEL_PAIRS, modelId)
    ? CONVERTED_MATERIAL_MODEL_PAIRS[modelId as keyof typeof CONVERTED_MATERIAL_MODEL_PAIRS] : undefined;
  return pair ? configureConvertedMaterials(pair[0], pair[1], base) : undefined;
}
