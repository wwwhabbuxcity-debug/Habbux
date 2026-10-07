import { mountPreview } from '../renderer/preview';
import { RoomRenderer } from '../renderer/room-renderer';
import { CoreConnection, type CoreConnectionSnapshot } from '../communication/core';
import '../styles/main.css';

const viewport = document.querySelector<HTMLElement>('#viewport');
const status = document.querySelector<HTMLElement>('#renderer-status');
const connectionState = document.querySelector<HTMLElement>('#connection-state');
const sessionId = document.querySelector<HTMLElement>('#session-id');
const rtt = document.querySelector<HTMLElement>('#rtt');
const emulatorStatus = document.querySelector<HTMLElement>('#emulator-status');
const connectionError = document.querySelector<HTMLElement>('#connection-error');
const toggle = document.querySelector<HTMLButtonElement>('#connection-toggle');
const endpoint = document.querySelector<HTMLElement>('#endpoint');
const authState = document.querySelector<HTMLElement>('#auth-state');
const userId = document.querySelector<HTMLElement>('#user-id');
const authenticatedUsername = document.querySelector<HTMLElement>('#authenticated-username');
const authForm = document.querySelector<HTMLFormElement>('#auth-form');
const authIdentifier = document.querySelector<HTMLInputElement>('#auth-identifier');
const registerUsername = document.querySelector<HTMLInputElement>('#register-username');
const registerEmail = document.querySelector<HTMLInputElement>('#register-email');
const authPassword = document.querySelector<HTMLInputElement>('#auth-password');
const loginButton = document.querySelector<HTMLButtonElement>('#login-button');
const registerButton = document.querySelector<HTMLButtonElement>('#register-button');
const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button');
const authStatus = document.querySelector<HTMLElement>('#auth-status');
const roomJoinForm = document.querySelector<HTMLFormElement>('#room-join-form');
const roomIdInput = document.querySelector<HTMLInputElement>('#room-id');
const roomJoinButton = document.querySelector<HTMLButtonElement>('#room-join');
const roomLeaveButton = document.querySelector<HTMLButtonElement>('#room-leave');
const roomModelSelector = document.querySelector<HTMLElement>('#room-model-selector');
const roomModelSelect = document.querySelector<HTMLSelectElement>('#room-model-select');
const roomStatus = document.querySelector<HTMLElement>('#room-status');
const roomError = document.querySelector<HTMLElement>('#room-error');
const roomView = document.querySelector<HTMLElement>('#room-view');
const roomName = document.querySelector<HTMLElement>('#room-name');
const roomCurrentId = document.querySelector<HTMLElement>('#room-current-id');
const roomOccupantsCount = document.querySelector<HTMLElement>('#room-occupants-count');
const roomGridSize = document.querySelector<HTMLElement>('#room-grid-size');
const roomOccupants = document.querySelector<HTMLUListElement>('#room-occupants');
const roomViewport = document.querySelector<HTMLDivElement>('#room-viewport');
const roomRendererStatus = document.querySelector<HTMLElement>('#room-renderer-status');
const roomGrid = document.querySelector<HTMLDivElement>('#room-grid');
const roomChatLog = document.querySelector<HTMLOListElement>('#room-chat-log');
const roomChatForm = document.querySelector<HTMLFormElement>('#room-chat-form');
const roomChatText = document.querySelector<HTMLInputElement>('#room-chat-text');
const roomChatSend = document.querySelector<HTMLButtonElement>('#room-chat-send');
const avatarLab = document.querySelector<HTMLElement>('#avatar-lab');
const avatarLabStatus = document.querySelector<HTMLElement>('#avatar-lab-status');
const avatarLabViewport = document.querySelector<HTMLElement>('#avatar-lab-viewport');

