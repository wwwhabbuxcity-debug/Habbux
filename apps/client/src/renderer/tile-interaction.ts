import type { RoomState } from '../room/room-state.ts';
import { roomToScreen, screenToRoom, type IsoConfig } from './isometric.ts';

export interface RoomTileHit {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly walkable: boolean;
}

/** Resolve the visible diamond under a screen point using the same projection as the floor. */
export function resolveRoomTileAtScreen(screenX: number, screenY: number, room: RoomState, config: IsoConfig): RoomTileHit | null {
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY) || config.scale <= 0) return null;
  const projected = screenToRoom(screenX, screenY, config);
  let maxElevation = 0;
  for (const elevation of room.elevations) {
    if (Number.isFinite(elevation)) maxElevation = Math.max(maxElevation, elevation);
  }
  const elevationReach = Math.ceil(maxElevation * config.elevationHeight / config.tileHeight) + 2;
  const minX = Math.max(0, Math.floor(projected.x) - 1);
  const minY = Math.max(0, Math.floor(projected.y) - 1);
  const maxX = Math.min(room.width - 1, Math.ceil(projected.x + elevationReach));
  const maxY = Math.min(room.height - 1, Math.ceil(projected.y + elevationReach));
  if (minX > maxX || minY > maxY) return null;

  const halfWidth = config.tileWidth * config.scale / 2;
  const halfHeight = config.tileHeight * config.scale / 2;
  let best: { hit: RoomTileHit; elevation: number; distance: number } | null = null;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const elevation = room.elevations[y * room.width + x] ?? 0;
      const center = roomToScreen(x, y, elevation, config);
      const normalizedDistance = Math.abs(screenX - center.x) / halfWidth + Math.abs(screenY - center.y) / halfHeight;
      if (normalizedDistance > 1 + Number.EPSILON) continue;
      if (!best || elevation > best.elevation || (elevation === best.elevation && normalizedDistance < best.distance)) {
        best = {
          hit: { x, y, elevation, walkable: room.walkability[y * room.width + x] === true },
          elevation,
          distance: normalizedDistance,
        };
      }
    }
  }
  return best?.hit ?? null;
}
