export interface RoomMovementStep {
  readonly sequence: number;
  readonly fromX: number; readonly fromY: number; readonly fromZ: number;
  readonly x: number; readonly y: number; readonly z: number;
  readonly durationMs: number; readonly remainingMs: number;
}

export interface RoomOccupant {
  readonly movement?: RoomMovementStep;
  readonly userId: string;
  readonly username: string;
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface RoomState {
  readonly roomId: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly capacity: number;
  readonly walkability: readonly boolean[];
  readonly elevations: readonly number[];
  readonly modelId: string | null;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly door: { readonly x: number; readonly y: number; readonly direction: number };
  readonly occupants: readonly RoomOccupant[];
}

export interface RoomChatMessage {
  readonly userId: string;
  readonly text: string;
}

export type RoomActionFailure =
  | { readonly operation: 'MOVE'; readonly category: 'NOT_IN_ROOM' | 'INVALID_DESTINATION' | 'UNREACHABLE' | 'PATH_LIMIT' | 'UNAVAILABLE' }
  | { readonly operation: 'CHAT'; readonly category: 'NOT_IN_ROOM' | 'INVALID_MESSAGE' | 'RATE_LIMITED' | 'UNAVAILABLE' };

const utf8 = new TextDecoder('utf-8', { fatal: true });
const MAX_CHAT_BYTES = 256;
const MAX_CHAT_CODE_POINTS = 128;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;

export function decodeRoomSnapshot(payload: Uint8Array): RoomState {
  return decodeRoomSnapshotPayload(payload, false);
}

export function decodeRoomModelSnapshot(payload: Uint8Array): RoomState {
  return decodeRoomSnapshotPayload(payload, true);
}

function decodeRoomSnapshotPayload(payload: Uint8Array, hasModel: boolean): RoomState {
  const reader = new PayloadReader(payload);
  const roomId = readUserId(reader, 'room ID');
  const nameLength = reader.readUint16();
  if (nameLength < 1 || nameLength > 128) throw new Error('Nome de quarto inválido.');
  const name = readUtf8(reader.readBytes(nameLength), 'Nome de quarto inválido.');
  const width = reader.readUint8();
  const height = reader.readUint8();
  const capacity = reader.readUint8();
  if (width < 1 || width > 96 || height < 1 || height > 96 || capacity < 1 || capacity > 100) {
    throw new Error('Dimensões ou capacidade do quarto inválidas.');
  }
  const walkability = [...reader.readBytes(width * height)].map((cell) => {
    if (cell !== 0 && cell !== 1) throw new Error('Grade do quarto inválida.');
    return cell === 1;
  });
  const count = reader.readUint8();
  if (count > capacity) throw new Error('O snapshot excede a capacidade do quarto.');
  const occupants: RoomOccupant[] = [];
  const userIds = new Set<string>();
  const cells = new Set<number>();
  for (let index = 0; index < count; index++) {
    const userId = readUserId(reader, 'usuário');
    const x = reader.readUint8();
    const y = reader.readUint8();
    const usernameLength = reader.readUint16();
    if (usernameLength < 3 || usernameLength > 20 || x >= width || y >= height) {
      throw new Error('Ocupante inválido no snapshot.');
    }
    const cell = y * width + x;
    if (!walkability[cell] || cells.has(cell) || userIds.has(userId)) {
      throw new Error('Ocupação de quarto inválida.');
    }
    const username = readUtf8(reader.readBytes(usernameLength), 'Username inválido no snapshot.');
    userIds.add(userId);
    cells.add(cell);
    occupants.push(Object.freeze({ userId, username, x, y }));
  }
  let modelId: string | null = null;
  let elevations: number[] = walkability.map((walkable) => walkable ? 0 : -1);
  let spawn = { x: 0, y: 0 };
  let door = { x: 0, y: 0, direction: 0 };
  if (hasModel) {
    const modelIdLength = reader.readUint16();
    if (modelIdLength < 1 || modelIdLength > 64) throw new Error('Identificador de modelo inválido.');
    modelId = readUtf8(reader.readBytes(modelIdLength), 'Identificador de modelo inválido.');
    elevations = [...reader.readBytes(width * height)].map((value): number => value === 255 ? -1 : value);
    if (elevations.some((elevation, index) => (walkability[index] && elevation < 0) || (!walkability[index] && elevation >= 0) || elevation > 35)) {
      throw new Error('Elevação do modelo inválida.');
    }
    spawn = { x: reader.readUint8(), y: reader.readUint8() };
    door = { x: reader.readUint8(), y: reader.readUint8(), direction: reader.readUint8() };
    if (spawn.x >= width || spawn.y >= height || !walkability[spawn.y * width + spawn.x]
        || door.x >= width || door.y >= height || door.direction > 7) throw new Error('Porta ou spawn do modelo inválido.');
  }
  reader.finish();
  const resolvedOccupants = occupants.map((occupant) => Object.freeze({
    ...occupant, z: elevations[occupant.y * width + occupant.x] ?? 0,
  }));
  return Object.freeze({
    roomId,
    name,
    width,
    height,
    capacity,
    walkability: Object.freeze(walkability),
    elevations: Object.freeze(elevations),
    modelId,
    spawn: Object.freeze(spawn),
    door: Object.freeze(door),
    occupants: Object.freeze(resolvedOccupants),
  });
}

export function decodeRoomUserJoined(payload: Uint8Array): RoomOccupant {
  const reader = new PayloadReader(payload);
  const userId = readUserId(reader, 'usuário');
  const x = reader.readUint8();
  const y = reader.readUint8();
  const length = reader.readUint16();
  if (length < 3 || length > 20) throw new Error('Username inválido no evento de entrada.');
  const username = readUtf8(reader.readBytes(length), 'Username inválido no evento de entrada.');
  reader.finish();
  return Object.freeze({ userId, username, x, y });
}

export function decodeRoomUserLeft(payload: Uint8Array): string {
  const reader = new PayloadReader(payload);
  const userId = readUserId(reader, 'usuário');
  reader.finish();
  return userId;
}

export function decodeRoomPosition(payload: Uint8Array): { readonly userId: string; readonly x: number; readonly y: number; readonly z: number } {
  const reader = new PayloadReader(payload);
  const userId = readUserId(reader, 'usuário');
  const x = reader.readUint8();
  const y = reader.readUint8();
  const z = reader.readUint8();
  reader.finish();
  return Object.freeze({ userId, x, y, z });
}

export function decodeRoomMovementStep(payload: Uint8Array): RoomMovementStep & { readonly userId: string } {
  const reader = new PayloadReader(payload);
  const userId = readUserId(reader, 'usuário');
  const sequence = Number(reader.readBigUint64());
  const fromX = reader.readUint8(), fromY = reader.readUint8(), fromZ = reader.readUint8();
  const x = reader.readUint8(), y = reader.readUint8(), z = reader.readUint8();
  const durationMs = reader.readUint16(), remainingMs = reader.readUint16();
  reader.finish();
  const dx = x - fromX, dy = y - fromY;
  const expectedDuration = dx !== 0 && dy !== 0 ? 707 : 500;
  if (!Number.isSafeInteger(sequence) || sequence < 1 || fromZ > 35 || z > 35
      || (durationMs === 0 ? (dx !== 0 || dy !== 0 || z !== fromZ || remainingMs !== 0)
        : ((dx === 0 && dy === 0) || Math.abs(dx) > 1 || Math.abs(dy) > 1
          || durationMs !== expectedDuration || remainingMs < 1 || remainingMs > durationMs))) {
    throw new Error('Segmento autoritativo inválido.');
  }
  return Object.freeze({ userId, sequence, fromX, fromY, fromZ, x, y, z, durationMs, remainingMs });
}

export function decodeRoomChat(payload: Uint8Array): RoomChatMessage {
  const reader = new PayloadReader(payload);
  const userId = readUserId(reader, 'usuário');
  const length = reader.readUint16();
  if (length < 1 || length > MAX_CHAT_BYTES) throw new Error('Mensagem de quarto fora do limite.');
  const text = readUtf8(reader.readBytes(length), 'Mensagem de quarto inválida.');
  reader.finish();
  validateChatText(text);
  return Object.freeze({ userId, text });
}

export function decodeRoomActionFailure(payload: Uint8Array): RoomActionFailure {
  if (payload.byteLength !== 2) throw new Error('Falha de ação de quarto inválida.');
  const operation = payload[0];
  const category = payload[1] ?? 0;
  if (operation === 1) {
    const categories = ['NOT_IN_ROOM', 'INVALID_DESTINATION', 'UNREACHABLE', 'PATH_LIMIT', 'UNAVAILABLE'] as const;
    const value = categories[category - 1];
    if (!value) throw new Error('Categoria de movimento desconhecida.');
    return { operation: 'MOVE', category: value };
  }
  if (operation === 2) {
    const categories = ['NOT_IN_ROOM', 'INVALID_MESSAGE', 'RATE_LIMITED', 'UNAVAILABLE'] as const;
    const value = categories[category - 1];
    if (!value) throw new Error('Categoria de chat desconhecida.');
    return { operation: 'CHAT', category: value };
  }
  throw new Error('Operação de quarto desconhecida.');
}

export function encodeRoomId(roomId: string | bigint): Uint8Array {
  let value: bigint;
  try {
    if (typeof roomId === 'string' && !/^[1-9][0-9]{0,19}$/u.test(roomId)) throw new Error();
    value = BigInt(roomId);
  } catch { throw new Error('Informe um ID de quarto válido.'); }
  if (value < 1n || value > MAX_U64) throw new Error('Informe um ID de quarto válido.');
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setBigUint64(0, value, false);
  return payload;
}

export function encodeRoomMove(x: number, y: number): Uint8Array {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 255) {
    throw new Error('Destino fora do limite do protocolo.');
  }
  return Uint8Array.of(x, y);
}