if (!viewport || !status || !connectionState || !sessionId || !rtt || !emulatorStatus || !connectionError || !toggle || !endpoint
    || !authState || !userId || !authenticatedUsername || !authForm || !authIdentifier || !registerUsername
    || !registerEmail || !authPassword || !loginButton || !registerButton || !logoutButton || !authStatus
    || !roomJoinForm || !roomIdInput || !roomJoinButton || !roomLeaveButton || !roomStatus || !roomError || !roomView
    || !roomName || !roomCurrentId || !roomOccupantsCount || !roomGridSize || !roomOccupants || !roomViewport || !roomRendererStatus || !roomGrid
    || !roomModelSelector || !roomModelSelect
    || !roomChatLog || !roomChatForm || !roomChatText || !roomChatSend) {
  throw new Error('Client bootstrap: required elements were not found.');
}
const ui = {
  connectionState: connectionState!,
  sessionId: sessionId!,
  rtt: rtt!,
  emulatorStatus: emulatorStatus!,
  connectionError: connectionError!,
  toggle: toggle!,
  endpoint: endpoint!,
  authState: authState!,
  userId: userId!,
  authenticatedUsername: authenticatedUsername!,
  authForm: authForm!,
  authIdentifier: authIdentifier!,
  registerUsername: registerUsername!,
  registerEmail: registerEmail!,
  authPassword: authPassword!,
  loginButton: loginButton!,
  registerButton: registerButton!,
  logoutButton: logoutButton!,
  authStatus: authStatus!,
  roomJoinForm: roomJoinForm!,
  roomIdInput: roomIdInput!,
  roomJoinButton: roomJoinButton!,
  roomLeaveButton: roomLeaveButton!,
  roomModelSelector: roomModelSelector!,
  roomModelSelect: roomModelSelect!,
  roomStatus: roomStatus!,
  roomError: roomError!,
  roomView: roomView!,
  roomName: roomName!,
  roomCurrentId: roomCurrentId!,
  roomOccupantsCount: roomOccupantsCount!,
  roomGridSize: roomGridSize!,
  roomOccupants: roomOccupants!,
  roomViewport: roomViewport!,
  roomRendererStatus: roomRendererStatus!,
  roomGrid: roomGrid!,
  roomChatLog: roomChatLog!,
  roomChatForm: roomChatForm!,
  roomChatText: roomChatText!,
  roomChatSend: roomChatSend!,
};

ui.endpoint.textContent = __HABBUX_WS_URL__;
if (new URLSearchParams(window.location.search).get('dev') === '1') ui.roomModelSelector.hidden = false;
const connection = new CoreConnection(__HABBUX_WS_URL__);
const ssoId = new URLSearchParams(window.location.search).get('sso');
const ssoChannel = ssoId && /^[a-f0-9]{32}$/.test(ssoId) ? new BroadcastChannel(`habbux-sso-${ssoId}`) : null;
let ssoUsed = false;
let ssoReadySent = false;
if (ssoChannel) {
  const channel = ssoChannel;
  channel.onmessage = (event: MessageEvent<{ type?: string; username?: string; password?: string }>) => {
    if (ssoUsed || event.data?.type !== 'credentials' || !event.data.username || !event.data.password) return;
    ssoUsed = true;
    let credentialText = event.data.password;
    void connection.login(event.data.username, credentialText)
      .then((result) => channel.postMessage({ type: 'auth-result', ok: result.ok }))
      .finally(() => { credentialText = ''; channel.close(); });
  };
}
const roomRenderer = new RoomRenderer(ui.roomViewport, ui.roomRendererStatus, (x, y) => {
  try { connection.moveRoom(x, y); }
  catch (error) { ui.roomError.textContent = error instanceof Error ? error.message : 'Falha ao pedir movimento.'; }
});

function renderConnection(snapshot: CoreConnectionSnapshot): void {
  if (ssoChannel && !ssoReadySent && snapshot.state === 'READY' && snapshot.authState === 'ANONYMOUS') {
    ssoReadySent = true;
    ssoChannel.postMessage({ type: 'ready' });
  }
  ui.connectionState.textContent = snapshot.state;
  ui.sessionId.textContent = snapshot.sessionId ? formatSessionId(snapshot.sessionId) : '—';
  ui.rtt.textContent = snapshot.rttMs === null ? 'Aguardando primeiro PING…' : `${snapshot.rttMs} ms`;
  const ready = snapshot.state === 'READY';
  ui.emulatorStatus.textContent = ready ? 'ONLINE' : ['CONNECTING', 'HANDSHAKING', 'RECONNECTING'].includes(snapshot.state) ? 'CONECTANDO' : 'OFFLINE';
  ui.emulatorStatus.className = `badge ${ready ? 'badge-online' : 'badge-offline'}`;
  ui.toggle.textContent = ready || ['CONNECTING', 'HANDSHAKING', 'RECONNECTING'].includes(snapshot.state)
    ? 'Desconectar' : 'Conectar ao Emulator';
  ui.connectionError.textContent = snapshot.error ?? '';
  ui.authState.textContent = snapshot.authState;
  ui.userId.textContent = snapshot.userId ?? '—';
  ui.authenticatedUsername.textContent = snapshot.username ?? '—';
  const readyForAuth = snapshot.state === 'READY' && snapshot.authState === 'ANONYMOUS';
  ui.authIdentifier.disabled = !readyForAuth;
  ui.registerUsername.disabled = !readyForAuth;
  ui.registerEmail.disabled = !readyForAuth;
  ui.authPassword.disabled = !readyForAuth;
  ui.loginButton.disabled = !readyForAuth;
  ui.registerButton.disabled = !readyForAuth;
  ui.logoutButton.hidden = snapshot.authState !== 'AUTHENTICATED';
  ui.authStatus.textContent = snapshot.error ?? (snapshot.authState === 'AUTHENTICATED'
    ? `Autenticado como ${snapshot.username ?? 'usuário'}.`
    : snapshot.authState === 'AUTHENTICATING' ? 'Verificando credenciais…'
      : snapshot.state === 'READY' ? 'Conexão pronta para autenticar.' : 'Conecte ao Core para testar autenticação.');
  const canJoinRoom = ready && snapshot.authState === 'AUTHENTICATED' && snapshot.roomStatus === 'NONE';
  ui.roomIdInput.disabled = !canJoinRoom;
  ui.roomJoinButton.disabled = !canJoinRoom;
  ui.roomLeaveButton.disabled = snapshot.roomStatus === 'LEAVING';
  ui.roomChatText.disabled = snapshot.roomStatus !== 'IN_ROOM';
  ui.roomChatSend.disabled = snapshot.roomStatus !== 'IN_ROOM';
  renderRoom(snapshot);
}

