import { DEFAULT_ROOM_MATERIALS, validateRoomMaterials, type RoomMaterialConfiguration } from './room-materials.ts';
import type { RoomState } from '../room/room-state.ts';
import { DEFAULT_ISO_CONFIG, floorSidePolygon, isoDepth, roomToScreen, tilePolygon, type IsoConfig, type IsoPoint } from './isometric.ts';

export interface RoomSurfaceStyle {
  readonly elevationHeight?: number; // pixels per logical level; shared by floor/avatar/picking
  readonly wallBoundary?: 'all' | 'exterior';
  readonly materials?: RoomMaterialConfiguration;
  readonly floorColor: number;
  readonly floorMaterial: 'wood' | 'stone';
  readonly floorThickness: number; // elevation units
  readonly wallColor: number;
  readonly wallMaterial: 'plaster' | 'panel';
  readonly wallHeight: number; // elevation units, same Z as floor/avatar
  readonly wallThickness: number; // grid units, outside the walkable floor
  readonly walls: boolean;
  readonly cacheBackground?: boolean;
}
export const DEFAULT_ROOM_STYLE: RoomSurfaceStyle = Object.freeze({
  floorColor: 0xb6a080, floorMaterial: 'wood', floorThickness: 0.5,
  wallColor: 0x9ab5bd, wallMaterial: 'plaster', wallHeight: 8, wallThickness: 0.16, walls: true, cacheBackground: false,
});
/** Gallaxys room coordinates keep logical levels; only their pixel projection differs. */
export function styleForMigratedRoom(modelId: string | null, style: RoomSurfaceStyle): RoomSurfaceStyle {
  if (!modelId?.startsWith('hbx_gx_') || !modelId.endsWith('_v5')) return style;
  const geometry = { floorThickness: 0.25, wallHeight: 3.6, wallThickness: 0.25 };
  const materials=materialsForStyle(style);
  return { ...style, ...geometry, elevationHeight: 32, wallBoundary: 'exterior',
    materials: { ...materials, ...geometry,
      floor: { ...materials.floor, finish: 'plain', lighting: { x: 187/255, y: 221/255, cap: 1, edge: 187/255 } },
      wall: { ...materials.wall, finish: 'plain', lighting: { x: 204/255, y: 1, cap: 153/255, edge: 153/255 } },
    } };
}
export function resolveRoomSurfaceStyle(style: RoomSurfaceStyle): RoomSurfaceStyle {
  if (!style.materials) return style;
  const materials = validateRoomMaterials(style.materials);
  return { ...style, materials, floorColor: materials.floor.mainColor, wallColor: materials.wall.mainColor,
    floorMaterial: materials.floor.texture?.kind === 'slabs' ? 'stone' : 'wood',
    wallMaterial: materials.wall.texture?.kind === 'panels' ? 'panel' : 'plaster',
    floorThickness: materials.floorThickness, wallThickness: materials.wallThickness, wallHeight: materials.wallHeight, walls: materials.walls };
}
export function materialsForStyle(style: RoomSurfaceStyle): RoomMaterialConfiguration {
  return style.materials ?? { ...DEFAULT_ROOM_MATERIALS,
    floor: { ...DEFAULT_ROOM_MATERIALS.floor, mainColor: style.floorColor, texture: { ...DEFAULT_ROOM_MATERIALS.floor.texture!, kind: style.floorMaterial === 'wood' ? 'boards' : 'slabs' } },
    wall: { ...DEFAULT_ROOM_MATERIALS.wall, mainColor: style.wallColor, texture: { ...DEFAULT_ROOM_MATERIALS.wall.texture!, kind: style.wallMaterial === 'plaster' ? 'grain' : 'panels' } },
    floorThickness: style.floorThickness, wallHeight: style.wallHeight, wallThickness: style.wallThickness, walls: style.walls };
}
export interface SurfaceFace {
  readonly polygon: readonly IsoPoint[];
  readonly color: number;
}
export interface FloorSurface {
  readonly x: number; readonly y: number; readonly elevation: number;
  readonly top: SurfaceFace; readonly sides: readonly SurfaceFace[];
  readonly depth: number;
}
export interface WallSurface {
  readonly x: number; readonly y: number; readonly side: 'x' | 'y';
  readonly front: SurfaceFace; readonly cap: SurfaceFace; readonly end: SurfaceFace | null; readonly startEnd: SurfaceFace | null;
  readonly base: readonly IsoPoint[];
  readonly depth: number;
}
export interface RoomSurfaces { readonly floors: readonly FloorSurface[]; readonly walls: readonly WallSurface[] }

