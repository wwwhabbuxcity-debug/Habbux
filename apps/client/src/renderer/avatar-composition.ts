import type { AvatarFrameDefinition, AvatarPart, AvatarManifest, AvatarGender, AvatarFootAnchor } from './avatar-manifest';

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

/** Fixed STAND support: resolved once per gender/direction, never from WALK bounds. */
export function resolveAvatarFootAnchor(manifest: AvatarManifest, gender: AvatarGender, direction: number): AvatarFootAnchor {
  const registered = manifest.footAnchors?.genders[gender][String(direction)];
  if (registered) return registered;
  // Legacy manifests have no alpha-contour metadata. Their STAND shoe reference
  // still stays fixed; all shipped figures use the explicit support metadata.
  const frame = manifest.parts.sh.actions.std?.genders[gender].directions[String(direction)]?.frames['0'];
  const region = frame && manifest.regions[frame.region];
  if (!frame || !region) throw new Error('Sapatos STAND sem referência de apoio.');
  return {x:-frame.offset.x+region.width/2,y:-frame.offset.y+region.height,referenceRegion:frame.region,sampleCount:0};
}

interface FootAnchorTarget {
  readonly pivot: {set(x:number,y:number): unknown};
  readonly position: {set(x:number,y:number): unknown};
  readonly scale: {x:number};
}
/** Pixi applies the pivot before the reflection: S * (sprite - support). */
export function applyAvatarFootAnchor(target: FootAnchorTarget, support: AvatarFootAnchor, mirrored: boolean): void {
  target.pivot.set(support.x,support.y);
  target.position.set(0,0);
  target.scale.x = mirrored ? -1 : 1;
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