function renderRoom(snapshot: CoreConnectionSnapshot): void {
  roomRenderer.setRoom(snapshot.room);
  roomRenderer.setChat(snapshot.roomChat);
  const labels = { NONE: 'Sem quarto', JOINING: 'Entrando…', IN_ROOM: 'Dentro do quarto', LEAVING: 'Saindo…' } as const;
  ui.roomStatus.textContent = snapshot.room ? `${labels[snapshot.roomStatus]} · ${snapshot.room.occupants.length} usuário(s)`
    : labels[snapshot.roomStatus];
  ui.roomError.textContent = snapshot.roomError ?? '';
  ui.roomLeaveButton.hidden = snapshot.roomStatus === 'NONE' || snapshot.roomStatus === 'JOINING';
  ui.roomView.hidden = snapshot.room === null;
  if (snapshot.room !== renderedRoom) {
    renderedRoom = snapshot.room;
    if (!snapshot.room) {
      ui.roomName.textContent = '—';
      ui.roomCurrentId.textContent = '—';
      ui.roomOccupantsCount.textContent = '0';
      ui.roomGridSize.textContent = '—';
      ui.roomOccupants.replaceChildren();
      ui.roomGrid.replaceChildren();
    } else {
      renderRoomState(snapshot, snapshot.room);
    }
  }
  if (snapshot.roomChat !== renderedRoomChat) {
    renderedRoomChat = snapshot.roomChat;
    ui.roomChatLog.replaceChildren(...snapshot.roomChat.map((message) => {
      const item = document.createElement('li');
      item.textContent = `${message.username}: ${message.text}`;
      return item;
    }));
  }
}

let renderedRoom: CoreConnectionSnapshot['room'] | undefined;
let renderedRoomChat: CoreConnectionSnapshot['roomChat'] | undefined;

function renderRoomState(snapshot: CoreConnectionSnapshot, room: NonNullable<CoreConnectionSnapshot['room']>): void {
  ui.roomName.textContent = room.name;
  ui.roomCurrentId.textContent = room.roomId;
  ui.roomOccupantsCount.textContent = `${room.occupants.length} / ${room.capacity}`;
  ui.roomGridSize.textContent = `${room.width} × ${room.height}`;
  ui.roomOccupants.replaceChildren(...room.occupants.map((occupant) => {
    const item = document.createElement('li');
    item.textContent = `${occupant.username} · ${occupant.x},${occupant.y}`;
    return item;
  }));

  const occupantByCell = new Map(room.occupants.map((occupant) => [occupant.y * room.width + occupant.x, occupant]));
  ui.roomGrid.style.setProperty('--columns', `${room.width}`);
  const tiles: HTMLButtonElement[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const cell = y * room.width + x;
      const occupant = occupantByCell.get(cell);
      const walkable = room.walkability[cell] === true;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.setAttribute('role', 'gridcell');
      tile.setAttribute('aria-label', occupant
        ? `${occupant.username} em ${x}, ${y}`
        : walkable ? `Tile livre em ${x}, ${y}` : `Tile bloqueado em ${x}, ${y}`);
      tile.textContent = occupant ? occupant.username.slice(0, 1).toLocaleUpperCase('pt-BR') : '';
      tile.disabled = !walkable || occupant !== undefined || snapshot.roomStatus !== 'IN_ROOM';
      if (!walkable) tile.classList.add('tile-blocked');
      if (walkable && !occupant) tile.addEventListener('click', () => {
        try { connection.moveRoom(x, y); }
        catch (error) { ui.roomError.textContent = error instanceof Error ? error.message : 'Falha ao pedir movimento.'; }
      });
      tiles.push(tile);
    }
  }
  ui.roomGrid.replaceChildren(...tiles);
}

