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

export interface AvatarFrameSelection {
  readonly frame: AvatarFrameDefinition;
  readonly mirrored: boolean;
}

export function resolveAvatarFrameSelection(
  manifest: AvatarManifest,
  gender: AvatarGender,
  part: AvatarPart,
  action: AvatarAction,
  direction: number,
  frame: number,
): AvatarFrameSelection | undefined {
  const partDefinition = manifest.parts[part];
  const actionDefinition = partDefinition.actions[action] ?? partDefinition.actions.std;
  if (!actionDefinition) return undefined;
  const genderDefinition = actionDefinition.genders[gender];
  const directDirection = genderDefinition.directions[String(direction)];
  const renderDirection = manifest.directions.mirrorForRender[String(direction)];
  const directionDefinition = directDirection
    ?? (renderDirection === undefined ? undefined : genderDefinition.directions[String(renderDirection)]);
  if (!directionDefinition) return undefined;
  const frameIndex = actionDefinition.frameCount === 1 ? 0 : frame % actionDefinition.frameCount;
  const frameDefinition = directionDefinition.frames[String(frameIndex)];
  if (!frameDefinition) return undefined;
  return {
    frame: frameDefinition,
    mirrored: directionDefinition.mirrored || (!directDirection && manifest.directions.flipped[String(direction)] === true),
  };
}

export async function loadAvatarManifest(url: string): Promise<AvatarManifest> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    // Metadata can be corrected independently of the unchanged PNG sheets.
    // Revalidate once on load so an existing browser receives those corrections.
    const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`Manifesto de avatar indisponível (${response.status}).`);
    const value: unknown = await response.json();
    const { parseAvatarManifest } = await import('./avatar-manifest');
    return parseAvatarManifest(value);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('O manifesto de avatar excedeu o tempo limite.');
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
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
    const selection = resolveAvatarFrameSelection(this.manifest, gender, part, action, direction, frame);
    if (!selection) return undefined;
    const texture = this.resolvedRegions.get(selection.frame.region);
    if (!texture) return undefined;
    return { texture, frame: selection.frame, mirrored: selection.mirrored };
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
    const promise = Assets.load<Texture>(url).then((texture) => {
      // These are pixel-art sheets. Keep filtering stable at room zoom levels
      // so interpolation changes position, never the sprite's sharpness.
      texture.source.style.scaleMode = 'nearest';
      return texture;
    });
    this.sheetTextures.set(sheetId, promise);
    return promise;
  }
}
