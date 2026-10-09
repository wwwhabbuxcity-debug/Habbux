import { Container, Graphics, Sprite, Texture } from 'pixi.js';

/** Count distinct image sources used by sprites and retained Graphics instructions. */
export function countRenderResources(root: Container): { spriteCount: number; textureSourceCount: number } {
  let spriteCount = 0;
  const sources = new Set<object>();
  const visit = (node: Container): void => {
    if (node instanceof Sprite) {
      spriteCount++;
      sources.add(node.texture.source);
    }
    if (node instanceof Graphics) for (const instruction of node.context.instructions) {
      const texture = instruction.action === 'texture' ? instruction.data.image
        : instruction.action === 'cut' ? null : instruction.data.style.texture;
      if (texture) sources.add(texture.source);
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return { spriteCount, textureSourceCount: sources.size };
}

/** Textured fills/strokes are texture instructions too; flat colors use Pixi's shared white source. */
export function countSurfaceInstructions(surfaces: readonly Graphics[]): { fills: number; strokes: number; textures: number; pathInstructions: number } {
  const result = { fills: 0, strokes: 0, textures: 0, pathInstructions: 0 };
  for (const surface of surfaces) for (const instruction of surface.context.instructions) {
    if (instruction.action === 'texture') {
      result.textures++;
      continue;
    }
    if (instruction.action === 'fill') result.fills++;
    else if (instruction.action === 'stroke') result.strokes++;
    result.pathInstructions += instruction.data.path.instructions.length;
    if (instruction.action !== 'cut' && instruction.data.style.texture
        && instruction.data.style.texture.source !== Texture.WHITE.source) result.textures++;
  }
  return result;
}
