import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { RoomOccupant, RoomMovementStep } from '../room/room-state';
import { AvatarAnimationController, WALK_FRAME_DURATION_MS } from './avatar-animation';
import type { AvatarAction, AvatarGender, AvatarManifest, AvatarPart, AvatarFootAnchor } from './avatar-manifest';
import { createAvatarAssetProvider, type AvatarAssetProvider } from './avatar-assets';
import { avatarAnchor, isoDepth, roomToScreen, type IsoConfig } from './isometric';
import { AvatarMovementController } from './avatar-movement';
import { avatarPartSpritePosition, avatarPartTint, resolveAvatarPartLayer, resolveAvatarFootAnchor, applyAvatarFootAnchor, resolveAvatarPartPlacement } from './avatar-composition';

// The Room Engine still processes every 100 ms. Segment duration follows the
// world-grid distance: 500 ms cardinal and 707 ms diagonal.
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
  private readonly composition = new Container();
  private readonly shadow = new Graphics().ellipse(0, 0, 10, 3).fill({ color: 0x18252a, alpha: 0.20 });
  private readonly bubble = new Container();
  private readonly bubbleBackground = new Graphics();
  private readonly bubbleText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 11, fontFamily: 'Arial' } });
  private isoConfig: IsoConfig;
  private readonly movement = new AvatarMovementController();
  private readonly footAnchors: readonly AvatarFootAnchor[];
  private currentDirection = 0;
  private currentAction: AvatarAction = 'std';
  private currentFrame = 0;
  private ready = false;
  private disposed = false;
  private bubbleRemainingMs = 0;

  constructor(occupant: RoomOccupant, options: AvatarViewOptions) {
    this.userId = occupant.userId;
    this.gender = genderForUserId(occupant.userId);
    this.provider = options.provider;
    this.footAnchors = Array.from({length:8},(_,direction)=>resolveAvatarFootAnchor(options.provider.manifest,this.gender,direction));
    this.isoConfig = options.isoConfig;
    this.container.label = `avatar:${occupant.userId}`;
    this.container.sortableChildren = true;
    this.composition.label = 'avatar-composition';
    this.composition.sortableChildren = true;
    this.container.addChild(this.composition);
    this.shadow.zIndex = -100;
    this.container.addChild(this.shadow);
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
    this.movement.setPosition(x, y, z, snap);
    this.positionContainer();
  }

  setMovement(step: RoomMovementStep): void {
    this.movement.announce(step);
    this.positionContainer();
  }

  setDiagnosticsDirection(direction: number): void {
    if (!Number.isInteger(direction) || direction<0 || direction>7) return;
    this.movement.direction = direction;
    this.currentDirection = direction;
    this.refreshSprites();
  }

  update(deltaMs: number): void {
    if (this.disposed || !Number.isFinite(deltaMs)) return;
    const walkingMs = this.movement.update(deltaMs);
    if (walkingMs > 0) {
      this.animation.setMoving(true);
      this.animation.advance(walkingMs, 4);
      this.positionContainer();
    }
    this.animation.setMoving(this.movement.moving);
    if (this.animation.currentAction !== this.currentAction || this.animation.currentFrame !== this.currentFrame
        || this.currentDirection !== this.movement.direction) {
      this.currentAction = this.animation.currentAction;
      this.currentFrame = this.animation.currentFrame;
      this.currentDirection = this.movement.direction;
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

  diagnostics(): object {
    const support = this.footAnchors[this.movement.direction]!;
    const footScreen = this.composition.toGlobal(support);
    const tileCenter = roomToScreen(this.movement.x,this.movement.y,this.movement.z,this.isoConfig);
    const bounds = this.composition.getBounds();
    const errorCssPx = Math.hypot(footScreen.x-tileCenter.x,footScreen.y-tileCenter.y);
    return { userId: this.userId, x: this.movement.x, y: this.movement.y, z: this.movement.z,
      direction: this.movement.direction, moving: this.movement.moving, queued: this.movement.queuedSegments,
      action: this.currentAction, frame: this.currentFrame, ready: this.ready,
      parts: [...this.sprites].map(([part,sprite]) => ({part,visible:sprite.visible,alpha:sprite.alpha,layer:sprite.zIndex,x:sprite.x,y:sprite.y,texture:sprite.texture.label})),
      foot: {support,tileCenter,screen:{x:footScreen.x,y:footScreen.y},containerOrigin:{x:this.container.x,y:this.container.y},
        pivot:{x:this.composition.pivot.x,y:this.composition.pivot.y},bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},
        errorCssPx,errorPhysicalPx:errorCssPx*(window.devicePixelRatio||1),rasterDpr:Math.min(window.devicePixelRatio||1,2),roundPixels:false},
      screenX: this.container.x, screenY: this.container.y, depth: this.container.zIndex };
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
      const resolved = this.provider.getFrame(this.gender, part, this.currentAction, this.movement.direction, this.currentFrame);
      let sprite = this.sprites.get(part);
      if (!resolved) {
        if (sprite) sprite.visible = false;
        continue;
      }
      if (!sprite) {
        sprite = new Sprite({ texture: resolved.texture, anchor: { x: 0.5, y: 1 }, roundPixels: false });
        this.sprites.set(part, sprite);
        this.composition.addChild(sprite);
      } else {
        sprite.texture = resolved.texture;
      }
      const placement = resolveAvatarPartPlacement(resolved.frame, resolved.texture.width, resolved.texture.height);
      const position = avatarPartSpritePosition(placement);
      sprite.position.set(position.x, position.y);
      sprite.scale.x = 1;
      sprite.zIndex = resolveAvatarPartLayer(part, this.movement.direction);
      sprite.tint = avatarPartTint(part);
      sprite.visible = true;
    }
    const mirrored = this.provider.getFrame(this.gender, 'bd', this.currentAction, this.movement.direction, this.currentFrame)?.mirrored ?? false;
    applyAvatarFootAnchor(this.composition,this.footAnchors[this.movement.direction]!,mirrored);
    this.composition.sortChildren();
    this.positionContainer();
  }

  private positionContainer(): void {
    const point = avatarAnchor(roomToScreen(this.movement.x, this.movement.y, this.movement.z, this.isoConfig));
    // Keep the common registration point continuous at every camera scale.
    // Integer CSS snapping stalls small mobile steps, then jumps a whole pixel.
    // Nearest filtering still preserves the atlas; all parts share this transform.
    this.container.position.set(point.x, point.y);
    this.container.scale.set(this.isoConfig.scale);
    this.container.zIndex = isoDepth(this.movement.y, this.movement.x, this.movement.z);
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