export function encodeRoomChat(text: string): Uint8Array {
  validateChatText(text);
  const bytes = new TextEncoder().encode(text);
  const payload = new Uint8Array(2 + bytes.length);
  new DataView(payload.buffer).setUint16(0, bytes.length, false);
  payload.set(bytes, 2);
  return payload;
}

function validateChatText(text: string): void {
  if (typeof text !== 'string' || !text.trim() || !hasValidSurrogates(text)) {
    throw new Error('A mensagem precisa conter texto Unicode válido.');
  }
  const codePoints = [...text];
  if (codePoints.length > MAX_CHAT_CODE_POINTS || codePoints.some((character) => /[\u0000-\u001f\u007f-\u009f]/u.test(character))) {
    throw new Error('A mensagem contém caracteres inválidos ou excede o limite.');
  }
  if (new TextEncoder().encode(text).byteLength > MAX_CHAT_BYTES) throw new Error('A mensagem excede 256 bytes UTF-8.');
}

function readUserId(reader: PayloadReader, label: string): string {
  const value = reader.readBigUint64();
  if (value === 0n) throw new Error(`ID de ${label} inválido.`);
  return value.toString();
}

function readUtf8(bytes: Uint8Array, message: string): string {
  try { return utf8.decode(bytes); }
  catch { throw new Error(message); }
}

function hasValidSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(++index);
      if (next < 0xdc00 || next > 0xdfff) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

class PayloadReader {
  private offset = 0;
  private readonly view: DataView;
  private readonly payload: Uint8Array;
  constructor(payload: Uint8Array) {
    this.payload = payload;
    this.view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  readUint8(): number { this.require(1); return this.view.getUint8(this.offset++); }
  readUint16(): number { this.require(2); const value = this.view.getUint16(this.offset, false); this.offset += 2; return value; }
  readBigUint64(): bigint { this.require(8); const value = this.view.getBigUint64(this.offset, false); this.offset += 8; return value; }
  readBytes(length: number): Uint8Array { this.require(length); const value = this.payload.slice(this.offset, this.offset + length); this.offset += length; return value; }
  finish(): void { if (this.offset !== this.payload.byteLength) throw new Error('Tamanho do payload de quarto inválido.'); }
  private require(length: number): void {
    if (!Number.isInteger(length) || length < 0 || length > this.payload.byteLength - this.offset) {
      throw new Error('Payload de quarto truncado.');
    }
  }
}
