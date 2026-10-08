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

/** Camera-facing limb order; mirroring applies to the entire composition. */
export function resolveAvatarPartLayer(part: AvatarPart, direction: number): number {
  const renderDirection = direction === 4 ? 2 : direction === 5 ? 1 : direction === 6 ? 0 : direction;
  const nearLeft = renderDirection === 0 || renderDirection === 7;
  switch (part) {
    case 'bd': return 0;
    case 'lg': return 2;
    case 'sh': return 3;
    case 'lh': return nearLeft ? 8 : 4;
    case 'ls': return nearLeft ? 9 : 5;
    case 'rh': return nearLeft ? 4 : 8;
    case 'rs': return nearLeft ? 5 : 9;
    case 'ch': return 6;
    case 'hrb': return 10;
    case 'hd': return 11;
    case 'fc': return 12;
    case 'ey': return 13;
    case 'hr': return 14;
  }
}

/** Original default palette; no figure-data or palette copied from another hotel. */
export function avatarPartTint(part: AvatarPart): number {
  switch (part) {
    case 'bd': case 'hd': case 'lh': case 'rh': case 'fc': return 0xf3c6a6;
    case 'ch': case 'ls': case 'rs': return 0xa9c9dd;
    case 'lg': return 0x647588;
    case 'sh': return 0x424b55;
    case 'hr': case 'hrb': return 0x80604a;
    case 'ey': return 0xffffff;
  }
}
