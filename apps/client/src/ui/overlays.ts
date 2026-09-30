export interface OverlayLayers {
  readonly root: HTMLDivElement;
  readonly windows: HTMLDivElement;
  readonly popovers: HTMLDivElement;
  readonly notifications: HTMLDivElement;
  dispose(): void;
}

export function createOverlayLayers(parent: HTMLElement): OverlayLayers {
  const root = document.createElement('div');
  root.className = 'hbx-overlay-root';
  root.setAttribute('aria-label', 'Interface do jogo');
  const windows = layer('hbx-layer-windows');
  const popovers = layer('hbx-layer-popovers');
  const notifications = layer('hbx-layer-notifications');
  root.append(windows, popovers, notifications);
  parent.append(root);
  return {
    root, windows, popovers, notifications,
    dispose: () => root.remove(),
  };
}

export function Modal(title: string, content: HTMLElement, onClose?: () => void): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'hbx-modal';
  const heading = document.createElement('header');
  heading.className = 'hbx-window__header';
  const titleNode = document.createElement('h2');
  titleNode.className = 'hbx-window__title';
  titleNode.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'hbx-button hbx-button--quiet';
  close.textContent = 'Fechar';
  close.addEventListener('click', () => dialog.close());
  heading.append(titleNode, close);
  const body = document.createElement('div');
  body.className = 'hbx-modal__body hbx-scroll-area';
  body.append(content);
  dialog.append(heading, body);
  if (onClose) dialog.addEventListener('close', onClose, { once: true });
  return dialog;
}

export function openModal(layerHost: HTMLElement, dialog: HTMLDialogElement): () => void {
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!dialog.isConnected) layerHost.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    previouslyFocused?.focus();
  }, { once: true });
  dialog.showModal();
  dialog.querySelector<HTMLElement>('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
  return () => { if (dialog.open) dialog.close(); };
}

export function Popover(layerHost: HTMLElement, anchor: HTMLElement, content: HTMLElement): () => void {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
  const popover = document.createElement('div');
  popover.className = 'hbx-popover hbx-surface';
  popover.setAttribute('role', 'group');
  popover.tabIndex = -1;
  popover.append(content);
  layerHost.append(popover);
  const anchorRect = anchor.getBoundingClientRect();
  const parentRect = layerHost.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchorRect.left - parentRect.left, parentRect.width - 280));
  const top = Math.max(8, Math.min(anchorRect.bottom - parentRect.top + 8, parentRect.height - popover.offsetHeight - 8));
  popover.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  popover.focus({ preventScroll: true });
  return () => { popover.remove(); if (returnFocus?.isConnected) returnFocus.focus(); };
}

export function ContextMenu(layerHost: HTMLElement, x: number, y: number, labels: readonly string[], onSelect: (index: number) => void): () => void {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const menu = document.createElement('div');
  menu.className = 'hbx-context-menu hbx-surface';
  menu.setAttribute('role', 'menu');
  for (const [index, label] of labels.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hbx-context-menu__item';
    button.textContent = label;
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => { onSelect(index); dispose(); });
    menu.append(button);
  }
  layerHost.append(menu);
  menu.querySelector<HTMLButtonElement>('button')?.focus();
  const rect = layerHost.getBoundingClientRect();
  menu.style.transform = `translate3d(${Math.max(8, Math.min(x - rect.left, rect.width - 200))}px, ${Math.max(8, Math.min(y - rect.top, rect.height - menu.offsetHeight - 8))}px, 0)`;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dispose();
  };
  menu.addEventListener('keydown', onKeyDown);
  function dispose(): void {
    menu.removeEventListener('keydown', onKeyDown);
    menu.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  return dispose;
}

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly expiresAt: number;
}

export class NotificationQueue {
  private messages: ToastMessage[] = [];
  private nextId = 1;
  private readonly limit: number;

  constructor(limit = 5) {
    this.limit = Number.isSafeInteger(limit) && limit > 0 ? limit : 5;
  }

  push(text: string, lifetimeMs = 4000, now = Date.now()): ToastMessage | null {
    if (!text.trim()) return null;
    const message = Object.freeze({ id: this.nextId++, text, expiresAt: now + Math.max(500, lifetimeMs) });
    this.messages = [...this.messages, message].slice(-Math.max(1, this.limit));
    return message;
  }

  list(now = Date.now()): readonly ToastMessage[] {
    this.messages = this.messages.filter((message) => message.expiresAt > now);
    return this.messages;
  }

  clear(): void { this.messages = []; }
}

/** Bounded notification queue with one scheduled timer for the entire queue. */
export class ToastQueue {
  private readonly queue: NotificationQueue;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private readonly host: HTMLElement;
  private readonly now: () => number;

  constructor(host: HTMLElement, limit = 5, now = Date.now) {
    this.host = host;
    this.now = now;
    this.queue = new NotificationQueue(limit);
    this.host.classList.add('hbx-toast-stack');
    this.host.setAttribute('aria-live', 'polite');
  }

  push(text: string, lifetimeMs = 4000): void {
    if (this.disposed || !text.trim()) return;
    this.queue.push(text, lifetimeMs, this.now());
    this.render();
    this.schedule();
  }

  list(): readonly ToastMessage[] { return this.queue.list(this.now()); }

  clear(): void {
    this.queue.clear();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.render();
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
    this.host.replaceChildren();
  }

  private render(): void {
    this.host.replaceChildren(...this.queue.list(this.now()).map((message) => {
      const node = document.createElement('div');
      node.className = 'hbx-toast hbx-surface';
      node.setAttribute('role', 'status');
      node.textContent = message.text;
      return node;
    }));
  }

  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    const earliest = this.queue.list(this.now()).reduce((time, message) => Math.min(time, message.expiresAt), Infinity);
    if (Number.isFinite(earliest)) this.timer = setTimeout(() => {
      this.timer = undefined;
      this.queue.list(this.now());
      this.render();
      this.schedule();
    }, Math.max(0, earliest - this.now()));
  }
}

function layer(name: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `hbx-overlay-layer ${name}`;
  return element;
}
