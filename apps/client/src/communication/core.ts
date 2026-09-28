import {
  decodeRoomActionFailure,
  decodeRoomChat,
  decodeRoomPosition,
  decodeRoomSnapshot,
  decodeRoomUserJoined,
  decodeRoomUserLeft,
  encodeRoomChat,
  encodeRoomId,
  encodeRoomMove,
  type RoomState,
} from '../room/room-state';

export const PROTOCOL_VERSION = 1;
export const HEADER_BYTES = 8;
export const MAX_PAYLOAD_BYTES = 65_536;
export const CORE_MESSAGE = {
  CLIENT_HELLO: 1,
  SERVER_HELLO: 2,
  PING: 3,
  PONG: 4,
  CLIENT_DISCONNECT: 5,
  SERVER_ERROR: 6,
  AUTH_LOGIN: 7,
  AUTH_REGISTER: 8,
  AUTH_SUCCESS: 9,
  AUTH_FAILURE: 10,
  AUTH_LOGOUT: 11,
  AUTH_LOGOUT_SUCCESS: 12,
  ROOM_JOIN: 13,
  ROOM_JOIN_SUCCESS: 14,
  ROOM_JOIN_FAILURE: 15,
  ROOM_LEAVE: 16,
  ROOM_LEAVE_SUCCESS: 17,
  ROOM_SNAPSHOT: 18,
  ROOM_MOVE: 19,
  ROOM_USER_POSITION: 20,
  ROOM_ACTION_FAILURE: 21,
  ROOM_USER_JOIN: 22,
  ROOM_USER_LEAVE: 23,
  ROOM_CHAT: 24,
  ROOM_USER_CHAT: 25,
} as const;
export const AUTH_FAILURE_CATEGORY = {
  INVALID_REQUEST: 1,
  REJECTED: 2,
  RATE_LIMITED: 3,
  UNAVAILABLE: 4,
} as const;
const CORE_MESSAGE_IDS = new Set<number>(Object.values(CORE_MESSAGE));
const ROOM_SERVER_MESSAGE_IDS: ReadonlySet<number> = new Set([
  CORE_MESSAGE.ROOM_JOIN_SUCCESS, CORE_MESSAGE.ROOM_JOIN_FAILURE, CORE_MESSAGE.ROOM_LEAVE_SUCCESS,
  CORE_MESSAGE.ROOM_SNAPSHOT, CORE_MESSAGE.ROOM_USER_JOIN, CORE_MESSAGE.ROOM_USER_LEAVE,
  CORE_MESSAGE.ROOM_USER_POSITION, CORE_MESSAGE.ROOM_USER_CHAT, CORE_MESSAGE.ROOM_ACTION_FAILURE,
]);

export type CoreMessageId = (typeof CORE_MESSAGE)[keyof typeof CORE_MESSAGE];
export type CoreConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'HANDSHAKING' | 'READY' | 'RECONNECTING';
export type CoreAuthState = 'ANONYMOUS' | 'AUTHENTICATING' | 'AUTHENTICATED';
export type CoreRoomStatus = 'NONE' | 'JOINING' | 'IN_ROOM' | 'LEAVING';
export type CoreAuthFailureCategory = 'INVALID_REQUEST' | 'REJECTED' | 'RATE_LIMITED' | 'UNAVAILABLE';
export type CoreAuthResult =
  | { readonly ok: true; readonly userId: string; readonly username: string }
  | { readonly ok: false; readonly category: CoreAuthFailureCategory };

export interface HabbuxFrame {
  readonly version: number;
  readonly messageId: number;
  readonly flags: number;
  readonly payload: Uint8Array;
}

