import { resolveAvatarDirection } from './avatar-direction.ts';
import { avatarMovementDurationMs, isAdjacentAvatarStep } from './renderer-model.ts';

// One room tick absorbs the 100 ms scheduler quantization without changing
// segment speed. This is presentation latency; it never predicts a tile.
export const MOVEMENT_PRESENTATION_BUFFER_MS = 100;
export const MAX_QUEUED_SEGMENTS = 256;
interface Segment { x: number; y: number; z: number; direction: number; duration: number }

/** Ordered, bounded server positions. Scalar state is reused on every frame. */
export class AvatarMovementController {
  x = 0;
  y = 0;
  z = 0;
  direction = 0;
  moving = false;
  private logicalX = 0;
  private logicalY = 0;
  private logicalZ = 0;
  private startX = 0;
  private startY = 0;
  private startZ = 0;
  private elapsed = 0;
  private delay = 0;
  private current: Segment | null = null;
  private readonly queue: (Segment | undefined)[] = new Array(MAX_QUEUED_SEGMENTS);
  private head = 0;
  private count = 0;

  get queuedSegments(): number { return this.count; }

  setPosition(x: number, y: number, z = 0, snap = false): void {
    if (![x, y, z].every(Number.isFinite)) return;
    const dx = x - this.logicalX;
    const dy = y - this.logicalY;
    if (!snap && dx === 0 && dy === 0 && z === this.logicalZ) return;
    this.logicalX = x;
    this.logicalY = y;
    this.logicalZ = z;
    if (snap || !isAdjacentAvatarStep(dx, dy) || this.count === MAX_QUEUED_SEGMENTS) {
      this.queue.fill(undefined);
      this.head = this.count = this.elapsed = this.delay = 0;
      this.current = null;
      this.moving = false;
      this.x = x; this.y = y; this.z = z;
      return;
    }
    const segment: Segment = { x, y, z, direction: resolveAvatarDirection(dx, dy, this.direction), duration: avatarMovementDurationMs(dx, dy) };
    if (this.current) {
      this.queue[(this.head + this.count++) % MAX_QUEUED_SEGMENTS] = segment;
    } else {
      this.begin(segment);
      this.delay = MOVEMENT_PRESENTATION_BUFFER_MS;
    }
  }

  /** Returns actual walking time, excluding startup delay and idle time. */
  update(deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
    let remaining = deltaMs;
    const waiting = Math.min(remaining, this.delay);
    this.delay -= waiting;
    remaining -= waiting;
    let walkingMs = 0;
    while (this.current && remaining > 0) {
      const step = this.current;
      const consumed = Math.min(remaining, step.duration - this.elapsed);
      this.elapsed += consumed;
      remaining -= consumed;
      walkingMs += consumed;
      this.moving = true;
      const t = this.elapsed / step.duration;
      this.x = this.startX + (step.x - this.startX) * t;
      this.y = this.startY + (step.y - this.startY) * t;
      this.z = this.startZ + (step.z - this.startZ) * t;
      if (this.elapsed < step.duration) break;
      this.x = step.x; this.y = step.y; this.z = step.z;
      if (this.count > 0) {
        const next = this.queue[this.head]!;
        this.queue[this.head] = undefined;
        this.head = (this.head + 1) % MAX_QUEUED_SEGMENTS;
        this.count--;
        this.begin(next);
      } else {
        this.current = null;
        this.moving = false;
      }
    }
    return walkingMs;
  }

  private begin(segment: Segment): void {
    this.startX = this.x; this.startY = this.y; this.startZ = this.z;
    this.current = segment;
    this.elapsed = 0;
    this.direction = segment.direction;
  }
}
