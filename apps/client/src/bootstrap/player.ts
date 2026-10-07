import { CoreConnection, type CoreConnectionSnapshot } from '../communication/core';
import { RoomRenderer } from '../renderer/room-renderer';
import '../styles/player.css';

const MODELS = [
  ['9000000000000000038', 'Praça pequena', 'Um espaço acolhedor para começar.'],
  ['9000000000000000041', 'Salão médio', 'Mais espaço para encontrar a galera.'],
  ['9000000000000000058', 'Star Lounge', 'Um lounge grande para explorar.'],
  ['9000000000000000033', 'Sala irregular', 'Um formato diferente para descobrir.'],
  ['9000000000000000037', 'Alturas múltiplas', 'Caminhos em vários níveis.'],
  ['9000000000000000052', 'Picnic', 'Um cenário completo para visitar.'],
] as const;

document.body.innerHTML = `
  <main class="player-shell">
    <header class="player-header"><a class="player-brand" href="/">Habbux<span> / mundo</span></a><button id="player-logout" class="player-link" type="button">Sair</button></header>
    <p id="player-status" class="player-status" role="status" aria-live="polite">Conectando ao mundo…</p><button id="player-retry" class="player-button secondary" type="button" hidden>Tentar novamente</button>
    <section id="player-home" class="player-home" hidden>
      <p class="player-kicker">Bem-vindo ao Habbux</p><h1>Escolha um lugar para entrar.</h1>
      <p id="player-welcome" class="player-welcome"></p>
      <div id="room-cards" class="room-cards"></div>
    </section>
    <section id="player-room" class="player-room" hidden>
      <div class="room-topbar"><div><p class="player-kicker">Você está em</p><h1 id="room-title">Carregando quarto…</h1></div><button id="room-leave" class="player-button secondary" type="button">Voltar para Home</button></div>
      <p id="room-error" class="player-error" role="status" aria-live="polite"></p>
      <div id="room-viewport" class="player-viewport"><p id="room-renderer-status" class="room-renderer-status" role="status">Carregando cenário…</p></div>
      <div class="room-footer"><span id="room-occupants">0 habitantes</span><form id="room-chat-form"><label class="sr-only" for="room-chat-text">Mensagem</label><input id="room-chat-text" maxlength="128" autocomplete="off" placeholder="Diga alguma coisa…" /><button class="player-button" type="submit">Enviar</button></form></div>
      <ol id="room-chat-log" class="room-chat-log" aria-label="Mensagens do quarto" aria-live="polite"></ol>
    </section>
    <p id="player-expired" class="player-expired" hidden>Sua sessão expirou. <a href="/">Voltar para o login</a></p>
  </main>`;

const home = document.querySelector<HTMLElement>('#player-home')!;
const room = document.querySelector<HTMLElement>('#player-room')!;
const status = document.querySelector<HTMLElement>('#player-status')!;
const retry = document.querySelector<HTMLButtonElement>('#player-retry')!;
const welcome = document.querySelector<HTMLElement>('#player-welcome')!;
const cards = document.querySelector<HTMLElement>('#room-cards')!;
const title = document.querySelector<HTMLElement>('#room-title')!;
const error = document.querySelector<HTMLElement>('#room-error')!;
const logout = document.querySelector<HTMLButtonElement>('#player-logout')!;
const leave = document.querySelector<HTMLButtonElement>('#room-leave')!;
const viewport = document.querySelector<HTMLDivElement>('#room-viewport')!;
const rendererStatus = document.querySelector<HTMLElement>('#room-renderer-status')!;
const occupants = document.querySelector<HTMLElement>('#room-occupants')!;
const chatLog = document.querySelector<HTMLOListElement>('#room-chat-log')!;
const chatForm = document.querySelector<HTMLFormElement>('#room-chat-form')!;
const chatText = document.querySelector<HTMLInputElement>('#room-chat-text')!;
const expired = document.querySelector<HTMLElement>('#player-expired')!;
const DEV_LOGGING = import.meta.env?.DEV === true;
let lastStage = '';
let ssoExpired = false;
let ssoTimer: ReturnType<typeof setTimeout> | null = null;

