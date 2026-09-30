import type { AvatarAction } from './avatar-manifest';

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
  private readonly frameDurationMs: number;

  constructor(frameDurationMs = 120) {
    this.frameDurationMs = frameDurationMs;
  }

  setMoving(moving: boolean): void {
    const next = moving ? 'wlk' : 'std';
    if (next === this.action) return;
    this.action = next;
    this.frame = 0;
    this.elapsedMs = 0;
  }

  update(deltaMs: number, frameCount = this.action === 'wlk' ? 4 : 1): AvatarAnimationState {
    if (this.action === 'std' || !Number.isFinite(deltaMs) || deltaMs <= 0) return this.snapshot();
    this.elapsedMs += Math.min(deltaMs, 250);
    while (this.elapsedMs >= this.frameDurationMs) {
      this.elapsedMs -= this.frameDurationMs;
      this.frame = (this.frame + 1) % Math.max(1, frameCount);
    }
    return this.snapshot();
  }

  snapshot(): AvatarAnimationState {
    return { action: this.action, frame: this.frame, elapsedMs: this.elapsedMs };
  }
}
