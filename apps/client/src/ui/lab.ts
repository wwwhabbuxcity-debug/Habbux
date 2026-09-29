import { Badge, Button, Checkbox, Divider, IconButton, Input, ScrollArea, Surface, TextArea, Toggle, Tooltip } from './primitives';
import { ChatHistory } from './chat-history';
import { ContextMenu, createOverlayLayers, Modal, openModal, Popover, ToastQueue } from './overlays';
import { WindowView } from './window-view';
import { UI_BREAKPOINTS, WindowManager } from './window-manager';
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
const grid = document.createElement('div');
grid.className = 'hbx-lab__grid';
lab.append(heading, grid);

const overlays = createOverlayLayers(lab);
const manager = new WindowManager({ width: lab.clientWidth, height: lab.clientHeight });
const chatHistory = new ChatHistory(50, 45_000);
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
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
  stats.textContent = `Janelas: ${manager.list().length} · Notificações: ${toastQueue.list().length} · Mensagens: ${chatHistory.list().length} · Nós DOM: ${lab.querySelectorAll('*').length} · Qualidade: ${selectedQuality.toUpperCase()} · ${viewportLabel()}`;
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
  sample.style.padding = 'var(--hbx-space-4)';
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
windowsCard.append(windowActions, document.createTextNode(' Arraste pela barra; Alt + setas move com teclado. Redimensione a janela para validar apresentação adaptativa.'));

const overlayCard = card('Overlays e avisos');
const overlayActions = document.createElement('div');
overlayActions.className = 'hbx-lab__row';
const popoverTrigger = Button({ label: 'Popover', onClick: () => {
  disposePopover?.();
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
chatHelp.textContent = 'Demonstra limite e renderização como texto; o envio fica apenas nesta sessão de desenvolvimento.';
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
chatInput.style.flex = '1 1 12rem';
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
  toastQueue.dispose();
  if (bubbleTimer !== undefined) clearTimeout(bubbleTimer);
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
  const earliest = chatHistory.list().reduce((time, bubble) => Math.min(time, bubble.expiresAt), Infinity);
  if (Number.isFinite(earliest)) bubbleTimer = setTimeout(() => {
    bubbleTimer = undefined;
    renderPrototypeChat();
    updateStats();
    scheduleBubbleCleanup();
  }, Math.max(0, earliest - Date.now()));
}
