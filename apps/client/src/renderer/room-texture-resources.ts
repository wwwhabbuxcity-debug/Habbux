import type { MaterialRights } from './room-materials.ts';
import type { IsoConfig } from './isometric.ts';
export interface NativeRoomTextureResource {
  readonly surface: 'floor' | 'wall';
  readonly id: string;
  readonly url: string;
  readonly sha256: string;
  readonly rights: MaterialRights;
  readonly provenance: string;
  readonly rightsEvidence: string;
  readonly repeatScale: number;
  readonly verticalRepeatScale?: number;
  readonly tint?: number;
  readonly overlayOpacity?: number;
}
export function validateNativeRoomTextureResources(resources: readonly NativeRoomTextureResource[]): void {
  if (resources.length > 2 || new Set(resources.map(r=>r.surface)).size !== resources.length) throw new Error('Only one shared texture per surface');
  for (const r of resources) {
    if (r.rights !== 'AUTHORIZED' || !r.provenance.trim() || !r.rightsEvidence.trim()) throw new Error('Texture rights evidence required');
    if (!r.id || r.id.length > 128 || !/^[a-f0-9]{64}$/.test(r.sha256)) throw new Error('Invalid texture identity');
    if (r.url.length > 256 || !/^\/client\/assets\/materials\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.png$/.test(r.url)) throw new Error('Texture must use native local assets');
    if (r.overlayOpacity !== undefined && (!Number.isFinite(r.overlayOpacity) || r.overlayOpacity < 0 || r.overlayOpacity > 1)) throw new Error('Invalid texture overlay opacity');
    if (r.verticalRepeatScale !== undefined && (!Number.isFinite(r.verticalRepeatScale) || r.verticalRepeatScale < 0.25 || r.verticalRepeatScale > 16)) throw new Error('Invalid vertical texture projection');
    if (r.tint !== undefined && (!Number.isInteger(r.tint) || r.tint < 0 || r.tint > 0xffffff)) throw new Error('Invalid texture tint');
    if (!['floor','wall'].includes(r.surface) || !Number.isFinite(r.repeatScale) || r.repeatScale < 0.25 || r.repeatScale > 16) throw new Error('Invalid texture projection');
  }
}
export function validateNativeTexturePng(bytes: Uint8Array): void {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 24 || signature.some((value,index)=>bytes[index]!==value)
      || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw new Error('Invalid native PNG header');
  const header = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=header.getUint32(16),height=header.getUint32(20);
  if (width<1 || height<1 || width>1024 || height>1024) throw new Error('Native texture exceeds 1024px');
}
/** Affine texture-to-world projection, shared by every tile on the same plane. */
export function roomTextureMatrix(surface: 'floor' | 'wall', side: 'x' | 'y', z: number, repeat: number, width: number, height: number, config: IsoConfig, verticalRepeat = repeat): readonly [number,number,number,number,number,number] {
  const dx=config.tileWidth*config.scale/2,dy=config.tileHeight*config.scale/2;
  const vertical=config.elevationHeight*config.scale;
  return surface==='floor'
    ? [dx*repeat/width,dy*repeat/width,-dx*verticalRepeat/height,dy*verticalRepeat/height,config.origin.x,config.origin.y-z*vertical]
    : [(side==='x'?-dx:dx)*repeat/width,dy*repeat/width,0,vertical*verticalRepeat/height,config.origin.x,config.origin.y];
}
