import { Badge, Button, Checkbox, Divider, IconButton, Input, ScrollArea, Surface, TextArea, Toggle, Tooltip } from './primitives';
import { ChatHistory } from './chat-history';
import { ContextMenu, createOverlayLayers, Modal, openModal, Popover, ToastQueue } from './overlays';
import { WindowView } from './window-view';
import { UI_BREAKPOINTS, WindowManager } from './window-manager';
import { CoreConnection, type CoreConnectionSnapshot } from '../communication/core';
import { mountPreview } from '../renderer/preview';
import './components.css';

document.title = 'Habbux · UI Lab (desenvolvimento)';
document.documentElement.dataset.hbxTheme = 'default';
const lab = document.createElement('main');
lab.className = 'hbx-lab';
lab.dataset.hbxQuality = 'high';
document.body.replaceChildren(lab);

const heading = document.createElement('header');
heading.className = 'hbx-lab__heading';
const title = document.createElement('h1');
title.textContent = 'Habbux UI Core';
const subtitle = document.createElement('p');
subtitle.className = 'hbx-muted';
subtitle.textContent = 'Laboratório de desenvolvimento · conteúdo técnico e temporário';
heading.append(title, subtitle);
const gameStage = document.createElement('section');
gameStage.className = 'hbx-game-stage hbx-surface';
const gameCanvasHost = document.createElement('div');
gameCanvasHost.className = 'hbx-game-stage__canvas';
const rendererStatus = document.createElement('p');
rendererStatus.className = 'hbx-game-stage__status';
rendererStatus.setAttribute('role', 'status');
rendererStatus.textContent = 'Preparando PixiJS…';
gameStage.append(gameCanvasHost, rendererStatus);
const grid = document.createElement('div');
grid.className = 'hbx-lab__grid';
lab.append(heading, gameStage, grid);
let disposePreview = (): void => undefined;
try {
  disposePreview = await mountPreview(gameCanvasHost, rendererStatus);
} catch {
  rendererStatus.textContent = 'Prévia PixiJS indisponível neste navegador.';
  gameCanvasHost.hidden = true;
}

const overlays = createOverlayLayers(lab);
const manager = new WindowManager({ width: lab.clientWidth, height: lab.clientHeight });
const chatHistory = new ChatHistory(50, 45_000);
const liveChatHistory = new ChatHistory(50, 45_000);
let selectedQuality: 'high' | 'reduced' = 'high';
let disposePopover: (() => void) | undefined;
let disposeContextMenu: (() => void) | undefined;
const toastQueue = new ToastQueue(overlays.notifications, 5);
const toolbar = document.createElement('nav');
toolbar.className = 'hbx-toolbar';
toolbar.setAttribute('aria-label', 'Protótipo da barra de ferramentas');
overlays.root.append(toolbar);

const stats = document.createElement('p');
stats.className = 'hbx-muted';
const updateStats = (): void => {
  stats.textContent = `Janelas: ${manager.list().length} · Notificações: ${toastQueue.list().length} · Mensagens: ${chatHistory.list().length + liveChatHistory.list().length} · Nós DOM: ${lab.querySelectorAll('*').length} · Qualidade: ${selectedQuality.toUpperCase()} · ${viewportLabel()}`;
};

const card = (label: string): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'hbx-surface hbx-lab__card';
  section.dataset.surface = 'solid';
  const h2 = document.createElement('h2');
  h2.textContent = label;
  section.append(h2);
  grid.append(section);
  return section;
};

const controls = card('Ações e ícones');
const controlRow = document.createElement('div');
controlRow.className = 'hbx-lab__row';
controlRow.append(
  Button({ label: 'Ação principal', tone: 'primary', onClick: () => toastQueue.push('Ação principal ativada.') }),
  Button({ label: 'Desativado', disabled: true }),
  Button({ label: 'Carregando', loading: true }),
  Tooltip(IconButton('Mostrar dica', 'info', () => toastQueue.push('Tooltip funciona ao passar o mouse ou focar pelo teclado.')), 'Dica com teclado e mouse'),
  Badge('Neutro'), Badge('Ativo', 'positive'), Badge('Atenção', 'warning'),
);
controls.append(controlRow, Divider(), Checkbox('Checkbox acessível'), Toggle('Preferência local de demonstração'));

