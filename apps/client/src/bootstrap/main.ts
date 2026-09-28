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

if (!viewport || !status || !connectionState || !sessionId || !rtt || !emulatorStatus || !connectionError || !toggle || !endpoint
    || !authState || !userId || !authenticatedUsername || !authForm || !authIdentifier || !registerUsername
    || !registerEmail || !authPassword || !loginButton || !registerButton || !logoutButton || !authStatus) {
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
