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
} as const;
const CORE_MESSAGE_IDS = new Set<number>(Object.values(CORE_MESSAGE));

export type CoreMessageId = (typeof CORE_MESSAGE)[keyof typeof CORE_MESSAGE];
export type CoreConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'HANDSHAKING' | 'READY' | 'RECONNECTING';

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
}

export class CoreConnection {
  private readonly listeners = new Set<(snapshot: CoreConnectionSnapshot) => void>();
  private socket: WebSocket | null = null;
  private snapshot: CoreConnectionSnapshot = { state: 'DISCONNECTED', sessionId: null, rttMs: null, error: null };
  private reconnectEnabled = true;
  private disposed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingDeadline: ReturnType<typeof setTimeout> | null = null;
  private pendingPing: { sequence: number; sentAt: number } | null = null;
  private sequence = 0;

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

  disconnect(): void {
    this.reconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopPings();
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(encodeFrame(CORE_MESSAGE.CLIENT_DISCONNECT)); } catch { socket.close(); }
      socket.close(1000, 'client disconnect');
    } else {
      socket?.close();
    }
    this.setSnapshot({ ...this.snapshot, state: 'DISCONNECTED', sessionId: null });
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
    this.setSnapshot({ ...this.snapshot, state: reconnecting ? 'RECONNECTING' : 'CONNECTING', sessionId: null, error: null });
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
      this.setSnapshot({ state: 'READY', sessionId: [...frame.payload].map((byte) => byte.toString(16).padStart(2, '0')).join(''), rttMs: null, error: null });
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

  private onClose(socket: WebSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.stopPings();
    if (!this.disposed && this.reconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(500 * (2 ** this.reconnectAttempts), 10_000);
      this.reconnectAttempts++;
      this.setSnapshot({ ...this.snapshot, state: 'RECONNECTING', sessionId: null });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.openSocket(true);
      }, delay);
      return;
    }
    this.setSnapshot({ ...this.snapshot, state: 'DISCONNECTED', sessionId: null });
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