function debugLog(stage: string, fields: Record<string, string | null> = {}): void {
  if (DEV_LOGGING && stage !== lastStage) console.debug('[Habbux][game]', { stage, ...fields });
  lastStage = stage;
}

for (const [id, name, description] of MODELS) {
  const card = document.createElement('article');
  card.className = 'room-card';
  const heading = document.createElement('h2'); heading.textContent = name;
  const copy = document.createElement('p'); copy.textContent = description;
  const button = document.createElement('button'); button.className = 'player-button'; button.type = 'button'; button.textContent = 'Entrar'; button.dataset.roomId = id;
  card.append(heading, copy, button); cards.append(card);
}

const connection = new CoreConnection(__HABBUX_WS_URL__);
const ssoId = new URLSearchParams(window.location.search).get('sso');
const ssoChannel = ssoId && /^[a-f0-9]{32}$/.test(ssoId) ? new BroadcastChannel(`habbux-sso-${ssoId}`) : null;
let ssoActive = Boolean(ssoChannel);
let ssoUsed = false;
let ssoReadySent = false;
if (ssoChannel) {
  ssoChannel.onmessage = (event: MessageEvent<{ type?: string; username?: string; password?: string }>) => {
    if (ssoUsed || event.data?.type !== 'credentials' || !event.data.username || !event.data.password) return;
    ssoUsed = true;
    let credentialText = event.data.password;
    try {
      void connection.login(event.data.username, credentialText)
        .then((result) => ssoChannel.postMessage({ type: 'auth-result', ok: result.ok }))
        .catch((cause: unknown) => {
          ssoExpired = true;
          status.textContent = cause instanceof Error ? cause.message : 'Não foi possível autenticar a sessão.';
          debugLog('SSO_FAILED', { cause: cause instanceof Error ? cause.message : 'unknown' });
        })
        .finally(() => { credentialText = ''; if (ssoTimer !== null) clearTimeout(ssoTimer); ssoTimer = null; ssoActive = false; ssoChannel.close(); });
    } catch (cause) {
      credentialText = '';
      ssoExpired = true;
      status.textContent = cause instanceof Error ? cause.message : 'Não foi possível iniciar a autenticação.';
      debugLog('SSO_FAILED', { cause: cause instanceof Error ? cause.message : 'unknown' });
      ssoActive = false;
      ssoChannel.close();
    }
  };
}