const fields = card('Campos de formulário');
const input = Input({ id: 'hbx-lab-input', label: 'Campo de texto', placeholder: 'Digite para testar o foco', helperText: 'Texto auxiliar associado ao campo.' });
const errorInput = Input({ id: 'hbx-lab-error', label: 'Exemplo de erro', error: 'Revise o conteúdo informado.' });
const textarea = TextArea('Texto longo', 'hbx-lab-textarea', 'Área redimensionável');
fields.append(input.element, errorInput.element, textarea.element);

const surfaces = card('Superfícies e tipografia');
const surfaceRow = document.createElement('div');
surfaceRow.className = 'hbx-lab__row';
const surfaceSamples: readonly [string, string][] = [['Sólida', 'solid'], ['Translúcida', 'translucent'], ['Vidro', 'glass']];
for (const [name, type] of surfaceSamples) {
  const sample = Surface();
  sample.dataset.surface = type;
  sample.classList.add('hbx-lab__surface-sample');
  sample.textContent = name;
  surfaceRow.append(sample);
}
const typeScale = document.createElement('p');
typeScale.textContent = 'Escala: caption · body-sm · body · heading-sm · heading · title';
typeScale.className = 'hbx-muted';
surfaces.append(surfaceRow, typeScale, Divider(), ScrollArea('hbx-lab__scroll'));

const windowsCard = card('Janela e camadas');
const windowActions = document.createElement('div');
windowActions.className = 'hbx-lab__row';
const openWindow = (id: string, label: string): void => {
  manager.open({ id, title: label, width: 380, height: 300 });
  updateStats();
};
const demoWindows: readonly [string, string][] = [['navigator-demo', 'Janela de exemplo'], ['settings-demo', 'Outra janela']];
for (const [id, label] of demoWindows) {
  windowActions.append(Button({ label: `Abrir: ${label}`, onClick: () => openWindow(id, label) }));
}
windowsCard.append(windowActions, document.createTextNode(' Arraste pela barra; Alt + setas move com teclado. A janela adapta a apresentação ao tamanho da tela.'));

