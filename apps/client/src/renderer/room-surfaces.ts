import type { RoomState } from '../room/room-state.ts';
import { DEFAULT_ISO_CONFIG, floorSidePolygon, isoDepth, roomToScreen, tilePolygon, type IsoConfig, type IsoPoint } from './isometric.ts';

export interface RoomSurfaceStyle {
  readonly floorColor: number;
  readonly floorMaterial: 'wood' | 'stone';
  readonly floorThickness: number; // elevation units
  readonly wallColor: number;
  readonly wallMaterial: 'plaster' | 'panel';
  readonly wallHeight: number; // elevation units, same Z as floor/avatar
  readonly wallThickness: number; // grid units, outside the walkable floor
  readonly walls: boolean;
}
export const DEFAULT_ROOM_STYLE: RoomSurfaceStyle = Object.freeze({
  floorColor: 0xb6a080, floorMaterial: 'wood', floorThickness: 0.5,
  wallColor: 0x9ab5bd, wallMaterial: 'plaster', wallHeight: 8, wallThickness: 0.16, walls: true,
});
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

/** All room faces share tile vertices, camera scale and elevation projection. */
export function buildRoomSurfaces(room: RoomState, config: IsoConfig, style: RoomSurfaceStyle = DEFAULT_ROOM_STYLE): RoomSurfaces {
  const floors: FloorSurface[] = [];
  const walls: WallSurface[] = [];
  // One ceiling and one outer vertex per junction. Front panels keep their own
  // depth for occlusion, while their caps meet at convex AND recessed corners.
  const ceiling = Math.max(0, ...room.elevations) + style.wallHeight;
  const junctions = new Map<string, { x: boolean; y: boolean; edges: number }>();
  const key = (x: number, y: number): string => `${x},${y}`;
  if (style.walls) for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) {
    if (elevationAt(room, x, y) === null) continue;
    for (const side of ['x', 'y'] as const) {
      if (elevationAt(room, x - (side === 'x' ? 1 : 0), y - (side === 'y' ? 1 : 0)) !== null) continue;
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
        sides.push({ polygon: floorSidePolygon(top, side, depth), color: shadeColor(style.floorColor, side === 'x' ? 0.62 : 0.76) });
      }
      // Material boards span several grid cells. Grid boundaries are interaction
      // geometry, not a checkerboard texture.
      const variation = style.floorMaterial === 'wood' ? ((Math.floor((x + (y % 2) * 2) / 4) + y) % 3) * 0.008 : 0;
      floors.push({ x, y, elevation: z, top: { polygon: top, color: shadeColor(style.floorColor, 1 - variation) }, sides, depth: isoDepth(x, y) - 0.25 });
      if (!style.walls) continue;
      for (const side of ['x', 'y'] as const) {
        if (elevationAt(room, x - (side === 'x' ? 1 : 0), y - (side === 'y' ? 1 : 0)) !== null) continue;
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
          front: { polygon: [p0, p1, t1, t0], color: shadeColor(style.wallColor, side === 'x' ? 0.80 : 1) },
          cap: { polygon: [t0, t1, outer1, outer0], color: shadeColor(style.wallColor, 1.12) },
          end: continued ? null : { polygon: [p1, outerBase, outer1, t1], color: shadeColor(style.wallColor, 0.66) },
          startEnd: junctions.get(key(a.x, a.y))!.edges > 1 ? null : { polygon: [p0, outer(a, z), outer0, t0], color: shadeColor(style.wallColor, 0.66) },
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
  const surfaces = buildRoomSurfaces(room, DEFAULT_ISO_CONFIG, style);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (p: IsoPoint): void => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
  for (const floor of surfaces.floors) {
    for (const p of floor.top.polygon) {
      include(p);
      include({ x: p.x, y: p.y - style.wallHeight * DEFAULT_ISO_CONFIG.elevationHeight });
    }
    for (const face of floor.sides) face.polygon.forEach(include);
  }
  for (const wall of surfaces.walls) { wall.front.polygon.forEach(include); wall.cap.polygon.forEach(include); }
  if (!Number.isFinite(minX)) return DEFAULT_ISO_CONFIG;
  const padding = DEFAULT_ISO_CONFIG.tileHeight;
  const scale = Math.max(Number.EPSILON, Math.min(1.2, Math.max(1, width - padding * 2) / Math.max(1, maxX - minX), Math.max(1, height - padding * 2) / Math.max(1, maxY - minY)));
  return { ...DEFAULT_ISO_CONFIG, scale, origin: { x: width / 2 - (minX + maxX) * scale / 2, y: height / 2 - (minY + maxY) * scale / 2 } };
}
