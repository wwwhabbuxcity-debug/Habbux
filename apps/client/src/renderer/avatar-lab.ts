import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { createAvatarAssetProvider, loadAvatarManifest } from './avatar-assets';

const MANIFEST_PATH = '/client/assets/avatar/v1/manifest/avatar-manifest-v1.json';
const ASSET_BASE_PATH = '/client/assets/avatar/v1/';
const CELL_WIDTH = 180;
const CELL_HEIGHT = 132;
const WALK_FRAME_COUNT = 4;

/** Static DEV-only matrix used to inspect actual pixels for all directions and walk frames. */
export async function mountAvatarLab(host: HTMLElement, status: HTMLElement): Promise<() => void> {
  const manifest = await loadAvatarManifest(new URL(MANIFEST_PATH, window.location.origin).toString());
  const provider = createAvatarAssetProvider(manifest, new URL(ASSET_BASE_PATH, window.location.origin).toString());
  await provider.preload('male');
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
  for (let direction = 0; direction < 8; direction++) {
    for (let column = 0; column < 5; column++) {
      const action = column < WALK_FRAME_COUNT ? 'wlk' as const : 'std' as const;
      const frame = column < WALK_FRAME_COUNT ? column : 0;
      const cell = new Container();
      cell.position.set((column + 0.5) * CELL_WIDTH, (direction + 0.5) * CELL_HEIGHT);
      cell.sortableChildren = true;
      const background = new Graphics().roundRect(-CELL_WIDTH / 2 + 5, -CELL_HEIGHT / 2 + 5, CELL_WIDTH - 10, CELL_HEIGHT - 10, 6)
        .fill({ color: 0x1c2b35 }).stroke({ color: 0x3d5d66, width: 1 });
      background.zIndex = -3;
      cell.addChild(background);
      const label = new Text({ text: column < WALK_FRAME_COUNT ? `WALK D${direction} · F${frame}` : `STAND D${direction}`, style: { fill: 0xa9c3c6, fontSize: 11, fontFamily: 'Arial' } });
      label.position.set(-CELL_WIDTH / 2 + 10, -CELL_HEIGHT / 2 + 8);
      label.zIndex = 100;
      cell.addChild(label);
      const bounds = { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY };
      for (const part of manifest.layerOrder) {
        const resolved = provider.getFrame('male', part, action, direction, frame);
        if (!resolved) continue;
        const x = resolved.frame.offset.x;
        const y = 36 - resolved.frame.offset.y;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x + resolved.texture.width);
        bounds.maxY = Math.max(bounds.maxY, y + resolved.texture.height);
        const sprite = new Sprite({ texture: resolved.texture, anchor: { x: 0.5, y: 1 }, roundPixels: false });
        sprite.position.set(resolved.frame.offset.x + resolved.texture.width / 2, resolved.texture.height - resolved.frame.offset.y + 36);
        sprite.scale.x = resolved.mirrored ? -1 : 1;
        sprite.zIndex = manifest.parts[part].layer;
        cell.addChild(sprite);
      }
      const guide = new Graphics()
        .rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
        .stroke({ color: 0xffd166, width: 1, alpha: 0.7 })
        .moveTo(-CELL_WIDTH / 2 + 8, bounds.maxY)
        .lineTo(CELL_WIDTH / 2 - 8, bounds.maxY)
        .stroke({ color: 0x69dcc1, width: 1, alpha: 0.7 });
      guide.zIndex = -2;
      cell.addChild(guide);
      stage.addChild(cell);
    }
  }
  app.render();
  status.textContent = 'Matriz visual pronta: 8 direções, 4 frames WALK, STAND, bbox e linha dos pés.';
  return () => { provider.dispose(); app.destroy(true, { children: true }); host.replaceChildren(); };
}
