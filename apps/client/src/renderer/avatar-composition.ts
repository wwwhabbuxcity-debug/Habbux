import type { AvatarFrameDefinition, AvatarPart } from './avatar-manifest';

export interface AvatarPartPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Converte a origem do recorte do manifesto para a posição no canvas comum. */
export function resolveAvatarPartPlacement(frame: AvatarFrameDefinition, width: number, height: number): AvatarPartPlacement {
  return { x: -frame.offset.x, y: -frame.offset.y, width, height };
}

export function avatarPartSpritePosition(placement: AvatarPartPlacement): { readonly x: number; readonly y: number } {
  return { x: placement.x + placement.width / 2, y: placement.y + placement.height };
}

/** Registro estável dos pés, derivado das peças inferiores do avatar. */
export function resolveAvatarFootAnchorX(placements: ReadonlyMap<AvatarPart, AvatarPartPlacement>): number {
  const boxes = (['lg', 'sh'] as const)
    .map((part) => placements.get(part))
    .filter((value): value is AvatarPartPlacement => value !== undefined);
  if (boxes.length === 0) return 0;
  const minX = Math.min(...boxes.map((box) => box.x));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  return (minX + maxX) / 2;
}

export function resolveAvatarCompositionOffsetX(footAnchorX: number, mirrored: boolean): number {
  return mirrored ? footAnchorX : -footAnchorX;
}