export function shadeColor(color: number, factor: number): number {
  const channel = (shift: number): number => Math.min(255, Math.round(((color >> shift) & 255) * factor));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function elevationAt(room: RoomState, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) return null;
  const z = room.elevations[y * room.width + x] ?? 0;
  return z < 0 ? null : z;
}

/** Static exterior flood fill keeps holes in migrated floors free of invented tall walls. */
function exteriorVoid(room: RoomState): Uint8Array {
  const outside=new Uint8Array(room.width*room.height),queue=new Uint32Array(outside.length);
  let head=0,tail=0;
  const visit=(x:number,y:number):void=>{
    if(x<0||y<0||x>=room.width||y>=room.height)return;
    const i=y*room.width+x;
    if(outside[i] || ((room.elevations[i]??0)>=0 && (x!==room.door.x||y!==room.door.y)))return;
    outside[i]=1;queue[tail++]=i;
  };
  for(let x=0;x<room.width;x++){visit(x,0);visit(x,room.height-1);}
  for(let y=0;y<room.height;y++){visit(0,y);visit(room.width-1,y);}
  while(head<tail){const i=queue[head++]!,x=i%room.width,y=Math.floor(i/room.width);visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);}
  return outside;
}

/** All room faces share tile vertices, camera scale and elevation projection. */
export function buildRoomSurfaces(room: RoomState, config: IsoConfig, style: RoomSurfaceStyle = DEFAULT_ROOM_STYLE): RoomSurfaces {
  style = resolveRoomSurfaceStyle(style);
  const material = materialsForStyle(style);
  const floors: FloorSurface[] = [];
  const walls: WallSurface[] = [];
  const exterior=style.wallBoundary==='exterior'?exteriorVoid(room):null;
  const wallAllowed=(x:number,y:number,side:'x'|'y'):boolean=>{
    if(exterior && x===room.door.x && y===room.door.y)return false;
    const nx=x-(side==='x'?1:0),ny=y-(side==='y'?1:0);
    const entrance=exterior && nx===room.door.x && ny===room.door.y;
    if(!entrance && elevationAt(room,nx,ny)!==null)return false;
    return !exterior || nx<0 || ny<0 || exterior[ny*room.width+nx]===1;
  };
  // One ceiling and one outer vertex per junction. Front panels keep their own
  // depth for occlusion, while their caps meet at convex AND recessed corners.
  const ceiling = Math.max(0, ...room.elevations) + style.wallHeight;
  const junctions = new Map<string, { x: boolean; y: boolean; edges: number }>();
  const key = (x: number, y: number): string => `${x},${y}`;
  if (style.walls) for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) {
    if (elevationAt(room, x, y) === null) continue;
    for (const side of ['x', 'y'] as const) {
      if (!wallAllowed(x,y,side)) continue;
      for (const p of [{ x: x - 0.5, y: y - 0.5 }, { x: x + (side === 'y' ? 0.5 : -0.5), y: y + (side === 'x' ? 0.5 : -0.5) }]) {
        const id = key(p.x, p.y), joint = junctions.get(id) ?? { x: false, y: false, edges: 0 };
        joint[side] = true; joint.edges++; junctions.set(id, joint);
      }
    }
  }
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const z = elevationAt(room, x, y);
      if (z === null) continue;
      const top = tilePolygon(roomToScreen(x, y, z, config), config);
      const sides: SurfaceFace[] = [];
      for (const side of ['x', 'y'] as const) {
        const neighbor = elevationAt(room, x + (side === 'x' ? 1 : 0), y + (side === 'y' ? 1 : 0));
        if (neighbor !== null && neighbor >= z) continue;
        // Exterior slabs also reach below lower terraces: no floating platforms.
        const bottom = neighbor ?? -style.floorThickness;
        const depth = (z - bottom) * config.elevationHeight * config.scale;
        sides.push({ polygon: floorSidePolygon(top, side, depth), color: shadeColor(style.floorColor, material.floor.lighting[side]) });
      }
      // Material boards span several grid cells. Grid boundaries are interaction
      // geometry, not a checkerboard texture.
      const repeat = material.floor.repeatScale;
      const row = Math.floor(y / repeat);
      const variation = material.floor.texture?.kind === 'boards' ? ((Math.floor((x + (row % 2) * 2 * repeat) / (4 * repeat)) + row) % 3) * 0.008 : 0;
      floors.push({ x, y, elevation: z, top: { polygon: top, color: shadeColor(style.floorColor, material.floor.lighting.cap * (1 - variation)) }, sides, depth: isoDepth(x, y) - 0.25 });
      if (!style.walls) continue;
      for (const side of ['x', 'y'] as const) {
        if (!wallAllowed(x,y,side)) continue;
        // Back-facing boundary of the actual occupied footprint, including recesses.
        const a = { x: x - 0.5, y: y - 0.5 };
        const b = { x: x + (side === 'y' ? 0.5 : -0.5), y: y + (side === 'x' ? 0.5 : -0.5) };
        const p0 = roomToScreen(a.x, a.y, z, config);
        const p1 = roomToScreen(b.x, b.y, z, config);
        const t0 = roomToScreen(a.x, a.y, ceiling, config);
        const t1 = roomToScreen(b.x, b.y, ceiling, config);
        const outer = (p: IsoPoint, height: number): IsoPoint => {
          const joint = junctions.get(key(p.x, p.y))!;
          return roomToScreen(p.x - (joint.x ? style.wallThickness : 0), p.y - (joint.y ? style.wallThickness : 0), height, config);
        };
        const outer0 = outer(a, ceiling), outer1 = outer(b, ceiling);
        const outerBase = outer(b, z);
        const continued = junctions.get(key(b.x, b.y))!.edges > 1;
        walls.push({ x, y, side, base: [p0, p1], depth: isoDepth(x, y) - 0.5,
          front: { polygon: [p0, p1, t1, t0], color: shadeColor(style.wallColor, material.wall.lighting[side]) },
          cap: { polygon: [t0, t1, outer1, outer0], color: shadeColor(style.wallColor, material.wall.lighting.cap) },
          end: continued ? null : { polygon: [p1, outerBase, outer1, t1], color: shadeColor(style.wallColor, material.wall.lighting.edge) },
          startEnd: junctions.get(key(a.x, a.y))!.edges > 1 ? null : { polygon: [p0, outer(a, z), outer0, t0], color: shadeColor(style.wallColor, material.wall.lighting.edge) },
        });
      }
    }
  }
  floors.sort((a, b) => a.depth - b.depth);
  walls.sort((a, b) => a.depth - b.depth);
  return { floors, walls };
}

