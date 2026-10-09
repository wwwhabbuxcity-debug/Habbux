// Adaptador oficial do PixiJS 8 para ambientes sem unsafe-eval no CSP.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { RoomState } from '../room/room-state';
import { loadAvatarManifest, createAvatarAssetProvider, type AvatarAssetProvider } from './avatar-assets';
import { AvatarView } from './avatar-view';
import { DEFAULT_ISO_CONFIG, isoDepth, roomToScreen, tilePolygon, type IsoConfig } from './isometric';
import { buildRoomSurfaces, DEFAULT_ROOM_STYLE, fitRoomConfig, shadeColor, resolveRoomSurfaceStyle, materialsForStyle, type RoomSurfaceStyle } from './room-surfaces';
import { resolveConvertedMaterialsForModel } from './gallaxys-material-presets';
import { validateRoomMaterials, type RoomMaterialConfiguration } from './room-materials';
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
  private surfaceCount = 0;
  private surfaceBuilds = 0;
  private geometryBuildMs = 0;
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
  private readonly initialStyle: RoomSurfaceStyle;
  private materialModelId: string | null = null;
  private floorSignature = '';
  private chatSignature = '';
  private disposed = false;
  private footDebug = false;
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
    private style: RoomSurfaceStyle = DEFAULT_ROOM_STYLE,
  ) {
    this.style = resolveRoomSurfaceStyle(style);
    this.initialStyle = this.style;
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

  setMaterials(materials: RoomMaterialConfiguration): void {
    this.setStyle({ ...this.style, materials: validateRoomMaterials(materials) });
  }

  setStyle(style: RoomSurfaceStyle): void {
    this.style = resolveRoomSurfaceStyle(style);
    if (this.currentRoom && this.app) this.resize(true);
  }

  setDiagnosticsClock(paused: boolean): void { if (paused) this.app?.stop(); else this.app?.start(); }

  stepDiagnostics(deltaMs: number): void { this.update(deltaMs); if (this.footDebug) this.drawDebug(this.currentRoom); this.app?.render(); }

  setFootDiagnostics(enabled: boolean): void { this.footDebug = enabled; this.drawDebug(this.currentRoom); }

  setDiagnosticsDirection(direction: number): void {
    for (const avatar of this.avatars.values()) avatar.setDiagnosticsDirection(direction);
  }

  diagnostics(): object {
    return { surfaceInstructions: countSurfaceInstructions([this.floorLayer, ...this.surfaceObjects]), materials: materialsForStyle(this.style), geometryBuildMs: this.geometryBuildMs, ...countRenderResources(this.worldRoot), config: this.config, objects: countDisplayObjects(this.worldRoot), surfaces: this.surfaceCount, surfaceBuilds: this.surfaceBuilds, hover: this.hoveredTile,
      renderOrder: this.entityLayer.children.map(child => ({ label: child.label, depth: child.zIndex })),
      avatars: [...this.avatars.values()].map(avatar => avatar.diagnostics()) };
  }

  private applyRoom(room: RoomState | null): void {
    this.currentRoom = room;
    if (!room || !this.provider) {
      this.floorLayer.cacheAsTexture(false);
      this.floorLayer.clear();
      this.clearSurfaces();
      this.floorSignature = '';
      this.clearTileHighlight();
      this.debugLayer.clear();
      for (const avatar of this.avatars.values()) avatar.dispose();
      this.avatars.clear();
      return;
    }
    if (room.modelId !== this.materialModelId) {
      const materials = resolveConvertedMaterialsForModel(room.modelId, materialsForStyle(this.initialStyle));
      this.style = materials ? resolveRoomSurfaceStyle({ ...this.initialStyle, materials }) : this.initialStyle;
      this.materialModelId = room.modelId;
    }
    const signature = `${room.modelId}:${room.roomId}:${room.width}x${room.height}:${room.walkability.join('')}:${room.elevations.join(',')}`;
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
        if (!occupant.movement) avatar.setPosition(occupant.x, occupant.y, occupant.z ?? room.elevations[occupant.y * room.width + occupant.x] ?? 0);
      }
      if (occupant.movement) avatar.setMovement(occupant.movement);
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
    this.surfaceCount = 0;
  }

  private drawFloor(room: RoomState): void {
    this.floorLayer.cacheAsTexture(false);
    this.floorLayer.clear();
    this.clearSurfaces();
    const buildStart = performance.now();
    const materials = materialsForStyle(this.style);
    const surfaces = buildRoomSurfaces(room, this.config, this.style);
    this.surfaceBuilds++;
    this.surfaceCount = surfaces.walls.length + surfaces.floors.filter(f => f.elevation > 0).length;
    const colorLine = this.style.materials ? materials.floor.secondaryColor : shadeColor(this.style.floorColor, 0.60);
    for (const floor of surfaces.floors) {
      const g = floor.elevation > 0 ? new Graphics() : this.floorLayer;
      if (g !== this.floorLayer) {
        g.label = `floor:${floor.x},${floor.y}`;
        g.zIndex = floor.depth;
        this.entityLayer.addChild(g);
        this.surfaceObjects.push(g);
      }
      for (const side of floor.sides) {
        g.poly(side.polygon.flatMap(p => [p.x, p.y])).fill(this.style.materials ? { color: side.color, alpha: materials.floor.opacity } : side.color);
        if (materials.floor.finish === 'plain') continue;
        const [a,b] = side.polygon;
        g.moveTo(a!.x,a!.y).lineTo(b!.x,b!.y).stroke({color:shadeColor(this.style.floorColor,1.12),width:this.config.scale,alpha: 0.4 * materials.floor.opacity});
      }
      const top = floor.top.polygon;
      g.poly(top.flatMap(p => [p.x, p.y])).fill(this.style.materials ? { color: floor.top.color, alpha: materials.floor.opacity } : floor.top.color);
      // World-aligned material: four-cell staggered boards, or large stone slabs.
      // No outline around each interaction tile. Geometry is built on resize only.
      const wood = materials.floor.texture?.kind === 'boards';
      const pattern = !!materials.floor.texture;
      const repeat = materials.floor.repeatScale;
      const boundary = (coordinate: number, period: number): boolean => Math.floor(coordinate / period) !== Math.floor((coordinate - 1) / period);
      if (pattern && boundary(floor.y, (wood ? 1 : 2) * repeat)) g.moveTo(top[0]!.x, top[0]!.y).lineTo(top[1]!.x, top[1]!.y)
        .stroke({ color: colorLine, width: this.config.scale, alpha: 0.10 * materials.floor.opacity });
      if (pattern && boundary(floor.x + (wood ? (Math.floor(floor.y / repeat) % 2) * 2 * repeat : 0), (wood ? 4 : 2) * repeat)) {
        g.moveTo(top[0]!.x, top[0]!.y).lineTo(top[3]!.x, top[3]!.y)
          .stroke({ color: colorLine, width: this.config.scale, alpha: 0.09 * materials.floor.opacity });
      }
      if (wood && this.config.scale >= 0.5 && (floor.x + floor.y) % 4 === 0) {
        for (const fraction of [0.28,0.72]) {
          const a = roomToScreen(floor.x-0.35,floor.y-0.5+fraction,floor.elevation,this.config);
          const b = roomToScreen(floor.x+0.35,floor.y-0.5+fraction,floor.elevation,this.config);
          g.moveTo(a.x,a.y).lineTo(b.x,b.y);
        }
        g.stroke({color:colorLine,width:this.config.scale*0.5,alpha: 0.035 * materials.floor.opacity});
      }
      // Contact shadows follow real wall boundaries, including recesses. All
      // strips stay inside this tile; hit geometry and floor elevation are shared.
      if (this.style.walls) for (const side of ['x','y'] as const) {
        const nx = floor.x - (side === 'x' ? 1 : 0), ny = floor.y - (side === 'y' ? 1 : 0);
        if (nx >= 0 && ny >= 0 && room.elevations[ny * room.width + nx]! >= 0) continue;
        const a = top[0]!, b = top[side === 'x' ? 3 : 1]!;
        const inward = roomToScreen(floor.x + (side === 'x' ? 0.10 : 0), floor.y + (side === 'y' ? 0.10 : 0), floor.elevation, this.config);
        const center = roomToScreen(floor.x, floor.y, floor.elevation, this.config);
        const dx = inward.x - center.x, dy = inward.y - center.y;
        g.poly([a.x,a.y,b.x,b.y,b.x+dx,b.y+dy,a.x+dx,a.y+dy]).fill({color:0x27343c,alpha: 0.12 * materials.floor.opacity});
      }
    }
    for (const wall of surfaces.walls) {
      // Outer back planes cannot occlude a position inside the room. Batch them
      // with the flat floor; recessed walls retain individual depth sorting.
      const exterior = wall.side === 'x' ? wall.x === 0 : wall.y === 0;
      const g = exterior ? this.floorLayer : new Graphics();
      if (!exterior) {
        g.label = `wall:${wall.side}:${wall.x},${wall.y}`;
        g.zIndex = wall.depth;
      }
      for (const face of [wall.startEnd, wall.end, wall.front, wall.cap]) {
        if (face) g.poly(face.polygon.flatMap(p => [p.x, p.y])).fill(this.style.materials ? { color: face.color, alpha: materials.wall.opacity } : face.color);
      }
      const [a, b] = wall.base;
      const [, , topB, topA] = wall.front.polygon;
      // Gentle common-height plaster shading, continuous across panel joins.
      const lowerA = {x:a!.x,y:a!.y+(topA!.y-a!.y)*0.28};
      const lowerB = {x:b!.x,y:b!.y+(topB!.y-b!.y)*0.28};
      g.poly([a!.x,a!.y,b!.x,b!.y,lowerB.x,lowerB.y,lowerA.x,lowerA.y])
        .fill({color:shadeColor(wall.front.color,0.65),alpha: 0.09 * materials.wall.opacity});
      if (materials.wall.finish === 'trimmed') {
        const trimHeight = this.style.floorThickness * this.config.elevationHeight * this.config.scale;
        g.poly([a!.x, a!.y, b!.x, b!.y, b!.x, b!.y - trimHeight, a!.x, a!.y - trimHeight])
          .fill(this.style.materials ? { color: shadeColor(this.style.wallColor, materials.wall.lighting.edge), alpha: materials.wall.opacity } : shadeColor(this.style.wallColor, 0.66));
        g.moveTo(a!.x, a!.y - trimHeight).lineTo(b!.x, b!.y - trimHeight)
          .stroke({ color: shadeColor(this.style.wallColor, 1.15), width: Math.max(0.5, this.config.scale), alpha: 0.65 * materials.wall.opacity });
        // Continuous cornice and restrained plaster grain from original vector
        // geometry; no Gallaxys textures or runtime dependency.
        g.poly([topA!.x,topA!.y,topB!.x,topB!.y,topB!.x,topB!.y+trimHeight/2,topA!.x,topA!.y+trimHeight/2])
          .fill({color:shadeColor(wall.front.color,0.72),alpha: 0.18 * materials.wall.opacity});
        g.moveTo(topA!.x,topA!.y).lineTo(topB!.x,topB!.y)
          .stroke({color:shadeColor(wall.front.color,1.2),width:this.config.scale,alpha: 0.5 * materials.wall.opacity});
      }
      if (materials.wall.texture?.kind === 'grain' && this.config.scale >= 0.5) {
        const seed = wall.x * 31 + wall.y * 17 + (wall.side === 'x' ? 11 : 0);
        for (let i=0;i<3;i++) {
          const along = 0.12+((seed+i*13)%29)/38;
          const height = 0.12+((seed+i*7)%23)/31;
          const x = a!.x+(b!.x-a!.x)*along;
          const y = a!.y+(b!.y-a!.y)*along+(topA!.y-a!.y)*height;
          g.moveTo(x,y).lineTo(x+2*this.config.scale,y);
        }
        g.stroke({color:this.style.materials ? materials.wall.secondaryColor : shadeColor(wall.front.color,0.7),width:this.config.scale,alpha: 0.06 * materials.wall.opacity});
      }
      if (materials.wall.texture?.kind === 'panels' && Math.floor((wall.side === 'x' ? wall.y : wall.x) / materials.wall.repeatScale) !== Math.floor(((wall.side === 'x' ? wall.y : wall.x) - 1) / materials.wall.repeatScale)) {
        const p = wall.front.polygon;
        g.moveTo(p[0]!.x, p[0]!.y).lineTo(p[3]!.x, p[3]!.y)
          .stroke({ color: this.style.materials ? materials.wall.secondaryColor : shadeColor(this.style.wallColor, 0.7), width: this.config.scale, alpha: 0.25 * materials.wall.opacity });
      }
      if (!exterior) {
        this.entityLayer.addChild(g);
        this.surfaceObjects.push(g);
      }
    }
    // Pixi retains this geometry on the GPU. Bitmap caching is an explicit
    // diagnostic option: A/B tests found its larger transparent quad slower.
    // Raised floors, recessed walls, avatars and hover keep individual depth.
    if (this.style.cacheBackground !== false && (surfaces.floors.some(floor => floor.elevation === 0) || surfaces.walls.some(wall => wall.side === 'x' ? wall.x === 0 : wall.y === 0))) {
      this.floorLayer.cacheAsTexture({resolution: Math.min(window.devicePixelRatio || 1, MAX_DPR), antialias: false});
    }
    this.entityLayer.sortChildren();
    this.geometryBuildMs = performance.now() - buildStart;
  }

  private drawDebug(_room: RoomState | null): void {
    this.debugLayer.clear();
    if (!this.footDebug) return;
    for (const avatar of this.avatars.values()) {
      const {foot} = avatar.diagnostics() as {foot:{tileCenter:{x:number;y:number};screen:{x:number;y:number};containerOrigin:{x:number;y:number};bounds:{x:number;y:number;width:number;height:number}}};
      const {tileCenter,screen,containerOrigin,bounds} = foot;
      this.debugLayer.poly(tilePolygon(tileCenter,this.config).flatMap(p=>[p.x,p.y])).stroke({color:0x69a7ff,width:1});
      this.debugLayer.circle(containerOrigin.x,containerOrigin.y,7).stroke({color:0xff8d9b,width:1});
      this.debugLayer.moveTo(tileCenter.x-4,tileCenter.y).lineTo(tileCenter.x+4,tileCenter.y)
        .moveTo(tileCenter.x,tileCenter.y-4).lineTo(tileCenter.x,tileCenter.y+4).stroke({color:0x69a7ff,width:1});
      this.debugLayer.circle(screen.x,screen.y,2).fill(0x69dcc1);
      if (bounds.width>0 && bounds.height>0) this.debugLayer.rect(bounds.x,bounds.y,bounds.width,bounds.height).stroke({color:0xffd166,width:1,alpha:0.7});
    }
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

function countRenderResources(root: Container): { spriteCount: number; textureSourceCount: number } {
  let spriteCount = 0;
  const sources = new Set<object>();
  const visit = (node: Container): void => {
    if (node instanceof Sprite) { spriteCount++; sources.add(node.texture.source); }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return { spriteCount, textureSourceCount: sources.size };
}

function countSurfaceInstructions(surfaces: readonly Graphics[]): { fills: number; strokes: number; textures: number; pathInstructions: number } {
  const result = { fills: 0, strokes: 0, textures: 0, pathInstructions: 0 };
  for (const surface of surfaces) for (const instruction of surface.context.instructions) {
    if (instruction.action === 'texture') result.textures++;
    else {
      if (instruction.action === 'fill') result.fills++; else result.strokes++;
      result.pathInstructions += instruction.data.path.instructions.length;
    }
  }
  return result;
}
