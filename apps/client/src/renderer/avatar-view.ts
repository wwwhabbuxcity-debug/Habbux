import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { RoomOccupant } from '../room/room-state';
import { AvatarAnimationController } from './avatar-animation';
import type { AvatarAction, AvatarGender, AvatarManifest, AvatarPart } from './avatar-manifest';
import { createAvatarAssetProvider, type AvatarAssetProvider } from './avatar-assets';
import { isoDepth, roomToScreen, type IsoConfig } from './isometric';
import { resolveAvatarDirection } from './avatar-direction';
import { interpolateAvatarElevation, interpolateAvatarPosition } from './renderer-model';

// RoomConfig.defaults() emits one authoritative position every 100 ms.
// The visual step must finish before the next authoritative tile arrives.
const WALK_DURATION_MS = 100;
const WALK_FRAME_DURATION_MS = WALK_DURATION_MS / 4;
const BUBBLE_DURATION_MS = 4_500;

export interface AvatarViewOptions {
  readonly provider: AvatarAssetProvider;
  readonly isoConfig: IsoConfig;
}

export class AvatarView {
  readonly container = new Container();
  readonly userId: string;
  readonly gender: AvatarGender;
  private readonly provider: AvatarAssetProvider;
  private readonly animation = new AvatarAnimationController(WALK_FRAME_DURATION_MS);
  private readonly sprites = new Map<AvatarPart, Sprite>();
  private readonly bubble = new Container();
  private readonly bubbleBackground = new Graphics();
  private readonly bubbleText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 11, fontFamily: 'Arial' } });
  private isoConfig: IsoConfig;
  private logicalX = 0;
  private logicalY = 0;
  private logicalZ = 0;
  private renderX = 0;
  private renderY = 0;
  private renderZ = 0;
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private moveStartX = 0;
  private moveStartY = 0;
  private moveStartZ = 0;
  private moveElapsedMs = 0;
  private moving = false;
  private direction = 0;
  private currentAction: AvatarAction = 'std';
  private currentFrame = 0;
  private ready = false;
  private disposed = false;
  private bubbleRemainingMs = 0;

  constructor(occupant: RoomOccupant, options: AvatarViewOptions) {
    this.userId = occupant.userId;
    this.gender = genderForUserId(occupant.userId);
    this.provider = options.provider;
    this.isoConfig = options.isoConfig;
    this.container.label = `avatar:${occupant.userId}`;
    this.container.sortableChildren = true;
    this.bubble.visible = false;
    this.bubble.zIndex = 10_000;
    this.bubble.addChild(this.bubbleBackground, this.bubbleText);
    this.container.addChild(this.bubble);
    this.setPosition(occupant.x, occupant.y, occupant.z ?? 0, true);
    void this.prepare();
  }

  setIsoConfig(config: IsoConfig): void {
    this.isoConfig = config;
    this.positionContainer();
  }

  setPosition(x: number, y: number, z = 0, snap = false): void {
    if (x === this.logicalX && y === this.logicalY && z === this.logicalZ && !snap) return;
    const deltaX = x - this.logicalX;
    const deltaY = y - this.logicalY;
    if (!snap) this.direction = resolveAvatarDirection(deltaX, deltaY, this.direction);
    this.logicalX = x;
    this.logicalY = y;
    this.logicalZ = z;
    this.targetX = x;
    this.targetY = y;
    this.targetZ = z;
    if (snap || Math.abs(deltaX) + Math.abs(deltaY) > 1.5) {
      this.renderX = x;
      this.renderY = y;
      this.renderZ = z;
      this.moveStartX = x;
      this.moveStartY = y;
      this.moveStartZ = z;
      this.moveElapsedMs = WALK_DURATION_MS;
      this.moving = false;
    } else {
      this.moveStartX = this.renderX;
      this.moveStartY = this.renderY;
      this.moveStartZ = this.renderZ;
      this.moveElapsedMs = 0;
      this.moving = true;
    }
    this.positionContainer();
  }

  update(deltaMs: number): void {
    if (this.disposed) return;
    if (this.moving) {
      this.moveElapsedMs = Math.min(WALK_DURATION_MS, this.moveElapsedMs + Math.max(0, deltaMs));
      const progress = this.moveElapsedMs / WALK_DURATION_MS;
      const interpolated = interpolateAvatarPosition(this.moveStartX, this.moveStartY, this.targetX, this.targetY, progress);
      this.renderX = interpolated.x;
      this.renderY = interpolated.y;
      this.renderZ = interpolateAvatarElevation(this.moveStartZ, this.targetZ, progress);
      if (progress >= 1) {
        this.renderX = this.targetX;
        this.renderY = this.targetY;
        this.renderZ = this.targetZ;
        this.moving = false;
      }
      this.positionContainer();
    }
    this.animation.setMoving(this.moving);
    const animation = this.animation.update(deltaMs, 4);
    if (animation.action !== this.currentAction || animation.frame !== this.currentFrame) {
      this.currentAction = animation.action;
      this.currentFrame = animation.frame;
      this.refreshSprites();
    }
    if (this.bubbleRemainingMs > 0) {
      this.bubbleRemainingMs = Math.max(0, this.bubbleRemainingMs - Math.max(0, deltaMs));
      this.bubble.visible = this.bubbleRemainingMs > 0;
    }
  }

  setBubble(message: string): void {
    if (!message.trim()) return;
    const text = [...message].slice(0, 96).join('');
    this.bubbleText.text = text;
    this.bubbleBackground.clear();
    this.bubbleBackground.roundRect(-5, -this.bubbleText.height - 8, this.bubbleText.width + 10, this.bubbleText.height + 8, 5).fill({ color: 0x102030, alpha: 0.92 });
    this.bubbleText.position.set(0, -this.bubbleText.height - 4);
    this.bubble.position.set(0, -92);
    this.bubbleRemainingMs = BUBBLE_DURATION_MS;
    this.bubble.visible = true;
  }

  dispose(): void {
    this.disposed = true;
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }

  private async prepare(): Promise<void> {
    try {
      await this.provider.preload(this.gender);
      if (this.disposed) return;
      this.ready = true;
      this.refreshSprites();
    } catch {
      // The room remains usable when optional avatar pixels fail to load.
      this.ready = false;
    }
  }

  private refreshSprites(): void {
    if (!this.ready || this.disposed) return;
    for (const part of this.provider.manifest.layerOrder) {
      const resolved = this.provider.getFrame(this.gender, part, this.currentAction, this.direction, this.currentFrame);
      let sprite = this.sprites.get(part);
      if (!resolved) {
        if (sprite) sprite.visible = false;
        continue;
      }
      if (!sprite) {
        sprite = new Sprite({ texture: resolved.texture, anchor: { x: 0.5, y: 1 }, roundPixels: true });
        sprite.zIndex = this.provider.manifest.parts[part].layer;
        this.sprites.set(part, sprite);
        this.container.addChildAt(sprite, Math.min(this.container.children.length - 1, this.provider.manifest.layerOrder.indexOf(part)));
      } else {
        sprite.texture = resolved.texture;
      }
      const width = resolved.texture.width;
      const height = resolved.texture.height;
      sprite.position.set(resolved.frame.offset.x + width / 2, height - resolved.frame.offset.y);
      sprite.scale.x = resolved.mirrored ? -1 : 1;
      sprite.visible = true;
    }
    this.container.sortChildren();
  }

  private positionContainer(): void {
    const point = roomToScreen(this.renderX, this.renderY, this.renderZ, this.isoConfig);
    this.container.position.set(point.x, point.y);
    this.container.scale.set(this.isoConfig.scale);
    this.container.zIndex = isoDepth(this.renderY, this.renderX, this.renderZ);
  }
}

export function genderForUserId(userId: string): AvatarGender {
  let hash = 2166136261;
  for (const character of userId) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return (hash >>> 0) % 2 === 0 ? 'male' : 'female';
}

export function createAvatarProvider(manifest: AvatarManifest, baseUrl: string): AvatarAssetProvider {
  return createAvatarAssetProvider(manifest, baseUrl);
}
