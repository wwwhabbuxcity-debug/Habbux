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
  readonly spriteX: number;
  readonly spriteY: number;
}

export type AvatarTextureLoader = (url: string) => Promise<Texture>;

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
  if (!partDefinition) return undefined;
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

export function createAvatarAssetProvider(manifest: AvatarManifest, assetBaseUrl: string, loader: AvatarTextureLoader = url => Assets.load<Texture>(url)): AvatarAssetProvider {
  return new PngAvatarAssetProvider(manifest, assetBaseUrl, loader);
}

class PngAvatarAssetProvider implements AvatarAssetProvider {
  private readonly sheetTextures = new Map<string, Promise<Texture>>();
  private readonly regionTextures = new Map<string, Promise<Texture>>();
  private readonly resolvedRegions = new Map<string, Texture>();
  // Native fixed lookup compiled once per gender, shared by every room avatar.
  // Each direction keeps its native frame count, including static fallbacks.
  private readonly partIndices = new Map<AvatarPart, number>();
  private readonly preparedFrames = new Map<AvatarGender, readonly (readonly (AvatarResolvedFrame | undefined)[])[]>();
  private readonly preloads = new Map<AvatarGender, Promise<void>>();
  private disposed = false;
  readonly manifest: AvatarManifest;
  private readonly assetBaseUrl: string;
  private readonly loader: AvatarTextureLoader;

  constructor(manifest: AvatarManifest, assetBaseUrl: string, loader: AvatarTextureLoader) {
    this.manifest = manifest;
    this.assetBaseUrl = assetBaseUrl;
    this.loader = loader;
    for (const part of manifest.layerOrder) for (const action of ['std', 'wlk'] as const) {
      if ((manifest.parts[part].actions[action]?.frameCount ?? 1) > 64) throw new Error('Avatar frame count exceeds native limit.');
    }
    manifest.layerOrder.forEach((part, index) => this.partIndices.set(part, index));
  }

  preload(gender: AvatarGender): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Avatar provider disposed.'));
    const existing = this.preloads.get(gender);
    if (existing) return existing;
    const promise = this.prepareGender(gender).catch(cause => {
      this.preloads.delete(gender);
      throw cause;
    });
    this.preloads.set(gender, promise);
    return promise;
  }

  private async prepareGender(gender: AvatarGender): Promise<void> {
    const pending = new Set<Promise<Texture>>();
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
            if (frameDefinition) pending.add(this.loadRegion(definition.sheet, frameDefinition.region));
          }
        }
      }
    }
    await Promise.all(pending);
    if (this.disposed) throw new Error('Avatar provider disposed.');
    const frames: (readonly (AvatarResolvedFrame | undefined)[])[] = new Array(this.manifest.layerOrder.length * 16);
    for (const [part, index] of this.partIndices) {
      for (const action of ['std', 'wlk'] as const) for (let direction = 0; direction < 8; direction++) {
        const count = (this.manifest.parts[part].actions[action] ?? this.manifest.parts[part].actions.std)?.frameCount ?? 1;
        const directionFrames: (AvatarResolvedFrame | undefined)[] = new Array(count);
        for (let frame = 0; frame < count; frame++) {
          const selection = resolveAvatarFrameSelection(this.manifest, gender, part, action, direction, frame);
          if (!selection) continue;
          const texture = this.resolvedRegions.get(selection.frame.region);
          if (!texture) continue;
          directionFrames[frame] = Object.freeze({ texture, frame: selection.frame, mirrored: selection.mirrored,
            spriteX: -selection.frame.offset.x + texture.width / 2,
            spriteY: -selection.frame.offset.y + texture.height });
        }
        frames[index * 16 + (action === 'wlk' ? 8 : 0) + direction] = Object.freeze(directionFrames);
      }
    }
    this.preparedFrames.set(gender, Object.freeze(frames));
  }

  getFrame(gender: AvatarGender, part: AvatarPart, action: AvatarAction, direction: number, frame: number): AvatarResolvedFrame | undefined {
    const index = this.partIndices.get(part);
    if (this.disposed || index === undefined || !Number.isInteger(direction) || direction < 0 || direction > 7 || !Number.isInteger(frame) || frame < 0) return undefined;
    const frames = this.preparedFrames.get(gender)?.[index * 16 + (action === 'wlk' ? 8 : 0) + direction];
    return frames?.[frame % frames.length];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const texturePromise of this.regionTextures.values()) {
      void texturePromise.then((texture) => texture.destroy(false), () => {});
    }
    this.regionTextures.clear();
    this.resolvedRegions.clear();
    this.sheetTextures.clear();
    this.preparedFrames.clear();
    this.preloads.clear();
  }

  private loadRegion(sheetId: string, regionId: string): Promise<Texture> {
    const existing = this.regionTextures.get(regionId);
    if (existing) return existing;
    const region = this.manifest.regions[regionId];
    const sheet = this.manifest.sheets[sheetId];
    if (!region || !sheet) return Promise.reject(new Error(`Asset de avatar ausente: ${sheetId}:${regionId}`));
    const promise = this.loadSheet(sheetId).then((sheetTexture) => {
      if (this.disposed) throw new Error('Avatar provider disposed.');
      const texture = new Texture({
        source: sheetTexture.source,
        frame: new Rectangle(region.x, region.y, region.width, region.height),
        label: `habbux-avatar:${regionId}`,
      });
      this.resolvedRegions.set(regionId, texture);
      return texture;
    }).catch(cause => {
      this.regionTextures.delete(regionId);
      throw cause;
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
    const promise = this.loader(url).then((texture) => {
      // These are pixel-art sheets. Keep filtering stable at room zoom levels
      // so interpolation changes position, never the sprite's sharpness.
      texture.source.style.scaleMode = 'nearest';
      return texture;
    }).catch(cause => {
      this.sheetTextures.delete(sheetId);
      throw cause;
    });
    this.sheetTextures.set(sheetId, promise);
    return promise;
  }
}
