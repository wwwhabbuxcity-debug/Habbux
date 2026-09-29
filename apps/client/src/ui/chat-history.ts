export interface ChatBubble {
  readonly userId: string;
  readonly username: string;
  readonly message: string;
  readonly timestamp: number;
  readonly expiresAt: number;
}

/** Bounded room chat adapter. Expiration is swept on writes/reads; no timer per bubble. */
export class ChatHistory {
  private bubbles: ChatBubble[] = [];
  private readonly capacity: number;
  private readonly lifetimeMs: number;

  constructor(capacity = 50, lifetimeMs = 45_000) {
    this.capacity = capacity;
    this.lifetimeMs = lifetimeMs;
  }

  add(message: { readonly userId: string; readonly username: string; readonly message: string }, now = Date.now()): readonly ChatBubble[] {
    this.sweep(now);
    const bubble = Object.freeze({
      ...message,
      timestamp: now,
      expiresAt: now + Math.max(1000, this.lifetimeMs),
    });
    this.bubbles = [...this.bubbles, bubble].slice(-Math.max(1, this.capacity));
    return this.list(now);
  }

  list(now = Date.now()): readonly ChatBubble[] {
    this.sweep(now);
    return this.bubbles;
  }

  clear(): void { this.bubbles = []; }

  private sweep(now: number): void {
    const retained = this.bubbles.filter((bubble) => bubble.expiresAt > now);
    if (retained.length !== this.bubbles.length) this.bubbles = retained;
  }
}
