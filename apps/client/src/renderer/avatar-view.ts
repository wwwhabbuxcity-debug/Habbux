import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { RoomOccupant } from '../room/room-state';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from './avatar-animation';
import type { AvatarAction, AvatarGender, AvatarManifest, AvatarPart } from './avatar-manifest';
import { createAvatarAssetProvider, type AvatarAssetProvider } from './avatar-assets';
import { avatarAnchor, isoDepth, roomToScreen, type IsoConfig } from './isometric';
import { resolveAvatarDirection } from './avatar-direction';
import { avatarMovementDurationMs, interpolateAvatarElevation, interpolateAvatarPosition, isAdjacentAvatarStep } from './renderer-model';

// The Room Engine still processes every 100 ms. Segment duration follows the
// world-grid distance: 500 ms cardinal and 707 ms diagonal.
const DEFAULT_MOVEMENT_STEP_MS = 500;
const BUBBLE_DURATION_MS = 4_500;

export interface AvatarViewOptions {
  readonly provider: AvatarAssetProvider;
  readonly isoConfig: IsoConfig;
}

interface AvatarSegment {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly durationMs: number;
  readonly direction: number;
}

const MAX_QUEUED_SEGMENTS = 256;

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
  private moveDurationMs = DEFAULT_MOVEMENT_STEP_MS;
  private readonly pendingSegments: AvatarSegment[] = [];
  private footOffset = 7;
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
    const nextDirection = snap ? this.direction : resolveAvatarDirection(deltaX, deltaY, this.direction);
    this.logicalX = x;
    this.logicalY = y;
    this.logicalZ = z;

    if (snap || !isAdjacentAvatarStep(deltaX, deltaY)) {
      this.pendingSegments.length = 0;
      this.renderX = x;
      this.renderY = y;
      this.renderZ = z;
      this.moveStartX = x;
      this.moveStartY = y;
      this.moveStartZ = z;
      this.targetX = x;
      this.targetY = y;
      this.targetZ = z;
      this.moveElapsedMs = this.moveDurationMs;
      this.moving = false;
    } else {
      const segment: AvatarSegment = {
        x,
        y,
        z,
        durationMs: avatarMovementDurationMs(deltaX, deltaY),
        direction: nextDirection,
      };
      if (this.moving) {
        if (this.pendingSegments.length < MAX_QUEUED_SEGMENTS) this.pendingSegments.push(segment);
      } else {
        this.startSegment(segment);
      }
    }
    this.positionContainer();
  }

  update(deltaMs: number): void {
    if (this.disposed) return;
    if (this.moving) {
      this.moveElapsedMs = Math.min(this.moveDurationMs, this.moveElapsedMs + Math.max(0, deltaMs));
      const progress = this.moveElapsedMs / this.moveDurationMs;
      const interpolated = interpolateAvatarPosition(this.moveStartX, this.moveStartY, this.targetX, this.targetY, progress);
      this.renderX = interpolated.x;
      this.renderY = interpolated.y;
      this.renderZ = interpolateAvatarElevation(this.moveStartZ, this.targetZ, progress);
      if (progress >= 1) {
        this.renderX = this.targetX;
        this.renderY = this.targetY;
        this.renderZ = this.targetZ;
        const next = this.pendingSegments.shift();
        if (next) this.startSegment(next);
        else this.moving = false;
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

  private startSegment(segment: AvatarSegment): void {
    this.moveStartX = this.renderX;
    this.moveStartY = this.renderY;
    this.moveStartZ = this.renderZ;
    this.targetX = segment.x;
    this.targetY = segment.y;
    this.targetZ = segment.z;
    this.moveDurationMs = segment.durationMs;
    this.moveElapsedMs = 0;
    this.direction = segment.direction;
    this.moving = true;
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
    this.footOffset = this.measureFootOffset();
    for (const part of this.provider.manifest.layerOrder) {
      const resolved = this.provider.getFrame(this.gender, part, this.currentAction, this.direction, this.currentFrame);
      let sprite = this.sprites.get(part);
      if (!resolved) {
        if (sprite) sprite.visible = false;
        continue;
      }
      if (!sprite) {
        sprite = new Sprite({ texture: resolved.texture, anchor: { x: 0.5, y: 1 }, roundPixels: false });
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
    this.positionContainer();
  }

  private measureFootOffset(): number {
    let bottom = 0;
    for (const action of ['std', 'wlk'] as const) {
      const actionDefinition = this.provider.manifest.parts.bd.actions[action];
      const frameCount = actionDefinition?.frameCount ?? 1;
      for (let frame = 0; frame < frameCount; frame++) {
        for (const part of this.provider.manifest.layerOrder) {
          const resolved = this.provider.getFrame(this.gender, part, action, this.direction, frame);
          if (resolved) bottom = Math.max(bottom, resolved.texture.height - resolved.frame.offset.y);
        }
      }
    }
    return bottom;
  }

  private positionContainer(): void {
    const point = avatarAnchor(roomToScreen(this.renderX, this.renderY, this.renderZ, this.isoConfig), this.isoConfig, this.footOffset);
    // Snap the composed avatar once. Snapping each body part independently
    // makes pieces land on different pixels while the avatar is interpolating.
    this.container.position.set(Math.round(point.x), Math.round(point.y));
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
