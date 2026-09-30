import { Assets, Rectangle, Texture } from 'pixi.js';
import type {
  AvatarAction,
  AvatarGender,
  AvatarManifest,
  AvatarPart,
  AvatarFrameDefinition,
} from './avatar-manifest';

export interface AvatarResolvedFrame {
  readonly texture: Texture;
  readonly frame: AvatarFrameDefinition;
  readonly mirrored: boolean;
}

/** Boundary between the renderer and the current PNG atlas implementation. */
export interface AvatarAssetProvider {
  readonly manifest: AvatarManifest;
  preload(gender: AvatarGender): Promise<void>;
  getFrame(gender: AvatarGender, part: AvatarPart, action: AvatarAction, direction: number, frame: number): AvatarResolvedFrame | undefined;
  dispose(): void;
}

export async function loadAvatarManifest(url: string): Promise<AvatarManifest> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Manifesto de avatar indisponível (${response.status}).`);
  const value: unknown = await response.json();
  const { parseAvatarManifest } = await import('./avatar-manifest');
  return parseAvatarManifest(value);
}

export function createAvatarAssetProvider(manifest: AvatarManifest, assetBaseUrl: string): AvatarAssetProvider {
  return new PngAvatarAssetProvider(manifest, assetBaseUrl);
}

class PngAvatarAssetProvider implements AvatarAssetProvider {
  private readonly sheetTextures = new Map<string, Promise<Texture>>();
  private readonly regionTextures = new Map<string, Promise<Texture>>();
  private readonly resolvedRegions = new Map<string, Texture>();
  readonly manifest: AvatarManifest;
  private readonly assetBaseUrl: string;

  constructor(manifest: AvatarManifest, assetBaseUrl: string) {
    this.manifest = manifest;
    this.assetBaseUrl = assetBaseUrl;
  }

  async preload(gender: AvatarGender): Promise<void> {
    const pending: Promise<Texture>[] = [];
    for (const part of this.manifest.layerOrder) {
      const definition = this.manifest.parts[part];
      for (const action of ['std', 'wlk'] as const) {
        const actionDefinition = definition.actions[action];
        if (!actionDefinition) continue;
        const genderDefinition = actionDefinition.genders[gender];
        for (let direction = 0; direction < this.manifest.directions.count; direction++) {
          const directionDefinition = genderDefinition.directions[String(direction)];
          if (!directionDefinition) continue;
          for (let frame = 0; frame < actionDefinition.frameCount; frame++) {
            const frameDefinition = directionDefinition.frames[String(frame)];
            if (frameDefinition) pending.push(this.loadRegion(definition.sheet, frameDefinition.region));
          }
        }
      }
    }
    await Promise.all(pending);
  }

  getFrame(gender: AvatarGender, part: AvatarPart, action: AvatarAction, direction: number, frame: number): AvatarResolvedFrame | undefined {
    const partDefinition = this.manifest.parts[part];
    const actionDefinition = partDefinition.actions[action];
    const genderDefinition = actionDefinition?.genders[gender];
    const directionDefinition = genderDefinition?.directions[String(direction)];
    const frameDefinition = directionDefinition?.frames[String(frame)];
    if (!actionDefinition || !directionDefinition || !frameDefinition) return undefined;
    const texture = this.resolvedRegions.get(frameDefinition.region);
    if (!texture) return undefined;
    return { texture, frame: frameDefinition, mirrored: directionDefinition.mirrored };
  }

  dispose(): void {
    for (const texturePromise of this.regionTextures.values()) {
      void texturePromise.then((texture) => texture.destroy(false));
    }
    this.regionTextures.clear();
    this.resolvedRegions.clear();
    this.sheetTextures.clear();
  }

  private loadRegion(sheetId: string, regionId: string): Promise<Texture> {
    const existing = this.regionTextures.get(regionId);
    if (existing) return existing;
    const region = this.manifest.regions[regionId];
    const sheet = this.manifest.sheets[sheetId];
    if (!region || !sheet) return Promise.reject(new Error(`Asset de avatar ausente: ${sheetId}:${regionId}`));
    const promise = this.loadSheet(sheetId).then((sheetTexture) => {
      const texture = new Texture({
        source: sheetTexture.source,
        frame: new Rectangle(region.x, region.y, region.width, region.height),
        label: `habbux-avatar:${regionId}`,
      });
      this.resolvedRegions.set(regionId, texture);
      return texture;
    });
    this.regionTextures.set(regionId, promise);
    return promise;
  }

  private loadSheet(sheetId: string): Promise<Texture> {
    const existing = this.sheetTextures.get(sheetId);
    if (existing) return existing;
    const sheet = this.manifest.sheets[sheetId];
    if (!sheet) return Promise.reject(new Error(`Sheet de avatar ausente: ${sheetId}`));
    const url = new URL(sheet.src, this.assetBaseUrl).toString();
    const promise = Assets.load<Texture>(url);
    this.sheetTextures.set(sheetId, promise);
    return promise;
  }
}
