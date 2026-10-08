import type { AvatarAction } from './avatar-manifest';

// Gallaxys/Octane updates avatar visuals every 41 ms and advances WALK every
// two visual updates. Keep that visual clock independent from room movement.
export const AVATAR_VISUAL_UPDATE_MS = 41;
export const WALK_FRAME_UPDATE_INTERVAL = 2;
export const WALK_FRAME_DURATION_MS = AVATAR_VISUAL_UPDATE_MS * WALK_FRAME_UPDATE_INTERVAL;

export interface AvatarAnimationState {
  readonly action: AvatarAction;
  readonly frame: number;
  readonly elapsedMs: number;
}

/** Pure shared-clock animation state; no timer is allocated per avatar. */
export class AvatarAnimationController {
  private action: AvatarAction = 'std';
  private frame = 0;
  private elapsedMs = 0;
  private walkFrame = 0;
  private walkElapsedMs = 0;
  private readonly frameDurationMs: number;

  constructor(frameDurationMs = 120) {
    this.frameDurationMs = frameDurationMs;
  }

  setMoving(moving: boolean): void {
    const next = moving ? 'wlk' : 'std';
    if (next === this.action) return;
    if (!moving) {
      this.walkFrame = this.frame;
      this.walkElapsedMs = this.elapsedMs;
    }
    this.action = next;
    if (moving) {
      this.frame = this.walkFrame;
      this.elapsedMs = this.walkElapsedMs;
    } else {
      this.frame = 0;
      this.elapsedMs = 0;
    }
  }

  update(deltaMs: number, frameCount = this.action === 'wlk' ? 4 : 1): AvatarAnimationState {
    if (this.action === 'std' || !Number.isFinite(deltaMs) || deltaMs <= 0) return this.snapshot();
    this.elapsedMs += Math.min(deltaMs, 250);
    while (this.elapsedMs >= this.frameDurationMs) {
      this.elapsedMs -= this.frameDurationMs;
      this.frame = (this.frame + 1) % Math.max(1, frameCount);
    }
    this.walkFrame = this.frame;
    this.walkElapsedMs = this.elapsedMs;
    return this.snapshot();
  }

  snapshot(): AvatarAnimationState {
    return { action: this.action, frame: this.frame, elapsedMs: this.elapsedMs };
  }
}
