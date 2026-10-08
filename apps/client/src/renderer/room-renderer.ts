// Adaptador oficial do PixiJS 8 para ambientes sem unsafe-eval no CSP.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import type { RoomState } from '../room/room-state';
import { loadAvatarManifest, createAvatarAssetProvider, type AvatarAssetProvider } from './avatar-assets';
import { AvatarView } from './avatar-view';
import { DEFAULT_ISO_CONFIG, isoDepth, roomToScreen, tilePolygon, type IsoConfig } from './isometric';
import { buildRoomSurfaces, DEFAULT_ROOM_STYLE, fitRoomConfig, shadeColor, type RoomSurfaceStyle } from './room-surfaces';
import { reconcileEntityIds } from './renderer-model';
import { resolveRoomTileAtScreen, type RoomTileHit } from './tile-interaction';

const MAX_DPR = 2;
const MANIFEST_PATH = '/client/assets/avatar/v1/manifest/avatar-manifest-v1.json';
const ASSET_BASE_PATH = '/client/assets/avatar/v1/';

export interface RoomChatVisualMessage {
  readonly userId: string;
  readonly username: string;
  readonly text: string;
}

export type RoomTileSelect = (x: number, y: number) => void;

/** Pixi compositor for the room floor, entities and renderer diagnostics. */
export class RoomRenderer {
  private readonly floorLayer = new Graphics();
  private readonly floorHighlight = new Graphics();
  private readonly entityLayer = new Container();
  private readonly surfaceObjects: Graphics[] = [];
  private viewportWidth = 0;
  private viewportHeight = 0;
  private readonly debugLayer = new Graphics();
  private readonly worldRoot = new Container();
  private readonly avatars = new Map<string, AvatarView>();
  private readonly onCanvasPointer = (event: PointerEvent): void => this.handlePointer(event);
  private readonly onCanvasPointerMove = (event: PointerEvent): void => this.handlePointerMove(event);
  private readonly onCanvasPointerLeave = (event: PointerEvent): void => {
    // Touch emits pointerleave immediately after pointerup; keep its approved
    // 450 ms feedback until the timer, while mouse leave clears immediately.
    if (event.pointerType !== 'touch') this.clearTileHighlight();
  };
  private app: Application | null = null;
  private provider: AvatarAssetProvider | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private config: IsoConfig = DEFAULT_ISO_CONFIG;
  private currentRoom: RoomState | null = null;
  private pendingRoom: RoomState | null = null;
  private pendingChat: readonly RoomChatVisualMessage[] = [];
  private floorSignature = '';
  private chatSignature = '';
  private disposed = false;
  private hoveredTile: RoomTileHit | null = null;
  private pointerInside = false;
  private lastPointer = { x: 0, y: 0 };
  private touchHighlightTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly host: HTMLElement;
  private readonly status: HTMLElement;
  private readonly onTileSelect: RoomTileSelect;

  constructor(
    host: HTMLElement,
    status: HTMLElement,
    onTileSelect: RoomTileSelect,
    private readonly style: RoomSurfaceStyle = DEFAULT_ROOM_STYLE,
  ) {
    this.host = host;
    this.status = status;
    this.onTileSelect = onTileSelect;
  }

