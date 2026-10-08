import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { createAvatarAssetProvider, loadAvatarManifest } from './avatar-assets';
import type { AvatarGender } from './avatar-manifest';
import { avatarPartSpritePosition, avatarPartTint, resolveAvatarPartLayer, resolveAvatarFootAnchor, applyAvatarFootAnchor, resolveAvatarPartPlacement } from './avatar-composition';
import { DEFAULT_ISO_CONFIG, roomToScreen, tilePolygon } from './isometric';

declare global { interface Window { habbuxAvatarLab?: {samples: readonly object[]} } }

const MANIFEST_PATH = '/client/assets/avatar/v1/manifest/avatar-manifest-v1.json';
const ASSET_BASE_PATH = '/client/assets/avatar/v1/';
const CELL_WIDTH = 180;
const CELL_HEIGHT = 132;
const WALK_FRAME_COUNT = 4;

/** Static DEV-only matrix used to inspect actual pixels for all directions and walk frames. */
export async function mountAvatarLab(host: HTMLElement, status: HTMLElement): Promise<() => void> {
  const manifest = await loadAvatarManifest(new URL(MANIFEST_PATH, window.location.origin).toString());
  const provider = createAvatarAssetProvider(manifest, new URL(ASSET_BASE_PATH, window.location.origin).toString());
  const gender: AvatarGender = new URLSearchParams(window.location.search).get('avatar-gender') === 'female' ? 'female' : 'male';
  const requestedParts = new URLSearchParams(window.location.search).get('avatar-parts')?.split(',').filter(Boolean);
  await provider.preload(gender);
  const app = new Application();
  await app.init({
    width: CELL_WIDTH * 5,
    height: CELL_HEIGHT * 8,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: false,
    autoStart: false,
    preference: 'webgl',
    antialias: false,
    background: '#14212b',
  });
  host.replaceChildren(app.canvas);
  app.canvas.className = 'avatar-lab-canvas';
  const stage = new Container();
  app.stage.addChild(stage);
  const samples: object[] = [];
  for (let direction = 0; direction < 8; direction++) {
    for (let column = 0; column < 5; column++) {
      const action = column < WALK_FRAME_COUNT ? 'wlk' as const : 'std' as const;
      const frame = column < WALK_FRAME_COUNT ? column : 0;
      const cell = new Container();
      cell.position.set((column + 0.5) * CELL_WIDTH, (direction + 0.5) * CELL_HEIGHT);
      cell.sortableChildren = true;
      const composition = new Container();
      composition.label = `composition-d${direction}`;
      composition.sortableChildren = true;
      const avatar = new Container();
      const center = roomToScreen(0,0,0,{...DEFAULT_ISO_CONFIG,origin:{x:0,y:38}});
      avatar.position.set(center.x,center.y);
      avatar.addChild(composition);
      cell.addChild(avatar);
      stage.addChild(cell);
      const background = new Graphics().roundRect(-CELL_WIDTH / 2 + 5, -CELL_HEIGHT / 2 + 5, CELL_WIDTH - 10, CELL_HEIGHT - 10, 6)
        .fill({ color: 0x1c2b35 }).stroke({ color: 0x3d5d66, width: 1 });
      background.zIndex = -3;
      cell.addChild(background);
      const label = new Text({ text: column < WALK_FRAME_COUNT ? `WALK D${direction} · F${frame}` : `STAND D${direction}`, style: { fill: 0xa9c3c6, fontSize: 11, fontFamily: 'Arial' } });
      label.position.set(-CELL_WIDTH / 2 + 10, -CELL_HEIGHT / 2 + 8);
      label.zIndex = 100;
      cell.addChild(label);
      const bounds = { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY };
      const mirrored = provider.getFrame(gender,'bd',action,direction,frame)?.mirrored ?? false;
      for (const part of manifest.layerOrder) {
        if (requestedParts?.length && !requestedParts.includes(part)) continue;
        const resolved = provider.getFrame(gender, part, action, direction, frame);
        if (!resolved) continue;
        const placement = resolveAvatarPartPlacement(resolved.frame, resolved.texture.width, resolved.texture.height);
        bounds.minX = Math.min(bounds.minX, placement.x);
        bounds.minY = Math.min(bounds.minY, placement.y);
        bounds.maxX = Math.max(bounds.maxX, placement.x + placement.width);
        bounds.maxY = Math.max(bounds.maxY, placement.y + placement.height);
        const sprite = new Sprite({ texture: resolved.texture, anchor: { x: 0.5, y: 1 }, roundPixels: false });
        const position = avatarPartSpritePosition(placement);
        sprite.position.set(position.x, position.y);
        sprite.scale.x = 1;
        sprite.zIndex = resolveAvatarPartLayer(part, direction);
        sprite.tint = avatarPartTint(part);
        composition.addChild(sprite);
      }
      const support = resolveAvatarFootAnchor(manifest,gender,direction);
      applyAvatarFootAnchor(composition,support,mirrored);
      const guide = new Graphics();
      if (Number.isFinite(bounds.minX)) guide.rect(mirrored ? support.x - bounds.maxX : bounds.minX - support.x, bounds.minY + center.y - support.y, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
        .stroke({ color: 0xffd166, width: 1, alpha: 0.7 });
      guide.poly(tilePolygon(center).flatMap(p=>[p.x,p.y])).stroke({color:0x69a7ff,width:1,alpha:0.55});
      guide.circle(center.x,center.y,7).stroke({color:0xff8d9b,width:1});
      guide.moveTo(center.x-4,center.y).lineTo(center.x+4,center.y).moveTo(center.x,center.y-4).lineTo(center.x,center.y+4).stroke({color:0x69a7ff,width:1});
      guide.circle(center.x,center.y,2).fill(0x69dcc1);
      guide.zIndex = 90;
      cell.addChild(guide);
      const foot = composition.toGlobal(support);
      const origin = avatar.toGlobal({x:0,y:0});
      const tile = cell.toGlobal(center);
      const errorCssPx = Math.hypot(foot.x-tile.x,foot.y-tile.y);
      samples.push({gender,direction,action,frame,mirrored,support,tileCenter:{x:tile.x,y:tile.y},
        footScreen:{x:foot.x,y:foot.y},containerOrigin:{x:origin.x,y:origin.y},
        errorCssPx,errorPhysicalPx:errorCssPx*(window.devicePixelRatio||1),rasterDpr:Math.min(window.devicePixelRatio||1,2)});
    }
  }
  app.render();
  window.habbuxAvatarLab = {samples};
  status.textContent = `Matriz ${gender}: azul = tile/centro; verde = apoio; rosa = origem; amarelo = bbox. 8 direções, WALK/STAND.`;
  const { mountWorldLab } = await import('./world-lab');
  const disposeWorld = await mountWorldLab(host);
  return () => { delete window.habbuxAvatarLab; disposeWorld(); provider.dispose(); app.destroy(true, { children: true }); host.replaceChildren(); };
}