const liveRoomCard = card('Chat real · Room Core');
const connection = new CoreConnection(__HABBUX_WS_URL__);
const coreStatus = document.createElement('p');
coreStatus.className = 'hbx-muted';
coreStatus.setAttribute('role', 'status');
const authForm = document.createElement('form');
authForm.className = 'hbx-lab__row';
const identity = Input({ id: 'hbx-live-identity', label: 'Usuário ou email' });
identity.input.autocomplete = 'username';
const password = Input({ id: 'hbx-live-password', label: 'Senha', type: 'password' });
password.input.autocomplete = 'current-password';
const login = Button({ label: 'Entrar' });
login.type = 'submit';
const logout = Button({ label: 'Sair' });
const connect = Button({ label: 'Conectar ao Core' });
const roomForm = document.createElement('form');
roomForm.className = 'hbx-lab__row';
const roomId = Input({ id: 'hbx-live-room', label: 'ID do quarto' });
roomId.input.inputMode = 'numeric';
roomId.input.value = '1';
const joinRoom = Button({ label: 'Entrar no quarto' });
joinRoom.type = 'submit';
const leaveRoom = Button({ label: 'Sair do quarto' });
const liveChatForm = document.createElement('form');
liveChatForm.className = 'hbx-lab__row';
const liveChatText = document.createElement('input');
liveChatText.className = 'hbx-input';
liveChatText.setAttribute('aria-label', 'Mensagem para o quarto');
liveChatText.placeholder = 'Mensagem do quarto';
liveChatText.maxLength = 128;
liveChatText.autocomplete = 'off';
liveChatText.classList.add('hbx-lab__chat-input');
const liveChatSend = Button({ label: 'Enviar' });
liveChatSend.type = 'submit';
liveChatForm.append(liveChatText, liveChatSend);
const liveChatLog = document.createElement('ol');
liveChatLog.className = 'hbx-chat-list';
liveChatLog.setAttribute('aria-live', 'polite');
liveRoomCard.append(coreStatus, connect, authForm, roomForm, liveChatLog, liveChatForm);
let previousRoomChat: CoreConnectionSnapshot['roomChat'] = [];
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
authForm.append(identity.element, password.element, login, logout);
roomForm.append(roomId.element, joinRoom, leaveRoom);
connect.addEventListener('click', () => {
  const state = connect.dataset.state;
  if (state === 'connected') connection.disconnect();
  else connection.connect();
});
authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const credential = password.input.value;
  password.input.value = '';
  void connection.login(identity.input.value, credential).catch((error: unknown) => {
    coreStatus.textContent = error instanceof Error ? error.message : 'Falha ao iniciar login.';
  });
});
logout.addEventListener('click', () => {
  void connection.logout().catch((error: unknown) => { coreStatus.textContent = error instanceof Error ? error.message : 'Falha ao sair da conta.'; });
});
roomForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try { connection.joinRoom(roomId.input.value); }
  catch (error) { coreStatus.textContent = error instanceof Error ? error.message : 'Falha ao entrar no quarto.'; }
});
leaveRoom.addEventListener('click', () => {
  try { connection.leaveRoom(); }
  catch (error) { coreStatus.textContent = error instanceof Error ? error.message : 'Falha ao sair do quarto.'; }
});
liveChatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    connection.chatRoom(liveChatText.value);
    liveChatText.value = '';
  } catch (error) { coreStatus.textContent = error instanceof Error ? error.message : 'Falha ao enviar mensagem.'; }
});
const unsubscribeConnection = connection.subscribe((snapshot) => renderCore(snapshot));

const overlayCard = card('Overlays e avisos');
const overlayActions = document.createElement('div');
overlayActions.className = 'hbx-lab__row';
const popoverTrigger = Button({ label: 'Popover', onClick: () => {
  if (disposePopover) {
    disposePopover();
    disposePopover = undefined;
    return;
  }
  const body = document.createElement('p');
  body.textContent = 'Conteúdo de popover em camada central.';
  disposePopover = Popover(overlays.popovers, popoverTrigger, body);
} });
const contextMenuButton = Button({ label: 'Menu de contexto' });
contextMenuButton.addEventListener('click', () => {
  disposeContextMenu?.();
  const rect = contextMenuButton.getBoundingClientRect();
  disposeContextMenu = ContextMenu(overlays.popovers, rect.left, rect.bottom, ['Ação de exemplo', 'Outra ação'], (index) => toastQueue.push(`Ação ${index + 1} selecionada.`));
});
overlayActions.append(
  Button({ label: 'Modal', onClick: () => {
    const message = document.createElement('p');
    message.textContent = 'Modal nativo com foco contido e fechamento por Escape.';
    openModal(overlays.popovers, Modal('Modal de demonstração', message));
  } }),
  popoverTrigger,
  contextMenuButton,
  Button({ label: 'Notificação', onClick: () => { toastQueue.push('Notificação temporária com limite de fila.'); updateStats(); } }),
  Button({ label: '20 notificações', onClick: () => { for (let index = 0; index < 20; index++) toastQueue.push(`Aviso de demonstração ${index + 1}`); updateStats(); } }),
);
overlayCard.append(overlayActions);