  async mount(): Promise<void> {
    if (this.app || this.disposed) return;
    this.status.textContent = 'Carregando renderer da sala…';
    const manifestUrl = new URL(MANIFEST_PATH, window.location.origin).toString();
    const assetBaseUrl = new URL(ASSET_BASE_PATH, window.location.origin).toString();
    const manifest = await loadAvatarManifest(manifestUrl);
    this.provider = createAvatarAssetProvider(manifest, assetBaseUrl);
    const app = new Application();
    await app.init({
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      resolution: Math.min(window.devicePixelRatio || 1, MAX_DPR),
      autoDensity: false,
      autoStart: true,
      sharedTicker: false,
      preference: 'webgl',
      powerPreference: 'low-power',
      antialias: false,
      background: '#14212b',
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    if (this.disposed) {
      app.destroy(true, { children: true });
      this.provider.dispose();
      return;
    }
    this.app = app;
    this.worldRoot.eventMode = 'none';
    this.floorLayer.label = 'floor-layer';
    this.floorHighlight.label = 'floor-highlight';
    this.entityLayer.label = 'entity-layer';
    this.entityLayer.sortableChildren = true;
    this.debugLayer.label = 'debug-layer';
    this.worldRoot.addChild(this.floorLayer, this.entityLayer, this.debugLayer);
    this.entityLayer.addChild(this.floorHighlight);
    app.stage.addChild(this.worldRoot);
    app.canvas.className = 'room-renderer-canvas';
    app.canvas.setAttribute('role', 'img');
    app.canvas.setAttribute('aria-label', 'Quarto isométrico do Habbux');
    app.canvas.addEventListener('pointerdown', this.onCanvasPointer, { passive: false });
    app.canvas.addEventListener('pointermove', this.onCanvasPointerMove, { passive: true });
    app.canvas.addEventListener('pointerleave', this.onCanvasPointerLeave, { passive: true });
    this.host.append(app.canvas);
    this.host.classList.add('room-viewport-ready');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    app.ticker.add((ticker) => this.update(ticker.deltaMS));
    this.resize();
    if (this.pendingRoom) this.applyRoom(this.pendingRoom);
    this.setChat(this.pendingChat);
    this.status.textContent = 'Renderer da sala pronto.';
  }

  setRoom(room: RoomState | null): void {
    this.pendingRoom = room;
    if (this.app) this.applyRoom(room);
  }

  setChat(messages: readonly RoomChatVisualMessage[]): void {
    this.pendingChat = messages;
    const latest = messages.at(-1);
    const signature = latest ? `${latest.userId}:${latest.text}:${messages.length}` : '';
    if (!latest || signature === this.chatSignature) return;
    this.chatSignature = signature;
    this.avatars.get(latest.userId)?.setBubble(latest.text);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app?.canvas.removeEventListener('pointerdown', this.onCanvasPointer);
    this.app?.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.app?.canvas.removeEventListener('pointerleave', this.onCanvasPointerLeave);
    this.clearTouchHighlightTimer();
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.provider?.dispose();
    this.provider = null;
    this.clearSurfaces();
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.host.classList.remove('room-viewport-ready');
  }

  setDiagnosticsClock(paused: boolean): void { if (paused) this.app?.stop(); else this.app?.start(); }

  stepDiagnostics(deltaMs: number): void { this.update(deltaMs); this.app?.render(); }

  diagnostics(): object {
    return { config: this.config, objects: countDisplayObjects(this.worldRoot), surfaces: this.surfaceObjects.length, hover: this.hoveredTile,
      renderOrder: this.entityLayer.children.map(child => ({ label: child.label, depth: child.zIndex })),
      avatars: [...this.avatars.values()].map(avatar => avatar.diagnostics()) };
  }

  private applyRoom(room: RoomState | null): void {
    this.currentRoom = room;
    if (!room || !this.provider) {
      this.floorLayer.clear();
      this.clearSurfaces();
      this.floorSignature = '';
      this.clearTileHighlight();
      this.debugLayer.clear();
      for (const avatar of this.avatars.values()) avatar.dispose();
      this.avatars.clear();
      return;
    }
    const signature = `${room.roomId}:${room.width}x${room.height}:${room.walkability.join('')}:${room.elevations.join(',')}`;
    if (signature !== this.floorSignature) {
      this.floorSignature = signature;
      this.clearTileHighlight();
      this.resize(true);
    }
    this.syncAvatars(room);
    this.drawDebug(room);
    if (this.pointerInside) this.updateTileHighlight(this.lastPointer.x, this.lastPointer.y);
  }

  private syncAvatars(room: RoomState): void {
    const activeIds = new Set<string>();
    for (const occupant of room.occupants) {
      activeIds.add(occupant.userId);
      let avatar = this.avatars.get(occupant.userId);
      if (!avatar) {
        avatar = new AvatarView(occupant, { provider: this.provider!, isoConfig: this.config });
        this.avatars.set(occupant.userId, avatar);
        this.entityLayer.addChild(avatar.container);
      } else {
        avatar.setIsoConfig(this.config);
        avatar.setPosition(occupant.x, occupant.y, occupant.z ?? room.elevations[occupant.y * room.width + occupant.x] ?? 0);
      }
    }
    const removedIds = reconcileEntityIds([...this.avatars.keys()], [...activeIds]).removed;
    for (const userId of removedIds) {
      const avatar = this.avatars.get(userId);
      avatar?.dispose();
      this.avatars.delete(userId);
    }
    this.entityLayer.sortChildren();
  }

  private clearSurfaces(): void {
    for (const surface of this.surfaceObjects) {
      surface.removeFromParent();
      surface.destroy();
    }
    this.surfaceObjects.length = 0;
  }

  private drawFloor(room: RoomState): void {
    this.floorLayer.clear();
    this.clearSurfaces();
    const surfaces = buildRoomSurfaces(room, this.config, this.style);
    const colorLine = shadeColor(this.style.floorColor, 0.60);
    for (const floor of surfaces.floors) {
      const g = floor.elevation > 0 ? new Graphics() : this.floorLayer;
      if (g !== this.floorLayer) {
        g.label = `floor:${floor.x},${floor.y}`;
        g.zIndex = floor.depth;
        this.entityLayer.addChild(g);
        this.surfaceObjects.push(g);
      }
      for (const side of floor.sides) g.poly(side.polygon.flatMap(p => [p.x, p.y])).fill(side.color);
      const top = floor.top.polygon;
      g.poly(top.flatMap(p => [p.x, p.y])).fill(floor.top.color);
      // Shared plank joints are quiet; exterior relief comes from the slab.
      g.moveTo(top[0]!.x, top[0]!.y).lineTo(top[1]!.x, top[1]!.y)
        .stroke({ color: colorLine, width: Math.max(0.5, this.config.scale), alpha: 0.22 });
      if (this.style.floorMaterial === 'stone' || floor.x % 2 === floor.y % 2) {
        g.moveTo(top[0]!.x, top[0]!.y).lineTo(top[3]!.x, top[3]!.y)
          .stroke({ color: colorLine, width: Math.max(0.5, this.config.scale), alpha: 0.14 });
      }
    }
    for (const wall of surfaces.walls) {
      const g = new Graphics();
      g.label = `wall:${wall.side}:${wall.x},${wall.y}`;
      g.zIndex = wall.depth;
      for (const face of [wall.end, wall.front, wall.cap]) {
        if (face) g.poly(face.polygon.flatMap(p => [p.x, p.y])).fill(face.color);
      }
      const [a, b] = wall.base;
      const trimHeight = this.style.floorThickness * this.config.elevationHeight * this.config.scale;
      g.poly([a!.x, a!.y, b!.x, b!.y, b!.x, b!.y - trimHeight, a!.x, a!.y - trimHeight])
        .fill(shadeColor(this.style.wallColor, 0.66));
      g.moveTo(a!.x, a!.y - trimHeight).lineTo(b!.x, b!.y - trimHeight)
        .stroke({ color: shadeColor(this.style.wallColor, 1.15), width: Math.max(0.5, this.config.scale), alpha: 0.65 });
      if (this.style.wallMaterial === 'panel') {
        const p = wall.front.polygon;
        g.moveTo(p[0]!.x, p[0]!.y).lineTo(p[3]!.x, p[3]!.y)
          .stroke({ color: shadeColor(this.style.wallColor, 0.7), width: this.config.scale, alpha: 0.25 });
      }
      this.entityLayer.addChild(g);
      this.surfaceObjects.push(g);
    }
    this.entityLayer.sortChildren();
  }

  private drawDebug(_room: RoomState): void {
    this.debugLayer.clear();

  }

  private update(deltaMs: number): void {
    for (const avatar of this.avatars.values()) avatar.update(deltaMs);
  }

  private resize(force = false): void {
    const app = this.app;
    if (!app) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    if (!force && width === this.viewportWidth && height === this.viewportHeight) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    app.renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, MAX_DPR));
    if (!this.currentRoom) return;
    const room = this.currentRoom;
    const nextConfig = fitRoomConfig(room, width, height, this.style);
    const changed = !sameIsoConfig(this.config, nextConfig);
    this.config = nextConfig;
    if (changed || force) {
      this.drawFloor(room);
      this.drawDebug(room);
      for (const avatar of this.avatars.values()) avatar.setIsoConfig(this.config);
    }
    this.worldRoot.hitArea = new Rectangle(0, 0, width, height);
    if (this.pointerInside) this.updateTileHighlight(this.lastPointer.x, this.lastPointer.y);
  }

