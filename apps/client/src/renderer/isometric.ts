export interface IsoPoint {
  readonly x: number;
  readonly y: number;
}

export interface IsoConfig {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly elevationHeight: number;
  readonly scale: number;
  readonly origin: IsoPoint;
}

export const DEFAULT_ISO_CONFIG: IsoConfig = Object.freeze({
  tileWidth: 64,
  tileHeight: 32,
  elevationHeight: 16,
  scale: 1,
  origin: Object.freeze({ x: 0, y: 0 }),
});

export function roomToScreen(x: number, y: number, elevation = 0, config: IsoConfig = DEFAULT_ISO_CONFIG): IsoPoint {
  return {
    x: config.origin.x + (x - y) * config.tileWidth * config.scale / 2,
    y: config.origin.y + (x + y) * config.tileHeight * config.scale / 2 - elevation * config.elevationHeight * config.scale,
  };
}

export function screenToRoom(screenX: number, screenY: number, config: IsoConfig = DEFAULT_ISO_CONFIG): IsoPoint {
  const x = (screenX - config.origin.x) / config.scale;
  const y = (screenY - config.origin.y) / config.scale;
  return {
    x: (x / (config.tileWidth / 2) + y / (config.tileHeight / 2)) / 2,
    y: (y / (config.tileHeight / 2) - x / (config.tileWidth / 2)) / 2,
  };
}

export function tilePolygon(center: IsoPoint, config: IsoConfig = DEFAULT_ISO_CONFIG): readonly IsoPoint[] {
  const halfWidth = config.tileWidth * config.scale / 2;
  const halfHeight = config.tileHeight * config.scale / 2;
  return [
    { x: center.x, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y },
    { x: center.x, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y },
  ];
}

export function isoDepth(x: number, y: number, elevation = 0): number {
  return x + y + elevation * 0.01;
}