const chatCard = card('Chat protótipo local');
const chatHelp = document.createElement('p');
chatHelp.className = 'hbx-muted';
chatHelp.textContent = 'Demonstra limite e renderização como texto. O envio real continua no Room Core da tela de diagnóstico.';
const chatList = document.createElement('ol');
chatList.className = 'hbx-chat-list';
chatList.setAttribute('aria-label', 'Mensagens de demonstração');
const chatForm = document.createElement('form');
chatForm.className = 'hbx-lab__row';
const chatInput = document.createElement('input');
chatInput.className = 'hbx-input';
chatInput.maxLength = 128;
chatInput.setAttribute('aria-label', 'Mensagem de demonstração');
chatInput.placeholder = 'Escreva uma mensagem local';
chatInput.classList.add('hbx-lab__chat-input');
const chatSubmit = Button({ label: 'Enviar', tone: 'primary' });
chatSubmit.type = 'submit';
chatForm.append(chatInput, chatSubmit);
chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = '';
  chatHistory.add({ userId: '0', username: 'Visitante', message });
  renderPrototypeChat();
  scheduleBubbleCleanup();
  updateStats();
});
chatCard.append(chatHelp, chatList, chatForm);

const runtimeCard = card('Qualidade visual');
const qualityButton = Button({ label: 'Ativar qualidade reduzida', onClick: () => {
  selectedQuality = selectedQuality === 'high' ? 'reduced' : 'high';
  lab.dataset.hbxQuality = selectedQuality;
  qualityButton.textContent = selectedQuality === 'high' ? 'Ativar qualidade reduzida' : 'Ativar qualidade alta';
  updateStats();
} });
runtimeCard.append(qualityButton, stats);

const windowView = new WindowView(manager, overlays.windows, (_window, body) => {
  const demoText = document.createElement('p');
  demoText.className = 'hbx-muted';
  demoText.textContent = 'Conteúdo reutiliza a mesma janela em desktop, tablet e mobile.';
  body.replaceChildren(demoText, Button({ label: 'Notificar', onClick: () => toastQueue.push('Ação da janela concluída.') }));
});

const entries: readonly [string, string][] = [
  ['navigator-demo', 'Início'], ['chat-demo', 'Chat'], ['friends-demo', 'Amigos'],
  ['inventory-demo', 'Itens'], ['profile-demo', 'Perfil'], ['settings-demo', 'Config'],
];
for (const [id, label] of entries) toolbar.append(Button({ label, onClick: () => openWindow(id, `Protótipo · ${label}`) }));
const unsubscribeManager = manager.subscribe(updateStats);
updateStats();

const resizeObserver = new ResizeObserver(() => {
  manager.resizeViewport({ width: lab.clientWidth, height: lab.clientHeight });
  updateStats();
});
resizeObserver.observe(lab);
const onContextMenu = (event: MouseEvent): void => {
  if (event.target instanceof HTMLElement && event.target.closest('.hbx-lab')) {
    event.preventDefault();
    disposeContextMenu?.();
    disposeContextMenu = ContextMenu(overlays.popovers, event.clientX, event.clientY, ['Inspecionar protótipo', 'Fechar menu'], () => undefined);
  }
};
lab.addEventListener('contextmenu', onContextMenu);
const dispose = (): void => {
  resizeObserver.disconnect();
  lab.removeEventListener('contextmenu', onContextMenu);
  unsubscribeManager();
  windowView.dispose();
  disposePreview();
  toastQueue.dispose();
  if (bubbleTimer !== undefined) clearTimeout(bubbleTimer);
  unsubscribeConnection();
  connection.dispose();
  disposePopover?.();
  disposeContextMenu?.();
  overlays.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });
import.meta.hot?.dispose(dispose);

function viewportLabel(): string {
  const width = window.innerWidth;
  return width <= UI_BREAKPOINTS.mobile ? 'mobile' : width <= UI_BREAKPOINTS.tablet ? 'tablet' : 'desktop';
}