export function encodeFrame(messageId: number, payload: Uint8Array = new Uint8Array()): ArrayBuffer {
  if (!isCoreMessage(messageId)) throw new Error('ID de mensagem desconhecido.');
  if (payload.byteLength > MAX_PAYLOAD_BYTES) throw new Error('Payload maior que o limite do Core v1.');
  const frame = new ArrayBuffer(HEADER_BYTES + payload.byteLength);
  const view = new DataView(frame);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint16(1, messageId, false);
  view.setUint8(3, 0);
  view.setUint32(4, payload.byteLength, false);
  new Uint8Array(frame, HEADER_BYTES).set(payload);
  return frame;
}

export function decodeFrame(input: ArrayBuffer | Uint8Array): HabbuxFrame {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTES) throw new Error('Cabeçalho de frame truncado.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  const messageId = view.getUint16(1, false);
  const flags = view.getUint8(3);
  const payloadLength = view.getUint32(4, false);
  if (version !== PROTOCOL_VERSION) throw new Error('Versão de protocolo incompatível.');
  if (!isCoreMessage(messageId)) throw new Error('ID de mensagem desconhecido.');
  if (flags !== 0) throw new Error('Flags reservadas devem ser zero.');
  if (payloadLength > MAX_PAYLOAD_BYTES) throw new Error('Payload maior que o limite do Core v1.');
  if (payloadLength !== bytes.byteLength - HEADER_BYTES) throw new Error('Tamanho declarado não corresponde ao frame.');
  return { version, messageId, flags, payload: bytes.slice(HEADER_BYTES) };
}

function isCoreMessage(value: number): value is CoreMessageId {
  return Number.isInteger(value) && CORE_MESSAGE_IDS.has(value);
}

export interface CoreConnectionSnapshot {
  readonly state: CoreConnectionState;
  readonly sessionId: string | null;
  readonly rttMs: number | null;
  readonly error: string | null;
  readonly authState: CoreAuthState;
  readonly userId: string | null;
  readonly username: string | null;
  readonly roomStatus: CoreRoomStatus;
  readonly room: RoomState | null;
  readonly roomError: string | null;
  readonly roomChat: readonly { readonly userId: string; readonly username: string; readonly text: string }[];
}