const roomRenderer = new RoomRenderer(viewport, rendererStatus, (x, y) => {
  try { connection.moveRoom(x, y); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível mover o avatar.'; }
});
let rendererMounted = false;
let lastRoom: CoreConnectionSnapshot['room'] | undefined;
let lastChat: CoreConnectionSnapshot['roomChat'] | undefined;

function render(snapshot: CoreConnectionSnapshot): void {
  if (ssoChannel && !ssoReadySent && snapshot.state === 'READY' && snapshot.authState === 'ANONYMOUS') {
    ssoReadySent = true;
    ssoChannel.postMessage({ type: 'ready' });
    ssoTimer = setTimeout(() => {
      if (ssoUsed) return;
      ssoExpired = true;
      ssoActive = false;
      ssoChannel.close();
      status.textContent = 'A sessão de login expirou. Volte à tela de login e tente novamente.';
      debugLog('SSO_EXPIRED');
    }, 15_000);
  }
  if (snapshot.authState !== 'AUTHENTICATED') {
    home.hidden = true; room.hidden = true; logout.hidden = true;
    retry.hidden = snapshot.state !== 'DISCONNECTED' || ssoExpired;
    expired.hidden = true;
    if (ssoExpired) {
      debugLog('SSO_EXPIRED');
      status.hidden = false;
      status.textContent = 'A sessão de login expirou. Volte à tela de login e tente novamente.';
    } else if (snapshot.authState === 'AUTHENTICATING') {
      debugLog('AUTHENTICATING');
      status.hidden = false;
      status.textContent = snapshot.error ?? 'Autenticando sessão…';
    } else if (snapshot.state === 'CONNECTING' || snapshot.state === 'RECONNECTING') {
      debugLog('WS_CONNECTING');
      status.hidden = false;
      status.textContent = snapshot.error ?? 'Conectando ao servidor…';
    } else if (snapshot.state === 'HANDSHAKING') {
      debugLog('WS_HANDSHAKING');
      status.hidden = false;
      status.textContent = snapshot.error ?? 'Negociando sessão…';
    } else if (snapshot.state === 'READY' && ssoActive) {
      debugLog(snapshot.error ? 'AUTH_FAILED' : 'SSO_WAITING', { cause: snapshot.error });
      status.hidden = false;
      status.textContent = snapshot.error ?? 'Aguardando autenticação segura…';
    } else if (snapshot.state === 'READY' && snapshot.error) {
      debugLog('AUTH_FAILED', { cause: snapshot.error });
      status.hidden = false;
      status.textContent = snapshot.error;
    } else if (snapshot.state === 'READY' && !ssoActive) {
      debugLog('LOGIN_REQUIRED');
      status.hidden = true;
      expired.hidden = false;
    } else {
      debugLog('WS_DISCONNECTED', { cause: snapshot.error });
      status.hidden = false;
      status.textContent = snapshot.error ?? 'Não foi possível conectar ao servidor.';
    }
    return;
  }
  debugLog(snapshot.roomStatus === 'NONE' ? 'HOME' : snapshot.roomStatus === 'JOINING' ? 'ROOM_JOINING' : 'ROOM');
  logout.hidden = false; expired.hidden = true; status.hidden = true; retry.hidden = true;
  welcome.textContent = `Você entrou como ${snapshot.username ?? 'jogador'}. Onde vamos hoje?`;
  const inRoom = snapshot.roomStatus !== 'NONE'; home.hidden = inRoom; room.hidden = !inRoom;
  error.textContent = snapshot.roomError ?? '';
  if (snapshot.roomStatus === 'JOINING') title.textContent = 'Entrando no quarto…';
  if (snapshot.roomStatus === 'LEAVING') title.textContent = 'Saindo…';
  if (snapshot.room) {
    title.textContent = snapshot.room.name; occupants.textContent = `${snapshot.room.occupants.length} habitante(s)`;
    roomRenderer.setRoom(snapshot.room);
    void mountRenderer();
  }
  roomRenderer.setChat(snapshot.roomChat);
  if (snapshot.room !== lastRoom) lastRoom = snapshot.room;
  if (snapshot.roomChat !== lastChat) { lastChat = snapshot.roomChat; chatLog.replaceChildren(...snapshot.roomChat.map((message) => { const item = document.createElement('li'); item.textContent = `${message.username}: ${message.text}`; return item; })); }
}

async function mountRenderer(): Promise<void> {
  if (rendererMounted) return;
  rendererMounted = true;
  try { await roomRenderer.mount(); } catch (cause) { rendererStatus.textContent = cause instanceof Error ? `Renderer indisponível: ${cause.message}` : 'Renderer indisponível.'; }
}

cards.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-room-id]');
  if (!button) return;
  try { error.textContent = ''; connection.joinRoom(button.dataset.roomId!); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível entrar no quarto.'; }
});
retry.addEventListener('click', () => { retry.hidden = true; connection.connect(); });
leave.addEventListener('click', () => { try { connection.leaveRoom(); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível sair do quarto.'; } });
logout.addEventListener('click', () => { void connection.logout().then(() => window.location.assign('/')).catch((cause) => { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível sair.'; }); });
chatForm.addEventListener('submit', (event) => { event.preventDefault(); try { connection.chatRoom(chatText.value); chatText.value = ''; } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.'; } });

const unsubscribe = connection.subscribe(render);
debugLog('BOOT');
connection.connect();
window.addEventListener('pagehide', (event) => { if (!event.persisted) { if (ssoTimer !== null) clearTimeout(ssoTimer); unsubscribe(); connection.dispose(); roomRenderer.dispose(); } });
