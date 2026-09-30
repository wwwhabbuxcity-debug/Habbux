export type AvatarGender = 'male' | 'female';
export type AvatarAction = 'std' | 'wlk';
export type AvatarPart = 'bd' | 'hd' | 'lg' | 'sh' | 'ch' | 'ls' | 'rs' | 'hrb' | 'hr' | 'fc' | 'ey';

export interface AvatarRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AvatarOffset {
  readonly x: number;
  readonly y: number;
}

export interface AvatarSheetDefinition {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface AvatarFrameDefinition {
  readonly region: string;
  readonly offset: AvatarOffset;
  readonly sourceFallback?: string;
}

export interface AvatarDirectionDefinition {
  readonly renderDirection: number;
  readonly mirrored: boolean;
  readonly frames: Readonly<Record<string, AvatarFrameDefinition>>;
}

export interface AvatarGenderActionDefinition {
  readonly sourceGender: number;
  readonly directions: Readonly<Record<string, AvatarDirectionDefinition>>;
}

export interface AvatarActionDefinition {
  readonly frameCount: number;
  readonly genders: Readonly<Record<AvatarGender, AvatarGenderActionDefinition>>;
}

export interface AvatarPartDefinition {
  readonly sheet: string;
  readonly layer: number;
  readonly actions: Readonly<Partial<Record<AvatarAction, AvatarActionDefinition>>>;
}

export interface AvatarManifest {
  readonly version: 1;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly directions: {
    readonly count: 8;
    readonly mirrorForRender: Readonly<Record<string, number>>;
    readonly flipped: Readonly<Record<string, boolean>>;
  };
  readonly layerOrder: readonly AvatarPart[];
  readonly sheets: Readonly<Record<string, AvatarSheetDefinition>>;
  readonly regions: Readonly<Record<string, AvatarRect>>;
  readonly parts: Readonly<Record<AvatarPart, AvatarPartDefinition>>;
}

const PARTS = new Set<AvatarPart>(['bd', 'hd', 'lg', 'sh', 'ch', 'ls', 'rs', 'hrb', 'hr', 'fc', 'ey']);
const ACTIONS = new Set<AvatarAction>(['std', 'wlk']);

export function parseAvatarManifest(input: unknown): AvatarManifest {
  if (!isRecord(input) || input.version !== 1 || !isRecord(input.canvas) || input.canvas.width !== 180 || input.canvas.height !== 260) {
    throw new Error('Manifesto de avatar incompatível.');
  }
  const sheets = parseSheets(input.sheets);
  const regions = parseRegions(input.regions, sheets);
  if (!isRecord(input.directions) || input.directions.count !== 8 || !isRecord(input.directions.mirrorForRender) || !isRecord(input.directions.flipped)) {
    throw new Error('Sistema de direções de avatar inválido.');
  }
  const layerOrder = parseLayerOrder(input.layerOrder);
  const parts = parseParts(input.parts, sheets, regions);
  return Object.freeze({
    version: 1,
    canvas: Object.freeze({ width: 180, height: 260 }),
    directions: Object.freeze({
      count: 8,
      mirrorForRender: freezeNumberMap(input.directions.mirrorForRender, 'mirrorForRender'),
      flipped: freezeBooleanMap(input.directions.flipped, 'flipped'),
    }),
    layerOrder: Object.freeze(layerOrder),
    sheets: Object.freeze(sheets),
    regions: Object.freeze(regions),
    parts: Object.freeze(parts),
  });
}

function parseSheets(input: unknown): Record<string, AvatarSheetDefinition> {
  if (!isRecord(input)) throw new Error('Sheets de avatar ausentes.');
  const result: Record<string, AvatarSheetDefinition> = {};
  for (const [id, value] of Object.entries(input)) {
    if (!isRecord(value) || typeof value.src !== 'string' || !positiveInteger(value.width) || !positiveInteger(value.height)) {
      throw new Error(`Sheet de avatar inválida: ${id}`);
    }
    result[id] = Object.freeze({ src: value.src, width: value.width, height: value.height });
  }
  if (Object.keys(result).length !== 6) throw new Error('Manifesto precisa dos seis sheets mínimos.');
  return result;
}

function parseRegions(input: unknown, sheets: Readonly<Record<string, AvatarSheetDefinition>>): Record<string, AvatarRect> {
  if (!isRecord(input)) throw new Error('Regiões de avatar ausentes.');
  const result: Record<string, AvatarRect> = {};
  for (const [id, value] of Object.entries(input)) {
    const separator = id.indexOf(':');
    const sheet = separator > 0 ? sheets[id.slice(0, separator)] : undefined;
    if (!sheet || !isRecord(value) || !positiveInteger(value.width) || !positiveInteger(value.height)
        || !nonNegativeInteger(value.x) || !nonNegativeInteger(value.y)
        || value.x + value.width > sheet.width || value.y + value.height > sheet.height) {
      throw new Error(`Região de avatar inválida: ${id}`);
    }
    result[id] = Object.freeze({ x: value.x, y: value.y, width: value.width, height: value.height });
  }
  return result;
}

function parseLayerOrder(input: unknown): AvatarPart[] {
  if (!Array.isArray(input) || input.length !== PARTS.size || input.some((part) => typeof part !== 'string' || !PARTS.has(part as AvatarPart))) {
    throw new Error('Ordem de layers do avatar inválida.');
  }
  const result = [...input] as AvatarPart[];
  if (new Set(result).size !== PARTS.size) throw new Error('Ordem de layers do avatar contém duplicatas.');
  return result;
}

function parseParts(input: unknown, sheets: Readonly<Record<string, AvatarSheetDefinition>>, regions: Readonly<Record<string, AvatarRect>>): Record<AvatarPart, AvatarPartDefinition> {
  if (!isRecord(input)) throw new Error('Partes de avatar ausentes.');
  const result = {} as Record<AvatarPart, AvatarPartDefinition>;
  for (const part of PARTS) {
    const value = input[part];
    if (!isRecord(value) || typeof value.sheet !== 'string' || !sheets[value.sheet] || !nonNegativeInteger(value.layer) || !isRecord(value.actions)) {
      throw new Error(`Part de avatar inválida: ${part}`);
    }
    const actions: Partial<Record<AvatarAction, AvatarActionDefinition>> = {};
    for (const [actionName, actionValue] of Object.entries(value.actions)) {
      if (!ACTIONS.has(actionName as AvatarAction) || !isRecord(actionValue) || !positiveInteger(actionValue.frameCount) || !isRecord(actionValue.genders)) {
        throw new Error(`Ação de avatar inválida: ${part}/${actionName}`);
      }
      const genders = {} as Record<AvatarGender, AvatarGenderActionDefinition>;
      for (const gender of ['male', 'female'] as const) {
        const genderValue = actionValue.genders[gender];
        if (!isRecord(genderValue) || !positiveInteger(genderValue.sourceGender) || !isRecord(genderValue.directions)) {
          throw new Error(`Gênero de avatar inválido: ${part}/${actionName}/${gender}`);
        }
        const directions: Record<string, AvatarDirectionDefinition> = {};
        for (const [direction, directionValue] of Object.entries(genderValue.directions)) {
          const directionNumber = Number(direction);
          if (!Number.isInteger(directionNumber) || directionNumber < 0 || directionNumber > 7 || !isRecord(directionValue)
              || !directionNumberInRange(directionValue.renderDirection)
              || typeof directionValue.mirrored !== 'boolean' || !isRecord(directionValue.frames)) {
            throw new Error(`Direção de avatar inválida: ${part}/${actionName}/${gender}/${direction}`);
          }
          const frames: Record<string, AvatarFrameDefinition> = {};
          for (const [frame, frameValue] of Object.entries(directionValue.frames)) {
            const frameNumber = Number(frame);
            if (!Number.isInteger(frameNumber) || frameNumber < 0 || frameNumber >= actionValue.frameCount || !isRecord(frameValue)
                || typeof frameValue.region !== 'string' || !regions[frameValue.region] || !isRecord(frameValue.offset)
                || !finiteNumber(frameValue.offset.x) || !finiteNumber(frameValue.offset.y)) {
              throw new Error(`Frame de avatar inválido: ${part}/${actionName}/${gender}/${direction}/${frame}`);
            }
            frames[frame] = Object.freeze({
              region: frameValue.region,
              offset: Object.freeze({ x: frameValue.offset.x, y: frameValue.offset.y }),
              ...(typeof frameValue.sourceFallback === 'string' ? { sourceFallback: frameValue.sourceFallback } : {}),
            });
          }
          directions[direction] = Object.freeze({ renderDirection: directionValue.renderDirection, mirrored: directionValue.mirrored, frames: Object.freeze(frames) });
        }
        genders[gender] = Object.freeze({ sourceGender: genderValue.sourceGender, directions: Object.freeze(directions) });
      }
      actions[actionName as AvatarAction] = Object.freeze({ frameCount: actionValue.frameCount, genders: Object.freeze(genders) });
    }
    result[part] = Object.freeze({ sheet: value.sheet, layer: value.layer, actions: Object.freeze(actions) });
  }
  return result;
}

function freezeNumberMap(input: Record<string, unknown>, label: string): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 7) throw new Error(`Mapa ${label} inválido.`);
    result[key] = value;
  }
  return Object.freeze(result);
}

function freezeBooleanMap(input: Record<string, unknown>, label: string): Readonly<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'boolean') throw new Error(`Mapa ${label} inválido.`);
    result[key] = value;
  }
  return Object.freeze(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function directionNumberInRange(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
