export interface ViewportBounds {
  readonly width: number;
  readonly height: number;
}

export interface WindowOptions {
  readonly id: string;
  readonly title: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly instance?: boolean;
}

export type WindowPresentation = 'floating' | 'panel' | 'sheet';

export interface WindowSnapshot {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zOrder: number;
  readonly presentation: WindowPresentation;
}

type MutableWindow = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zOrder: number;
  presentation: WindowPresentation;
};

const MIN_VISIBLE = 72;
const GAP = 18;
export const UI_BREAKPOINTS = Object.freeze({ mobile: 672, tablet: 1024 });

/** Small in-memory manager; UI window state never becomes server/game state. */
export class WindowManager {
  private readonly windows = new Map<string, MutableWindow>();
  private readonly listeners = new Set<(windows: readonly WindowSnapshot[]) => void>();
  private bounds: ViewportBounds;

  constructor(bounds: ViewportBounds) {
    this.bounds = validBounds(bounds);
  }

  subscribe(listener: (windows: readonly WindowSnapshot[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => { this.listeners.delete(listener); };
  }

  list(): readonly WindowSnapshot[] {
    return [...this.windows.values()].sort((a, b) => a.zOrder - b.zOrder).map((item) => Object.freeze({ ...item }));
  }

  get(id: string): WindowSnapshot | undefined {
    const item = this.windows.get(id);
    return item ? Object.freeze({ ...item }) : undefined;
  }

  open(options: WindowOptions): WindowSnapshot {
    if (!options.id.trim()) throw new Error('A janela precisa de um ID estável.');
    const existing = this.windows.get(options.id);
    if (existing && options.instance !== true) {
      this.focus(options.id);
      return this.get(options.id)!;
    }
    const id = existing ? `${options.id}:${nextInstanceId(this.windows, options.id)}` : options.id;
    const width = Math.max(280, Math.min(options.width ?? 420, this.bounds.width));
    const height = Math.max(220, Math.min(options.height ?? 320, this.bounds.height));
    const count = this.windows.size;
    const presentation = presentationFor(this.bounds);
    const window: MutableWindow = {
      id,
      title: options.title,
      x: options.x ?? Math.max(0, (this.bounds.width - width) / 2 + (count % 5) * GAP),
      y: options.y ?? Math.max(0, (this.bounds.height - height) / 2 + (count % 5) * GAP),
      width: presentation === 'panel' ? Math.max(width, Math.min(Math.round(this.bounds.width * 0.6), this.bounds.width - 32)) : width,
      height: presentation === 'panel' ? Math.max(height, Math.min(Math.round(this.bounds.height * 0.6), this.bounds.height - 32)) : height,
      zOrder: count + 1,
      presentation,
    };
    this.windows.set(id, window);
    this.clamp(window);
    this.emit();
    return this.get(id)!;
  }

  close(id: string): boolean {
    const removed = this.windows.delete(id);
    if (removed) { this.reorder(); this.emit(); }
    return removed;
  }

  focus(id: string): boolean {
    const item = this.windows.get(id);
    if (!item) return false;
    const ordered = [...this.windows.values()].filter((window) => window !== item).sort((a, b) => a.zOrder - b.zOrder);
    ordered.forEach((window, index) => { window.zOrder = index + 1; });
    item.zOrder = this.windows.size;
    this.emit();
    return true;
  }

  move(id: string, x: number, y: number): boolean {
    const item = this.windows.get(id);
    if (!item || item.presentation === 'sheet') return false;
    item.x = Number.isFinite(x) ? x : item.x;
    item.y = Number.isFinite(y) ? y : item.y;
    this.clamp(item);
    this.emit();
    return true;
  }

  resizeViewport(bounds: ViewportBounds): void {
    this.bounds = validBounds(bounds);
    for (const item of this.windows.values()) {
      item.presentation = presentationFor(this.bounds);
      if (item.presentation === 'panel') {
        item.width = Math.max(item.width, Math.min(Math.round(this.bounds.width * 0.6), this.bounds.width - 32));
        item.height = Math.max(item.height, Math.min(Math.round(this.bounds.height * 0.6), this.bounds.height - 32));
      }
      item.width = Math.min(item.width, this.bounds.width);
      item.height = Math.min(item.height, this.bounds.height);
      this.clamp(item);
    }
    this.emit();
  }

  private clamp(item: MutableWindow): void {
    const maxX = Math.max(0, this.bounds.width - Math.min(MIN_VISIBLE, item.width));
    const maxY = Math.max(0, this.bounds.height - Math.min(MIN_VISIBLE, item.height));
    item.x = Math.min(Math.max(0, item.x), maxX);
    item.y = Math.min(Math.max(0, item.y), maxY);
  }

  private reorder(): void {
    [...this.windows.values()].sort((a, b) => a.zOrder - b.zOrder).forEach((item, index) => { item.zOrder = index + 1; });
  }

  private emit(): void {
    const snapshot = this.list();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function presentationFor(bounds: ViewportBounds): WindowPresentation {
  if (bounds.width <= UI_BREAKPOINTS.mobile || bounds.height <= 420) return 'sheet';
  if (bounds.width <= UI_BREAKPOINTS.tablet) return 'panel';
  return 'floating';
}

function validBounds(bounds: ViewportBounds): ViewportBounds {
  return { width: Math.max(1, Math.floor(bounds.width)), height: Math.max(1, Math.floor(bounds.height)) };
}

function nextInstanceId(windows: Map<string, MutableWindow>, base: string): number {
  let suffix = 2;
  while (windows.has(`${base}:${suffix}`)) suffix++;
  return suffix;
}