/** Fit every surface, including tall interior tiles, without applying Z twice. */
export function fitRoomConfig(room: RoomState, width: number, height: number, style: RoomSurfaceStyle = DEFAULT_ROOM_STYLE): IsoConfig {
  style = resolveRoomSurfaceStyle(style);
  const elevationHeight = style.elevationHeight ?? DEFAULT_ISO_CONFIG.elevationHeight;
  if (!Number.isFinite(elevationHeight) || elevationHeight < 1 || elevationHeight > 64) throw new Error('Invalid room elevation projection');
  const baseConfig = { ...DEFAULT_ISO_CONFIG, elevationHeight };
  const surfaces = buildRoomSurfaces(room, baseConfig, style);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (p: IsoPoint): void => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
  for (const floor of surfaces.floors) {
    for (const p of floor.top.polygon) {
      include(p);
      include({ x: p.x, y: p.y - style.wallHeight * elevationHeight });
    }
    for (const face of floor.sides) face.polygon.forEach(include);
  }
  for (const wall of surfaces.walls) { wall.front.polygon.forEach(include); wall.cap.polygon.forEach(include); }
  if (!Number.isFinite(minX)) return baseConfig;
  const padding = DEFAULT_ISO_CONFIG.tileHeight;
  const scale = Math.max(Number.EPSILON, Math.min(1.2, Math.max(1, width - padding * 2) / Math.max(1, maxX - minX), Math.max(1, height - padding * 2) / Math.max(1, maxY - minY)));
  return { ...baseConfig, scale, origin: { x: width / 2 - (minX + maxX) * scale / 2, y: height / 2 - (minY + maxY) * scale / 2 } };
}
