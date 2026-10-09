import test from 'node:test';
import assert from 'node:assert/strict';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { countRenderResources, countSurfaceInstructions } from '../src/renderer/renderer-diagnostics.ts';

test('Graphics fill and Sprite share one source even through different texture views', () => {
  const source = new TextureSource({ width: 16, height: 16 });
  const texture = new Texture({ source });
  const view = new Texture({ source });
  const root = new Container();
  const surface = new Graphics().rect(0, 0, 32, 32).fill({ texture });
  const sprite = new Sprite(view);
  root.addChild(surface, sprite);
  try {
    assert.equal(surface.context.instructions[0]?.action, 'fill');
    assert.deepEqual(countRenderResources(root), { spriteCount: 1, textureSourceCount: 1 });
    assert.equal(countSurfaceInstructions([surface]).textures, 1);
    const secondSource = new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
    surface.rect(32, 0, 8, 8).fill({ texture: secondSource });
    assert.equal(countRenderResources(root).textureSourceCount, 2);
    surface.clear();
    assert.deepEqual(countRenderResources(root), { spriteCount: 1, textureSourceCount: 1 });
    secondSource.destroy(true);
  } finally {
    root.destroy({ children: true });
    texture.destroy();
    view.destroy();
    source.destroy();
  }
});

test('real Graphics fills, strokes and texture draws are counted without classifying flat colors as images', () => {
  const texture = new Texture({ source: new TextureSource({ width: 16, height: 16 }) });
  const surface = new Graphics()
    .rect(0, 0, 16, 16).fill(0xff0000)
    .rect(16, 0, 16, 16).fill({ texture })
    .moveTo(0, 32).lineTo(32, 32).stroke({ texture, width: 1 })
    .texture(texture);
  try {
    const count = countSurfaceInstructions([surface]);
    assert.equal(count.fills, 2);
    assert.equal(count.strokes, 1);
    assert.equal(count.textures, 3);
    assert.ok(count.pathInstructions > 0);
    // The shared white source for the flat color is a real Pixi resource too.
    assert.equal(countRenderResources(surface).textureSourceCount, 2);
  } finally {
    surface.destroy();
    texture.destroy(true);
  }
});