const unsubscribe = connection.subscribe(renderConnection);
ui.toggle.addEventListener('click', () => {
  if (['CONNECTING', 'HANDSHAKING', 'READY', 'RECONNECTING'].includes(ui.connectionState.textContent ?? '')) connection.disconnect();
  else connection.connect();
});
ui.authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  let secret = ui.authPassword.value;
  ui.authPassword.value = '';
  const attempt = connection.login(ui.authIdentifier.value, secret);
  secret = '';
  void attempt.catch((error: unknown) => { ui.authStatus.textContent = error instanceof Error ? error.message : 'Falha ao iniciar login.'; });
});
ui.registerButton.addEventListener('click', () => {
  let secret = ui.authPassword.value;
  ui.authPassword.value = '';
  const attempt = connection.register(ui.registerUsername.value, ui.registerEmail.value, secret);
  secret = '';
  void attempt.catch((error: unknown) => { ui.authStatus.textContent = error instanceof Error ? error.message : 'Falha ao iniciar cadastro.'; });
});
ui.logoutButton.addEventListener('click', () => {
  void connection.logout().catch((error: unknown) => {
    ui.authStatus.textContent = error instanceof Error ? error.message : 'Falha ao sair da conta.';
  });
});
ui.roomJoinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try { connection.joinRoom(ui.roomIdInput.value); }
  catch (error) { ui.roomError.textContent = error instanceof Error ? error.message : 'Falha ao entrar no quarto.'; }
});
ui.roomLeaveButton.addEventListener('click', () => {
  try { connection.leaveRoom(); }
  catch (error) { ui.roomError.textContent = error instanceof Error ? error.message : 'Falha ao sair do quarto.'; }
});
ui.roomModelSelect.addEventListener('change', () => {
  if (ui.roomModelSelect.value) ui.roomIdInput.value = ui.roomModelSelect.value;
});
ui.roomChatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    connection.chatRoom(ui.roomChatText.value);
    ui.roomChatText.value = '';
  } catch (error) {
    ui.roomError.textContent = error instanceof Error ? error.message : 'Falha ao enviar mensagem.';
  }
});

let disposePreview = (): void => undefined;
let disposeAvatarLab = (): void => undefined;
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) { unsubscribe(); connection.dispose(); roomRenderer.dispose(); disposePreview(); disposeAvatarLab(); }
});
import.meta.hot?.dispose(() => { unsubscribe(); connection.dispose(); roomRenderer.dispose(); disposePreview(); disposeAvatarLab(); });

try {
  disposePreview = await mountPreview(viewport, status);
  void mountRoomRenderer();
  void mountAvatarDirectionLab();
  connection.connect();
} catch {
  status.textContent = 'A prévia gráfica não está disponível neste dispositivo. Você pode continuar pelo site.';
  viewport.hidden = true;
  void mountRoomRenderer();
  void mountAvatarDirectionLab();
  connection.connect();
}

async function mountAvatarDirectionLab(): Promise<void> {
  if (new URLSearchParams(window.location.search).get('avatar-lab') !== '1') return;
  if (!avatarLab || !avatarLabStatus || !avatarLabViewport) return;
  avatarLab.hidden = false;
  try {
    const { mountAvatarLab } = await import('../renderer/avatar-lab');
    disposeAvatarLab = await mountAvatarLab(avatarLabViewport, avatarLabStatus);
  } catch (error) {
    avatarLabStatus.textContent = error instanceof Error ? `Avatar lab indisponível: ${error.message}` : 'Avatar lab indisponível.';
  }
}

async function mountRoomRenderer(): Promise<void> {
  try {
    await roomRenderer.mount();
  } catch (error: unknown) {
    ui.roomViewport.hidden = true;
    ui.roomRendererStatus.textContent = error instanceof Error
      ? `Renderer da sala indisponível: ${error.message}`
      : 'Renderer da sala indisponível.';
  }
}

function formatSessionId(value: string): string {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
