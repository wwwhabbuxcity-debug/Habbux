// Adaptador oficial do PixiJS 8 para ambientes sem unsafe-eval no CSP.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import type { RoomState } from '../room/room-state';
import { loadAvatarManifest, createAvatarAssetProvider, type AvatarAssetProvider } from './avatar-assets';
import { AvatarView } from './avatar-view';
import { floorSidePolygon, roomToScreen, screenToRoom, tilePolygon, type IsoConfig, type IsoFloorSide } from './isometric';
import { reconcileEntityIds } from './renderer-model';

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
  private readonly entityLayer = new Graphics();
  private readonly debugLayer = new Graphics();
  private readonly worldRoot = new Container();
  private readonly avatars = new Map<string, AvatarView>();
  private readonly onCanvasPointer = (event: PointerEvent): void => this.handlePointer(event);
  private app: Application | null = null;
  private provider: AvatarAssetProvider | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private config: IsoConfig = { tileWidth: 64, tileHeight: 32, elevationHeight: 16, scale: 1, origin: { x: 0, y: 0 } };
  private currentRoom: RoomState | null = null;
  private pendingRoom: RoomState | null = null;
  private pendingChat: readonly RoomChatVisualMessage[] = [];
  private floorSignature = '';
  private chatSignature = '';
  private disposed = false;
  private readonly host: HTMLElement;
  private readonly status: HTMLElement;
  private readonly onTileSelect: RoomTileSelect;

  constructor(
    host: HTMLElement,
    status: HTMLElement,
    onTileSelect: RoomTileSelect,
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
    this.entityLayer.label = 'entity-layer';
    this.entityLayer.sortableChildren = true;
    this.debugLayer.label = 'debug-layer';
    this.worldRoot.addChild(this.floorLayer, this.entityLayer, this.debugLayer);
    app.stage.addChild(this.worldRoot);
    app.canvas.className = 'room-renderer-canvas';
    app.canvas.setAttribute('role', 'img');
    app.canvas.setAttribute('aria-label', 'Quarto isométrico do Habbux');
    app.canvas.addEventListener('pointerdown', this.onCanvasPointer, { passive: false });
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
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.provider?.dispose();
    this.provider = null;
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.host.classList.remove('room-viewport-ready');
  }

  private applyRoom(room: RoomState | null): void {
    this.currentRoom = room;
    if (!room || !this.provider) {
      this.floorLayer.clear();
      this.debugLayer.clear();
      for (const avatar of this.avatars.values()) avatar.dispose();
      this.avatars.clear();
      return;
    }
    this.resize();
    const signature = `${room.width}x${room.height}:${room.walkability.join('')}:${room.elevations.join(',')}`;
    if (signature !== this.floorSignature) {
      this.floorSignature = signature;
      this.drawFloor(room);
    }
    this.syncAvatars(room);
    this.drawDebug(room);
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

  private drawFloor(room: RoomState): void {
    this.floorLayer.clear();
    const cells = Array.from({ length: room.width * room.height }, (_, index) => ({
      x: index % room.width,
      y: Math.floor(index / room.width),
    })).sort((left, right) => left.x + left.y - right.x - right.y);
    for (const { x, y } of cells) {
        const elevation = room.elevations[y * room.width + x] ?? 0;
        const center = roomToScreen(x, y, elevation, this.config);
        const top = tilePolygon(center, this.config);
        const walkable = room.walkability[y * room.width + x] === true;
        const topPolygon = top.flatMap((point) => [point.x, point.y]);
        const topColor = !walkable
          ? 0x172b35
          : elevation === 0
            ? ((x + y) % 2 === 0 ? 0x3d6974 : 0x416f7a)
            : elevation < 3 ? 0x4c7480 : 0x668476;
        for (const side of ['x', 'y'] as const) {
          const neighbor = this.neighborElevation(room, x, y, side);
          if (neighbor !== null && neighbor >= elevation) continue;
          const depth = neighbor === null
            ? 8 * this.config.scale
            : Math.max(4 * this.config.scale, (elevation - neighbor) * this.config.elevationHeight * this.config.scale);
          const sidePolygon = floorSidePolygon(top, side, depth).flatMap((point) => [point.x, point.y]);
          this.floorLayer.poly(sidePolygon).fill({
            color: side === 'x' ? 0x203d48 : 0x294954,
            alpha: walkable ? 0.96 : 0.82,
          });
          this.floorLayer.poly(sidePolygon).stroke({ color: 0x162a34, width: 1, alpha: 0.7 });
        }
        this.floorLayer.poly(topPolygon).fill({ color: topColor, alpha: walkable ? 0.96 : 0.82 });
        this.floorLayer.poly(topPolygon).stroke({ color: walkable ? 0x77a6a2 : 0x38515a, width: 1, alpha: 0.78 });
    }
  }

  private neighborElevation(room: RoomState, x: number, y: number, side: IsoFloorSide): number | null {
    const nextX = side === 'x' ? x + 1 : x;
    const nextY = side === 'y' ? y + 1 : y;
    if (nextX < 0 || nextX >= room.width || nextY < 0 || nextY >= room.height) return null;
    return room.elevations[nextY * room.width + nextX] ?? 0;
  }

  private drawDebug(room: RoomState): void {
    this.debugLayer.clear();
    const first = roomToScreen(0, 0, 0, this.config);
    const last = roomToScreen(room.width - 1, room.height - 1, 0, this.config);
    this.debugLayer.moveTo(first.x, first.y).lineTo(last.x, last.y).stroke({ color: 0x69dcc1, width: 1, alpha: 0.22 });
  }

  private update(deltaMs: number): void {
    for (const avatar of this.avatars.values()) avatar.update(deltaMs);
  }

  private resize(): void {
    const app = this.app;
    if (!app) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    app.renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, MAX_DPR));
    if (!this.currentRoom) return;
    const room = this.currentRoom;
    const rawCorners = [
      roomToScreen(0, 0, room.elevations[0] ?? 0),
      roomToScreen(room.width - 1, 0, room.elevations[room.width - 1] ?? 0),
      roomToScreen(0, room.height - 1, room.elevations[(room.height - 1) * room.width] ?? 0),
      roomToScreen(room.width - 1, room.height - 1, room.elevations.at(-1) ?? 0),
    ];
    const minX = Math.min(...rawCorners.map((point) => point.x));
    const maxX = Math.max(...rawCorners.map((point) => point.x));
    const maxElevation = Math.max(0, ...room.elevations);
    const minY = Math.min(...rawCorners.map((point) => point.y)) - 96 - maxElevation * 16;
    const maxY = Math.max(...rawCorners.map((point) => point.y));
    const scale = Math.max(0.55, Math.min(1.2, Math.min(width / Math.max(1, maxX - minX + 120), height / Math.max(1, maxY - minY + 80))));
    const scaledWidth = (maxX - minX) * scale;
    const scaledHeight = (maxY - minY) * scale;
    const nextConfig: IsoConfig = {
      tileWidth: 64,
      tileHeight: 32,
      elevationHeight: 16,
      scale,
      origin: { x: width / 2 - scaledWidth / 2 - minX * scale, y: height / 2 - scaledHeight / 2 - minY * scale },
    };
    const changed = !sameIsoConfig(this.config, nextConfig);
    this.config = nextConfig;
    if (changed) {
      this.drawFloor(room);
      this.drawDebug(room);
      for (const avatar of this.avatars.values()) avatar.setIsoConfig(this.config);
    }
    this.worldRoot.hitArea = new Rectangle(0, 0, width, height);
  }

  private handlePointer(event: PointerEvent): void {
    if (!this.currentRoom || event.button !== 0) return;
    const rect = this.host.getBoundingClientRect();
    const point = screenToRoom(event.clientX - rect.left, event.clientY - rect.top, this.config);
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (x < 0 || x >= this.currentRoom.width || y < 0 || y >= this.currentRoom.height) return;
    if (!this.currentRoom.walkability[y * this.currentRoom.width + x]) return;
    event.preventDefault();
    this.onTileSelect(x, y);
  }
}

function sameIsoConfig(left: IsoConfig, right: IsoConfig): boolean {
  return left.scale === right.scale && left.origin.x === right.origin.x && left.origin.y === right.origin.y;
}
