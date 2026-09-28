import { mountPreview } from '../renderer/preview';
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

if (!viewport || !status || !connectionState || !sessionId || !rtt || !emulatorStatus || !connectionError || !toggle || !endpoint) {
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
};

ui.endpoint.textContent = __HABBUX_WS_URL__;
const connection = new CoreConnection(__HABBUX_WS_URL__);

function renderConnection(snapshot: CoreConnectionSnapshot): void {
  ui.connectionState.textContent = snapshot.state;
  ui.sessionId.textContent = snapshot.sessionId ? formatSessionId(snapshot.sessionId) : '—';
  ui.rtt.textContent = snapshot.rttMs === null ? 'Aguardando primeiro PING…' : `${snapshot.rttMs} ms`;
  const ready = snapshot.state === 'READY';
  ui.emulatorStatus.textContent = ready ? 'ONLINE' : ['CONNECTING', 'HANDSHAKING', 'RECONNECTING'].includes(snapshot.state) ? 'CONECTANDO' : 'OFFLINE';
  ui.emulatorStatus.className = `badge ${ready ? 'badge-online' : 'badge-offline'}`;
  ui.toggle.textContent = ready || ['CONNECTING', 'HANDSHAKING', 'RECONNECTING'].includes(snapshot.state)
    ? 'Desconectar' : 'Conectar ao Emulator';
  ui.connectionError.textContent = snapshot.error ?? '';
}

const unsubscribe = connection.subscribe(renderConnection);
ui.toggle.addEventListener('click', () => {
  if (['CONNECTING', 'HANDSHAKING', 'READY', 'RECONNECTING'].includes(ui.connectionState.textContent ?? '')) connection.disconnect();
  else connection.connect();
});

let disposePreview = (): void => undefined;
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) { unsubscribe(); connection.dispose(); disposePreview(); }
});
import.meta.hot?.dispose(() => { unsubscribe(); connection.dispose(); disposePreview(); });

try {
  disposePreview = await mountPreview(viewport, status);
  connection.connect();
} catch {
  status.textContent = 'A prévia gráfica não está disponível neste dispositivo. Você pode continuar pelo site.';
  viewport.hidden = true;
  connection.connect();
}

function formatSessionId(value: string): string {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