export class CoreConnection {
  private readonly listeners = new Set<(snapshot: CoreConnectionSnapshot) => void>();
  private socket: WebSocket | null = null;
  private snapshot: CoreConnectionSnapshot = {
    state: 'DISCONNECTED', sessionId: null, rttMs: null, error: null,
    authState: 'ANONYMOUS', userId: null, username: null,
    roomStatus: 'NONE', room: null, roomError: null, roomChat: [],
  };
  private reconnectEnabled = true;
  private disposed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingDeadline: ReturnType<typeof setTimeout> | null = null;
  private pendingPing: { sequence: number; sentAt: number } | null = null;
  private sequence = 0;
  private pendingAuth: { resolve: (result: CoreAuthResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private pendingLogout: { resolve: (success: boolean) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private pendingRoomJoinId: string | null = null;
  private pendingRoomJoinPosition: { readonly x: number; readonly y: number } | null = null;
  private roomCommandTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly url: string, private readonly maxReconnectAttempts = 8) {
    const parsed = new URL(url);
    if (!Number.isInteger(maxReconnectAttempts) || maxReconnectAttempts < 0 || maxReconnectAttempts > 16) {
      throw new Error('Limite de reconexões deve estar entre 0 e 16.');
    }
    if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.pathname !== '/ws' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('CLIENT_WS_URL deve ser uma URL ws:// ou wss:// terminada em /ws.');
    }
  }

  subscribe(listener: (snapshot: CoreConnectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    if (this.disposed || this.socket) return;
    this.reconnectEnabled = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.openSocket(false);
  }

  login(usernameOrEmail: string, password: string): Promise<CoreAuthResult> {
    const fields: Uint8Array[] = [];
    try {
      fields.push(encodeUtf8(usernameOrEmail, 1, 254));
      fields.push(encodeUtf8(password, 1, 512));
      return this.sendAuthRequest(CORE_MESSAGE.AUTH_LOGIN, fields);
    } catch (error) {
      fields.forEach((field) => field.fill(0));
      throw error;
    }
  }

  register(username: string, email: string, password: string): Promise<CoreAuthResult> {
    const fields: Uint8Array[] = [];
    try {
      fields.push(encodeUtf8(username, 3, 20));
      fields.push(encodeUtf8(email, 3, 254));
      fields.push(encodeUtf8(password, 1, 512));
      return this.sendAuthRequest(CORE_MESSAGE.AUTH_REGISTER, fields);
    } catch (error) {
      fields.forEach((field) => field.fill(0));
      throw error;
    }
  }

  logout(): Promise<boolean> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.snapshot.authState !== 'AUTHENTICATED') {
      return Promise.reject(new Error('É necessário estar autenticado para sair.'));
    }
    if (this.pendingLogout) return Promise.reject(new Error('Logout já está em andamento.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLogout = null;
        socket.close(1001, 'logout timeout');
        resolve(false);
      }, 5_000);
      this.pendingLogout = { resolve, timer };
      try { socket.send(encodeFrame(CORE_MESSAGE.AUTH_LOGOUT)); }
      catch (error) {
        clearTimeout(timer);
        this.pendingLogout = null;
        reject(error instanceof Error ? error : new Error('Não foi possível enviar logout.'));
      }
    });
  }

  joinRoom(roomId: string | bigint): void {
    const socket = this.readyRoomSocket();
    if (this.snapshot.roomStatus !== 'NONE') throw new Error('Esta sessão já está entrando em um quarto.');
    const payload = encodeRoomId(roomId);
    this.pendingRoomJoinId = BigInt(roomId).toString();
    this.setSnapshot({ ...this.snapshot, roomStatus: 'JOINING', roomError: null });
    try {
      socket.send(encodeFrame(CORE_MESSAGE.ROOM_JOIN, payload));
      this.startRoomCommandTimeout(socket, 'JOIN');
    } catch (error) {
      this.clearRoomCommand();
      this.setSnapshot({ ...this.snapshot, roomStatus: 'NONE', roomError: 'Não foi possível solicitar entrada no quarto.' });
      throw error instanceof Error ? error : new Error('Não foi possível solicitar entrada no quarto.');
    }
  }

  leaveRoom(): void {
    const socket = this.readyRoomSocket();
    if (this.snapshot.roomStatus !== 'IN_ROOM') throw new Error('Esta sessão não está em um quarto.');
    this.setSnapshot({ ...this.snapshot, roomStatus: 'LEAVING', roomError: null });
    try {
      socket.send(encodeFrame(CORE_MESSAGE.ROOM_LEAVE));
      this.startRoomCommandTimeout(socket, 'LEAVE');
    } catch (error) {
      this.clearRoomCommand();
      this.setSnapshot({ ...this.snapshot, roomStatus: 'IN_ROOM', roomError: 'Não foi possível sair do quarto.' });
      throw error instanceof Error ? error : new Error('Não foi possível sair do quarto.');
    }
  }

  moveRoom(x: number, y: number): void {
    const socket = this.readyRoomSocket();
    if (this.snapshot.roomStatus !== 'IN_ROOM') throw new Error('Entre em um quarto antes de mover.');
    socket.send(encodeFrame(CORE_MESSAGE.ROOM_MOVE, encodeRoomMove(x, y)));
  }

  chatRoom(text: string): void {
    const socket = this.readyRoomSocket();
    if (this.snapshot.roomStatus !== 'IN_ROOM') throw new Error('Entre em um quarto antes de conversar.');
    socket.send(encodeFrame(CORE_MESSAGE.ROOM_CHAT, encodeRoomChat(text)));
  }

  disconnect(): void {
    this.reconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopPings();
    this.finishPendingOperations();
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(encodeFrame(CORE_MESSAGE.CLIENT_DISCONNECT)); } catch { socket.close(); }
      socket.close(1000, 'client disconnect');
    } else {
      socket?.close();
    }
    this.clearRoomCommand();
    this.setSnapshot({ ...this.snapshot, state: 'DISCONNECTED', sessionId: null,
      authState: 'ANONYMOUS', userId: null, username: null,
      roomStatus: 'NONE', room: null, roomError: null, roomChat: [] });
  }

  setReconnectEnabled(enabled: boolean): void {
    this.reconnectEnabled = enabled;
    if (!enabled) {
      this.clearReconnectTimer();
      if (this.snapshot.state === 'RECONNECTING') this.setSnapshot({ ...this.snapshot, state: 'DISCONNECTED' });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.listeners.clear();
  }

  private openSocket(reconnecting: boolean): void {
    if (this.disposed) return;
    this.clearRoomCommand();
    this.setSnapshot({ ...this.snapshot, state: reconnecting ? 'RECONNECTING' : 'CONNECTING', sessionId: null,
      error: null, authState: 'ANONYMOUS', userId: null, username: null,
      roomStatus: 'NONE', room: null, roomError: null, roomChat: [] });
    const socket = new WebSocket(this.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.setSnapshot({ ...this.snapshot, state: 'HANDSHAKING' });
      socket.send(encodeFrame(CORE_MESSAGE.CLIENT_HELLO));
    };
    socket.onmessage = (event: MessageEvent<unknown>) => this.onMessage(socket, event.data);
    socket.onerror = () => { /* onclose owns recovery and bounded retry behavior */ };
    socket.onclose = () => this.onClose(socket);
  }

  private onMessage(socket: WebSocket, data: unknown): void {
    if (socket !== this.socket || !(data instanceof ArrayBuffer)) {
      socket.close(1002, 'binary frames required');
      return;
    }
    let frame: HabbuxFrame;
    try { frame = decodeFrame(data); }
    catch (error) {
      this.setSnapshot({ ...this.snapshot, error: error instanceof Error ? error.message : 'Frame inválido.' });
      socket.close(1002, 'invalid frame');
      return;
    }
    if (frame.messageId === CORE_MESSAGE.SERVER_HELLO && this.snapshot.state === 'HANDSHAKING' && frame.payload.byteLength === 16) {
      this.reconnectAttempts = 0;
      this.setSnapshot({ ...this.snapshot, state: 'READY',
        sessionId: [...frame.payload].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
        rttMs: null, error: null, authState: 'ANONYMOUS', userId: null, username: null });
      this.startPings(socket);
      return;
    }
    if (frame.messageId === CORE_MESSAGE.PONG && this.snapshot.state === 'READY' && frame.payload.byteLength === 4) {
      const sequence = new DataView(frame.payload.buffer, frame.payload.byteOffset, 4).getUint32(0, false);
      if (this.pendingPing?.sequence === sequence) {
        this.setSnapshot({ ...this.snapshot, rttMs: Math.max(0, Math.round(performance.now() - this.pendingPing.sentAt)) });
        this.clearPingDeadline();
        this.pendingPing = null;
      }
      return;
    }
    if (frame.messageId === CORE_MESSAGE.AUTH_SUCCESS) {
      this.onAuthSuccess(socket, frame.payload);
      return;
    }
    if (frame.messageId === CORE_MESSAGE.AUTH_FAILURE) {
      this.onAuthFailure(socket, frame.payload);
      return;
    }
    if (frame.messageId === CORE_MESSAGE.AUTH_LOGOUT_SUCCESS) {
      if (frame.payload.byteLength !== 0 || !this.pendingLogout) {
        socket.close(1002, 'unexpected logout response');
        return;
      }
      clearTimeout(this.pendingLogout.timer);
      this.pendingLogout.resolve(true);
      this.pendingLogout = null;
      this.clearRoomCommand();
      this.setSnapshot({ ...this.snapshot, authState: 'ANONYMOUS', userId: null, username: null, error: null,
        roomStatus: 'NONE', room: null, roomError: null, roomChat: [] });
      return;
    }
    if (ROOM_SERVER_MESSAGE_IDS.has(frame.messageId)) {
      this.onRoomMessage(socket, frame.messageId, frame.payload);
      return;
    }
    if (frame.messageId === CORE_MESSAGE.SERVER_ERROR) {
      if (frame.payload.byteLength !== 2) {
        this.setSnapshot({ ...this.snapshot, error: 'Emulator enviou um erro Core malformado.' });
        socket.close(1002, 'invalid server error');
        return;
      }
      const code = new DataView(frame.payload.buffer, frame.payload.byteOffset, 2).getUint16(0, false);
      if (![1, 2].includes(code)) {
        socket.close(1002, 'unknown server error');
        return;
      }
      this.setSnapshot({ ...this.snapshot, error: `Emulator recusou a mensagem Core (${code}).` });
      socket.close(1008, 'server error');
      return;
    }
    socket.close(1002, 'unexpected message');
  }

  private onRoomMessage(socket: WebSocket, messageId: number, payload: Uint8Array): void {
    try {
      if (messageId === CORE_MESSAGE.ROOM_JOIN_SUCCESS) {
        if (payload.byteLength !== 10 || this.snapshot.roomStatus !== 'JOINING' || this.pendingRoomJoinId === null) {
          throw new Error('Confirmação de entrada inesperada.');
        }
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const roomId = view.getBigUint64(0, false).toString();
        if (roomId !== this.pendingRoomJoinId) throw new Error('ID do quarto não corresponde ao pedido.');
        this.pendingRoomJoinPosition = { x: view.getUint8(8), y: view.getUint8(9) };
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_JOIN_FAILURE) {
        if (payload.byteLength !== 1 || this.snapshot.roomStatus !== 'JOINING' || this.pendingRoomJoinId === null) {
          throw new Error('Falha de entrada inesperada.');
        }
        const failures = ['Quarto inexistente.', 'Quarto lotado.', 'Esta sessão já está em outro quarto.', 'Quarto temporariamente indisponível.'];
        const message = failures[(payload[0] ?? 0) - 1];
        if (!message) throw new Error('Categoria de falha de entrada desconhecida.');
        this.clearRoomCommand();
        this.setSnapshot({ ...this.snapshot, roomStatus: 'NONE', room: null, roomError: message });
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_SNAPSHOT) {
        const room = decodeRoomSnapshot(payload);
        const start = this.pendingRoomJoinPosition;
        const self = room.occupants.find((occupant) => occupant.userId === this.snapshot.userId);
        if (this.snapshot.roomStatus !== 'JOINING' || this.pendingRoomJoinId !== room.roomId || !start || !self
            || self.x !== start.x || self.y !== start.y) {
          throw new Error('Snapshot não corresponde à entrada confirmada.');
        }
        this.clearRoomCommand();
        this.setSnapshot({ ...this.snapshot, roomStatus: 'IN_ROOM', room, roomError: null, roomChat: [] });
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_LEAVE_SUCCESS) {
        if (payload.byteLength !== 0 || this.snapshot.roomStatus !== 'LEAVING') {
          throw new Error('Confirmação de saída inesperada.');
        }
        this.clearRoomCommand();
        this.setSnapshot({ ...this.snapshot, roomStatus: 'NONE', room: null, roomError: null, roomChat: [] });
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_ACTION_FAILURE) {
        const failure = decodeRoomActionFailure(payload);
        const messages = {
          NOT_IN_ROOM: 'Esta sessão não está dentro de um quarto.',
          INVALID_DESTINATION: 'Esse destino está bloqueado ou ocupado.',
          UNREACHABLE: 'Não há caminho até esse destino.',
          PATH_LIMIT: 'O caminho excede o limite permitido.',
          INVALID_MESSAGE: 'A mensagem está vazia, inválida ou longa demais.',
          RATE_LIMITED: 'Aguarde antes de enviar outra mensagem.',
          UNAVAILABLE: 'A ação está temporariamente indisponível.',
        } as const;
        this.setSnapshot({ ...this.snapshot, roomError: messages[failure.category] });
        return;
      }
      const room = this.snapshot.room;
      if (!room || !['IN_ROOM', 'LEAVING'].includes(this.snapshot.roomStatus)) {
        throw new Error('Evento de quarto recebido fora da sala.');
      }
      if (messageId === CORE_MESSAGE.ROOM_USER_JOIN) {
        const occupant = decodeRoomUserJoined(payload);
        const cell = occupant.y * room.width + occupant.x;
        if (occupant.x >= room.width || occupant.y >= room.height || !room.walkability[cell]
            || room.occupants.length >= room.capacity
            || room.occupants.some((current) => current.userId === occupant.userId
              || (current.x === occupant.x && current.y === occupant.y))) {
          throw new Error('Ocupante recebido não cabe no estado atual do quarto.');
        }
        const updated = Object.freeze({ ...room, occupants: Object.freeze([...room.occupants, occupant]) });
        this.setSnapshot({ ...this.snapshot, room: updated });
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_USER_LEAVE) {
        const userId = decodeRoomUserLeft(payload);
        if (!room.occupants.some((occupant) => occupant.userId === userId)) throw new Error('Saída de ocupante desconhecido.');
        const updated = Object.freeze({ ...room, occupants: Object.freeze(room.occupants.filter((occupant) => occupant.userId !== userId)) });
        this.setSnapshot({ ...this.snapshot, room: updated });
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_USER_POSITION) {
        const position = decodeRoomPosition(payload);
        const index = room.occupants.findIndex((occupant) => occupant.userId === position.userId);
        const cell = position.y * room.width + position.x;
        if (index < 0 || position.x >= room.width || position.y >= room.height || !room.walkability[cell]
            || room.occupants.some((occupant, other) => other !== index
              && occupant.x === position.x && occupant.y === position.y)) {
          throw new Error('Posição recebida inválida para o quarto.');
        }
        const occupants = room.occupants.map((occupant, other) => other === index
          ? Object.freeze({ ...occupant, x: position.x, y: position.y }) : occupant);
        this.setSnapshot({ ...this.snapshot, room: Object.freeze({ ...room, occupants: Object.freeze(occupants) }) });
        return;
      }
      if (messageId === CORE_MESSAGE.ROOM_USER_CHAT) {
        const chat = decodeRoomChat(payload);
        const occupant = room.occupants.find((current) => current.userId === chat.userId);
        if (!occupant) throw new Error('Mensagem de ocupante desconhecido.');
        const entry = Object.freeze({ ...chat, username: occupant.username });
        this.setSnapshot({ ...this.snapshot, roomChat: Object.freeze([...this.snapshot.roomChat, entry].slice(-50)), roomError: null });
        return;
      }
      throw new Error('Mensagem de quarto desconhecida.');
    } catch (error) {
      this.setSnapshot({ ...this.snapshot, roomError: error instanceof Error ? error.message : 'Mensagem de quarto inválida.' });
      socket.close(1002, 'invalid room message');
    }
  }

  private readyRoomSocket(): WebSocket {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.snapshot.state !== 'READY'
        || this.snapshot.authState !== 'AUTHENTICATED') {
      throw new Error('Conecte ao Core e autentique antes de usar os quartos.');
    }
    return socket;
  }

  private startRoomCommandTimeout(socket: WebSocket, command: 'JOIN' | 'LEAVE'): void {
    this.clearRoomCommandTimer();
    this.roomCommandTimer = setTimeout(() => {
      this.roomCommandTimer = null;
      if (socket !== this.socket) return;
      socket.close(1001, `${command.toLowerCase()} room timeout`);
    }, 5_000);
  }

  private clearRoomCommandTimer(): void {
    if (this.roomCommandTimer !== null) clearTimeout(this.roomCommandTimer);
    this.roomCommandTimer = null;
  }

  private clearRoomCommand(): void {
    this.clearRoomCommandTimer();
    this.pendingRoomJoinId = null;
    this.pendingRoomJoinPosition = null;
  }

  private onClose(socket: WebSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.stopPings();
    this.finishPendingOperations();
    this.clearRoomCommand();
    if (!this.disposed && this.reconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(500 * (2 ** this.reconnectAttempts), 10_000);
      this.reconnectAttempts++;
      this.setSnapshot({ ...this.snapshot, state: 'RECONNECTING', sessionId: null,
        authState: 'ANONYMOUS', userId: null, username: null,
        roomStatus: 'NONE', room: null, roomError: null, roomChat: [] });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.openSocket(true);
      }, delay);
      return;
    }
    this.setSnapshot({ ...this.snapshot, state: 'DISCONNECTED', sessionId: null,
      authState: 'ANONYMOUS', userId: null, username: null,
      roomStatus: 'NONE', room: null, roomError: null, roomChat: [] });
  }

  private sendAuthRequest(messageId: number, fields: Uint8Array[]): Promise<CoreAuthResult> {
    const socket = this.socket;
    if (this.pendingAuth) {
      for (const field of fields) field.fill(0);
      return Promise.reject(new Error('Já existe uma autenticação em andamento.'));
    }
    if (!socket || socket.readyState !== WebSocket.OPEN || this.snapshot.state !== 'READY'
        || this.snapshot.authState !== 'ANONYMOUS') {
      for (const field of fields) field.fill(0);
      return Promise.reject(new Error('Conecte ao Core e aguarde READY antes de autenticar.'));
    }
    let payload: Uint8Array;
    try { payload = encodeFields(fields); }
    catch (error) {
      fields.forEach((field) => field.fill(0));
      return Promise.reject(error instanceof Error ? error : new Error('Payload de autenticação inválido.'));
    }
    for (const field of fields) field.fill(0);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pendingAuth) return;
        this.pendingAuth = null;
        this.setSnapshot({ ...this.snapshot, authState: 'ANONYMOUS', error: 'A autenticação excedeu o tempo limite.' });
        socket.close(1001, 'auth timeout');
        resolve({ ok: false, category: 'UNAVAILABLE' });
      }, 12_000);
      this.pendingAuth = { resolve, timer };
      this.setSnapshot({ ...this.snapshot, authState: 'AUTHENTICATING', error: null });
      try {
        const encoded = encodeFrame(messageId, payload);
        socket.send(encoded);
        new Uint8Array(encoded).fill(0);
        payload.fill(0);
      } catch (error) {
        clearTimeout(timer);
        this.pendingAuth = null;
        payload.fill(0);
        this.setSnapshot({ ...this.snapshot, authState: 'ANONYMOUS' });
        reject(error instanceof Error ? error : new Error('Não foi possível enviar autenticação.'));
      }
    });
  }

  private onAuthSuccess(socket: WebSocket, payload: Uint8Array): void {
    if (!this.pendingAuth || this.snapshot.authState !== 'AUTHENTICATING' || payload.byteLength < 13) {
      socket.close(1002, 'unexpected authentication response');
      return;
    }
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const userId = view.getBigUint64(0, false);
    const length = view.getUint16(8, false);
    if (userId === 0n || length < 3 || length > 20 || payload.byteLength !== 10 + length) {
      socket.close(1002, 'invalid authentication response');
      return;
    }
    let username: string;
    try { username = new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(10)); }
    catch { socket.close(1002, 'invalid authentication username'); return; }
    clearTimeout(this.pendingAuth.timer);
    const resolve = this.pendingAuth.resolve;
    this.pendingAuth = null;
    this.setSnapshot({ ...this.snapshot, authState: 'AUTHENTICATED', userId: userId.toString(), username, error: null });
    resolve({ ok: true, userId: userId.toString(), username });
  }

  private onAuthFailure(socket: WebSocket, payload: Uint8Array): void {
    if (!this.pendingAuth || this.snapshot.authState !== 'AUTHENTICATING' || payload.byteLength !== 1) {
      socket.close(1002, 'unexpected authentication failure');
      return;
    }
    const category = (Object.entries(AUTH_FAILURE_CATEGORY) as [CoreAuthFailureCategory, number][])
      .find(([, code]) => code === payload[0])?.[0];
    if (!category) { socket.close(1002, 'unknown authentication failure'); return; }
    clearTimeout(this.pendingAuth.timer);
    const resolve = this.pendingAuth.resolve;
    this.pendingAuth = null;
    const messages = {
      INVALID_REQUEST: 'Os dados enviados são inválidos.',
      REJECTED: 'Não foi possível autenticar com esses dados.',
      RATE_LIMITED: 'Muitas tentativas. Aguarde e tente novamente.',
      UNAVAILABLE: 'A autenticação está temporariamente indisponível.',
    } as const;
    this.setSnapshot({ ...this.snapshot, authState: 'ANONYMOUS', error: messages[category] });
    resolve({ ok: false, category });
  }

  private finishPendingOperations(): void {
    this.clearRoomCommand();
    if (this.pendingAuth) {
      clearTimeout(this.pendingAuth.timer);
      this.pendingAuth.resolve({ ok: false, category: 'UNAVAILABLE' });
      this.pendingAuth = null;
    }
    if (this.pendingLogout) {
      clearTimeout(this.pendingLogout.timer);
      this.pendingLogout.resolve(false);
      this.pendingLogout = null;
    }
  }

  private startPings(socket: WebSocket): void {
    this.stopPings();
    const sendPing = (): void => {
      if (socket !== this.socket || socket.readyState !== WebSocket.OPEN || this.pendingPing) return;
      const sequence = this.sequence++ >>> 0;
      const payload = new ArrayBuffer(4);
      new DataView(payload).setUint32(0, sequence, false);
      this.pendingPing = { sequence, sentAt: performance.now() };
      socket.send(encodeFrame(CORE_MESSAGE.PING, new Uint8Array(payload)));
      this.pingDeadline = setTimeout(() => socket.close(1001, 'pong timeout'), 10_000);
    };
    sendPing();
    this.pingTimer = setInterval(sendPing, 15_000);
  }

  private stopPings(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPingDeadline();
    this.pendingPing = null;
  }

  private clearPingDeadline(): void {
    if (this.pingDeadline !== null) clearTimeout(this.pingDeadline);
    this.pingDeadline = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setSnapshot(snapshot: CoreConnectionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

function encodeUtf8(value: string, minimumBytes: number, maximumBytes: number): Uint8Array {
  if (typeof value !== 'string' || !hasValidSurrogates(value)) throw new Error('O texto contém Unicode inválido.');
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength < minimumBytes || bytes.byteLength > maximumBytes) {
    bytes.fill(0);
    throw new Error('O tamanho do campo está fora do limite do protocolo.');
  }
  return bytes;
}

function hasValidSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function encodeFields(fields: Uint8Array[]): Uint8Array {
  const length = fields.reduce((total, field) => total + ShortField.bytes + field.byteLength, 0);
  const payload = new Uint8Array(length);
  const view = new DataView(payload.buffer);
  let offset = 0;
  for (const field of fields) {
    view.setUint16(offset, field.byteLength, false);
    offset += ShortField.bytes;
    payload.set(field, offset);
    offset += field.byteLength;
  }
  return payload;
}

const ShortField = { bytes: 2 } as const;
