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
    <p id="player-status" class="player-status" role="status" aria-live="polite">Conectando ao mundo…</p>
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
let ssoUsed = false;
let ssoReadySent = false;
if (ssoChannel) {
  ssoChannel.onmessage = (event: MessageEvent<{ type?: string; username?: string; password?: string }>) => {
    if (ssoUsed || event.data?.type !== 'credentials' || !event.data.username || !event.data.password) return;
    ssoUsed = true;
    let credentialText = event.data.password;
    void connection.login(event.data.username, credentialText).then((result) => ssoChannel.postMessage({ type: 'auth-result', ok: result.ok })).finally(() => { credentialText = ''; ssoChannel.close(); });
  };
}

const roomRenderer = new RoomRenderer(viewport, rendererStatus, (x, y) => {
  try { connection.moveRoom(x, y); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível mover o avatar.'; }
});
let rendererMounted = false;
let lastRoom: CoreConnectionSnapshot['room'] | undefined;
let lastChat: CoreConnectionSnapshot['roomChat'] | undefined;

function render(snapshot: CoreConnectionSnapshot): void {
  if (ssoChannel && !ssoReadySent && snapshot.state === 'READY' && snapshot.authState === 'ANONYMOUS') { ssoReadySent = true; ssoChannel.postMessage({ type: 'ready' }); }
  if (snapshot.authState !== 'AUTHENTICATED') {
    home.hidden = true; room.hidden = true; logout.hidden = true;
    if (snapshot.state === 'READY' && !ssoChannel) { status.hidden = true; expired.hidden = false; }
    else { status.hidden = false; status.textContent = snapshot.error ?? (snapshot.authState === 'AUTHENTICATING' ? 'Autenticando…' : 'Conectando ao mundo…'); }
    return;
  }
  logout.hidden = false; expired.hidden = true; status.hidden = true;
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
leave.addEventListener('click', () => { try { connection.leaveRoom(); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível sair do quarto.'; } });
logout.addEventListener('click', () => { void connection.logout().then(() => window.location.assign('/')).catch((cause) => { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível sair.'; }); });
chatForm.addEventListener('submit', (event) => { event.preventDefault(); try { connection.chatRoom(chatText.value); chatText.value = ''; } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.'; } });

const unsubscribe = connection.subscribe(render);
connection.connect();
window.addEventListener('pagehide', (event) => { if (!event.persisted) { unsubscribe(); connection.dispose(); roomRenderer.dispose(); } });
