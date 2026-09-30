import { IconButton, Surface } from './primitives';
import { WindowManager, type WindowSnapshot } from './window-manager';

export class WindowView {
  private readonly nodes = new Map<string, HTMLDivElement>();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    private readonly manager: WindowManager,
    private readonly host: HTMLElement,
    private readonly onCreate?: (window: WindowSnapshot, body: HTMLElement) => void,
  ) {
    this.host.classList.add('hbx-window-layer');
    this.unsubscribe = manager.subscribe((windows) => this.render(windows));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.nodes.clear();
    this.host.replaceChildren();
  }

  private render(windows: readonly WindowSnapshot[]): void {
    const ids = new Set(windows.map((item) => item.id));
    for (const [id, node] of this.nodes) {
      if (!ids.has(id)) { node.remove(); this.nodes.delete(id); }
    }
    for (const item of windows) {
      let node = this.nodes.get(item.id);
      if (!node) {
        node = this.createWindow(item);
        this.nodes.set(item.id, node);
        this.host.append(node);
        node.focus({ preventScroll: true });
      }
      node.dataset.presentation = item.presentation;
      node.style.width = `${item.width}px`;
      node.style.height = `${item.height}px`;
      node.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
      node.style.zIndex = String(item.zOrder);
    }
  }

  private createWindow(item: WindowSnapshot): HTMLDivElement {
    const node = Surface('hbx-window');
    node.id = `hbx-window-${safeId(item.id)}`;
    node.dataset.windowId = item.id;
    node.setAttribute('role', 'region');
    node.setAttribute('aria-labelledby', `${node.id}-title`);
    node.tabIndex = -1;
    const header = document.createElement('header');
    header.className = 'hbx-window__header';
    header.tabIndex = 0;
    header.addEventListener('keydown', (event) => {
      if (!event.altKey || !event.key.startsWith('Arrow')) return;
      event.preventDefault();
      const current = this.manager.get(item.id);
      if (!current) return;
      const delta = event.shiftKey ? 24 : 8;
      this.manager.move(item.id, current.x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0), current.y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0));
    });
    header.addEventListener('pointerdown', (event) => this.beginDrag(event, item.id, node));
    const title = document.createElement('h2');
    title.className = 'hbx-window__title';
    title.id = `${node.id}-title`;
    title.textContent = item.title;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = IconButton('Fechar janela', 'close', () => {
      this.manager.close(item.id);
      if (returnFocus?.isConnected) returnFocus.focus();
    });
    header.append(title, close);
    const body = document.createElement('div');
    body.className = 'hbx-window__body hbx-scroll-area';
    const text = document.createElement('p');
    text.className = 'hbx-muted';
    text.textContent = 'Janela de demonstração do Habbux UI Core.';
    body.append(text);
    this.onCreate?.(item, body);
    node.append(header, body);
    node.addEventListener('pointerdown', () => this.manager.focus(item.id));
    return node;
  }

  private beginDrag(event: PointerEvent, id: string, node: HTMLElement): void {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
    const start = this.manager.get(id);
    if (!start || start.presentation === 'sheet') return;
    event.preventDefault();
    node.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    let latestX = start.x;
    let latestY = start.y;
    let frame: number | undefined;
    const move = (next: PointerEvent): void => {
      latestX = start.x + next.clientX - originX;
      latestY = start.y + next.clientY - originY;
      if (frame === undefined) frame = requestAnimationFrame(() => {
        frame = undefined;
        this.manager.move(id, latestX, latestY);
      });
    };
    const end = (): void => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      if (frame !== undefined) cancelAnimationFrame(frame);
      this.manager.move(id, latestX, latestY);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end, { once: true });
    node.addEventListener('pointercancel', end, { once: true });
  }
}

function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/gu, '-'); }