function renderCore(snapshot: CoreConnectionSnapshot): void {
  coreStatus.textContent = `${snapshot.state} · ${snapshot.authState} · ${snapshot.roomStatus}${snapshot.error ? ` · ${snapshot.error}` : ''}`;
  connect.dataset.state = snapshot.state === 'READY' ? 'connected' : 'disconnected';
  connect.textContent = snapshot.state === 'READY' ? 'Desconectar' : 'Conectar ao Core';
  const canLogin = snapshot.state === 'READY' && snapshot.authState === 'ANONYMOUS';
  identity.input.disabled = !canLogin;
  password.input.disabled = !canLogin;
  login.disabled = !canLogin;
  logout.hidden = snapshot.authState !== 'AUTHENTICATED';
  const canJoin = snapshot.state === 'READY' && snapshot.authState === 'AUTHENTICATED' && snapshot.roomStatus === 'NONE';
  roomId.input.disabled = !canJoin;
  joinRoom.disabled = !canJoin;
  leaveRoom.hidden = snapshot.roomStatus === 'NONE' || snapshot.roomStatus === 'JOINING';
  liveChatText.disabled = snapshot.roomStatus !== 'IN_ROOM';
  liveChatSend.disabled = snapshot.roomStatus !== 'IN_ROOM';
  if (snapshot.roomChat !== previousRoomChat) {
    const samePrefix = snapshot.roomChat.length >= previousRoomChat.length
      && previousRoomChat.every((item, index) => sameChat(item, snapshot.roomChat[index]));
    const rolledFullHistory = snapshot.room !== null && snapshot.roomChat.length === 50 && previousRoomChat.length === 50
      && previousRoomChat.slice(1).every((item, index) => sameChat(item, snapshot.roomChat[index]));
    if ((!samePrefix && !rolledFullHistory) || snapshot.room === null) liveChatHistory.clear();
    const start = samePrefix ? previousRoomChat.length : rolledFullHistory ? snapshot.roomChat.length - 1 : 0;
    for (const message of snapshot.roomChat.slice(start)) liveChatHistory.add({ userId: message.userId, username: message.username, message: message.text });
    previousRoomChat = snapshot.roomChat;
    renderLiveChat();
    scheduleBubbleCleanup();
  }
}

function sameChat(left: CoreConnectionSnapshot['roomChat'][number], right: CoreConnectionSnapshot['roomChat'][number] | undefined): boolean {
  return right !== undefined && left.userId === right.userId && left.text === right.text;
}

function renderLiveChat(): void {
  liveChatLog.replaceChildren(...liveChatHistory.list().map((bubble) => {
    const item = document.createElement('li');
    item.textContent = `${bubble.username}: ${bubble.message}`;
    item.dataset.userId = bubble.userId;
    item.dataset.timestamp = String(bubble.timestamp);
    item.dataset.expiresAt = String(bubble.expiresAt);
    return item;
  }));
  liveChatLog.scrollTop = liveChatLog.scrollHeight;
}

function renderPrototypeChat(): void {
  chatList.replaceChildren(...chatHistory.list().map((bubble) => {
    const item = document.createElement('li');
    item.textContent = `${bubble.username}: ${bubble.message}`;
    item.dataset.timestamp = String(bubble.timestamp);
    item.dataset.expiresAt = String(bubble.expiresAt);
    return item;
  }));
  chatList.scrollTop = chatList.scrollHeight;
}

function scheduleBubbleCleanup(): void {
  if (bubbleTimer !== undefined) clearTimeout(bubbleTimer);
  bubbleTimer = undefined;
  const bubbles = [...chatHistory.list(), ...liveChatHistory.list()];
  const earliest = bubbles.reduce((time, bubble) => Math.min(time, bubble.expiresAt), Infinity);
  if (Number.isFinite(earliest)) bubbleTimer = setTimeout(() => {
    bubbleTimer = undefined;
    renderLiveChat();
    renderPrototypeChat();
    updateStats();
    scheduleBubbleCleanup();
  }, Math.max(0, earliest - Date.now()));
}