  private handlePointer(event: PointerEvent): void {
    if (!this.currentRoom || event.button !== 0) return;
    const point = this.pointerPoint(event);
    this.pointerInside = true;
    this.lastPointer = point;
    const hit = this.updateTileHighlight(point.x, point.y);
    if (event.pointerType === 'touch') {
      this.clearTouchHighlightTimer();
      this.touchHighlightTimer = setTimeout(() => {
        this.touchHighlightTimer = null;
        this.clearTileHighlight();
      }, 450);
    }
    if (!hit?.walkable) return;
    event.preventDefault();
    this.onTileSelect(hit.x, hit.y);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.currentRoom || event.pointerType === 'touch') return;
    const point = this.pointerPoint(event);
    this.pointerInside = true;
    this.lastPointer = point;
    this.updateTileHighlight(point.x, point.y);
  }

  private pointerPoint(event: PointerEvent): { readonly x: number; readonly y: number } {
    const rect = this.host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private updateTileHighlight(screenX: number, screenY: number): RoomTileHit | null {
    const room = this.currentRoom;
    if (!room) return null;
    const hit = resolveRoomTileAtScreen(screenX, screenY, room, this.config);
    if (hit?.x === this.hoveredTile?.x && hit?.y === this.hoveredTile?.y
        && hit?.walkable === this.hoveredTile?.walkable && hit?.elevation === this.hoveredTile?.elevation) return hit;
    this.hoveredTile = hit;
    this.floorHighlight.clear();
    if (!hit) return null;
    const center = roomToScreen(hit.x, hit.y, hit.elevation, this.config);
    const polygon = tilePolygon(center, this.config).flatMap((point) => [point.x, point.y]);
    this.floorHighlight.poly(polygon)
      .fill({ color: hit.walkable ? 0xb9ecff : 0xff8d9b, alpha: hit.walkable ? 0.22 : 0.18 })
      .stroke({ color: hit.walkable ? 0xd9f7ff : 0xffb2bb, width: Math.max(1, this.config.scale), alpha: 0.82 });
    this.floorHighlight.zIndex = isoDepth(hit.x, hit.y) - 0.125;
    this.entityLayer.sortChildren();
    return hit;
  }

  private clearTileHighlight(): void {
    this.pointerInside = false;
    this.hoveredTile = null;
    this.floorHighlight.clear();
  }

  private clearTouchHighlightTimer(): void {
    if (this.touchHighlightTimer === null) return;
    clearTimeout(this.touchHighlightTimer);
    this.touchHighlightTimer = null;
  }
}

function sameIsoConfig(left: IsoConfig, right: IsoConfig): boolean {
  return left.scale === right.scale && left.origin.x === right.origin.x && left.origin.y === right.origin.y;
}

function countDisplayObjects(container: Container): number {
  return 1 + container.children.reduce((sum, child) => sum + countDisplayObjects(child), 0);
}
