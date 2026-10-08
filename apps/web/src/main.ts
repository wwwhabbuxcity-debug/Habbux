import { CoreConnection } from '../../client/src/communication/core';
import './styles/main.css';
import './styles/login-layout.css';

type AuthMode = 'LOGIN' | 'REGISTER';
type ThemeId = 'neon-purple' | 'tropical-blue' | 'sunset-pink' | 'cosmic-blue' | 'emerald-garden' | 'desert-bazaar' | 'arctic-lodge' | 'underwater-coral' | 'arcade-district' | 'halloween-night' | 'easter-spring' | 'christmas-village' | 'carnival-night' | 'new-year-rooftop';
type LoginTheme = {
  theme: ThemeId; logoText: string; eyebrow: string; title: string; description: string; ctaText: string;
  ctaVisible: boolean; institutionalText: string; institutionalUrl: string; primaryColor: string;
  secondaryColor: string; buttonColor: string; glassOpacity: number; blurPixels: number; cardOpacity: number;
  glowIntensity: number; borderRadius: number; decorationsEnabled: boolean; assetUrl: string; version: number;
};

const $ = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector); if (!found) throw new Error(`Elemento CMS ausente: ${selector}`); return found;
};
const loginForm = $<HTMLFormElement>('#login-form'); const registerForm = $<HTMLFormElement>('#register-form');
const identifier = $<HTMLInputElement>('#login-identifier'); const loginPassword = $<HTMLInputElement>('#login-password');
const registerUsername = $<HTMLInputElement>('#register-username'); const registerEmail = $<HTMLInputElement>('#register-email'); const registerPassword = $<HTMLInputElement>('#register-password'); const registerConfirm = $<HTMLInputElement>('#register-confirm');
const title = $<HTMLElement>('#auth-title'); const subtitle = $<HTMLElement>('#auth-subtitle'); const feedback = $<HTMLElement>('#auth-feedback'); const switchMode = $<HTMLButtonElement>('#switch-mode'); const switchCopy = $<HTMLElement>('#switch-copy'); const loginSubmit = $<HTMLButtonElement>('#login-submit'); const registerSubmit = $<HTMLButtonElement>('#register-submit');
const themeArt = $<HTMLImageElement>('#theme-art'); const heroLogo = $<HTMLAnchorElement>('#hero-logo'); const cardLogo = $<HTMLAnchorElement>('#card-logo'); const heroEyebrow = $<HTMLElement>('#hero-eyebrow'); const heroTitle = $<HTMLElement>('#hero-title'); const heroDescription = $<HTMLElement>('#hero-description'); const heroCta = $<HTMLButtonElement>('#hero-cta'); const heroCtaText = $<HTMLElement>('#hero-cta-text'); const institutionalLink = $<HTMLAnchorElement>('#institutional-link');
const connection = new CoreConnection(__HABBUX_WS_URL__, 3); let mode: AuthMode = 'LOGIN';
const knownThemes = new Set<ThemeId>(['neon-purple', 'tropical-blue', 'sunset-pink', 'cosmic-blue', 'emerald-garden', 'desert-bazaar', 'arctic-lodge', 'underwater-coral', 'arcade-district', 'halloween-night', 'easter-spring', 'christmas-village', 'carnival-night', 'new-year-rooftop']);

function setFeedback(message: string, kind: 'error' | 'success' = 'error'): void { feedback.textContent = message; feedback.dataset.kind = kind; }
function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void { button.disabled = busy; button.textContent = busy ? 'AGUARDE…' : label; loginSubmit.disabled = busy; registerSubmit.disabled = busy; }
function waitForCoreReady(timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false; let timer: ReturnType<typeof setTimeout> | null = null; let unsubscribe = (): void => undefined;
    const finish = (callback: () => void): void => { if (finished) return; finished = true; if (timer !== null) clearTimeout(timer); unsubscribe(); callback(); };
    connection.connect(); unsubscribe = connection.subscribe((snapshot) => { if (snapshot.state === 'READY') finish(resolve); else if (snapshot.state === 'DISCONNECTED' && snapshot.error) finish(() => reject(new Error(snapshot.error!))); });
    if (finished) unsubscribe(); else timer = setTimeout(() => finish(() => { connection.disconnect(); reject(new Error('A conexão com o Habbux demorou para ficar pronta. Tente novamente.')); }), timeoutMs);
  });
}
function renderMode(next: AuthMode): void {
  mode = next; const login = next === 'LOGIN'; loginForm.hidden = !login; registerForm.hidden = login;
  title.textContent = login ? 'Bem-vindo de volta' : 'Crie sua conta'; subtitle.textContent = login ? 'Entre na sua conta para continuar' : 'Comece sua jornada no Habbux'; switchCopy.textContent = login ? 'Novo no Habbux?' : 'Já possui uma conta?'; switchMode.textContent = login ? 'CRIAR UMA CONTA' : 'ENTRAR'; setFeedback(''); (login ? identifier : registerUsername).focus();
}
function errorMessage(category: string): string { return ({ INVALID_REQUEST: 'Confira os dados informados.', REJECTED: 'Não foi possível autenticar com esses dados.', RATE_LIMITED: 'Muitas tentativas. Aguarde e tente novamente.', UNAVAILABLE: 'O serviço está temporariamente indisponível.' } as Record<string, string>)[category] ?? 'Não foi possível concluir a operação.'; }
function createGameHandoff(): { channel: BroadcastChannel; gameWindow: Window | null; send: (username: string, password: string) => void; close: () => void } | null {
  const channelId = crypto.randomUUID().replaceAll('-', ''); const channel = new BroadcastChannel(`habbux-sso-${channelId}`); const gameUrl = new URL('/game/', window.location.origin); gameUrl.searchParams.set('sso', channelId); const gameWindow = window.open(gameUrl, '_blank'); if (!gameWindow) { channel.close(); return null; }
  let ready = false; let credentials: { username: string; password: string } | null = null;
  const send = (username: string, password: string): void => { credentials = { username, password }; if (ready && credentials) { channel.postMessage({ type: 'credentials', ...credentials }); credentials.password = ''; credentials = null; } };
  channel.onmessage = (event: MessageEvent<{ type?: string }>): void => { if (event.data?.type === 'ready') { ready = true; if (credentials) { channel.postMessage({ type: 'credentials', ...credentials }); credentials.password = ''; credentials = null; } } };
  return { channel, gameWindow, send, close: () => { credentials = null; channel.close(); } };
}

function themeIsSafe(value: unknown): value is LoginTheme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Partial<LoginTheme>;
  return typeof theme.theme === 'string' && knownThemes.has(theme.theme as ThemeId) && typeof theme.assetUrl === 'string'
    && typeof theme.logoText === 'string' && typeof theme.title === 'string' && typeof theme.description === 'string'
    && typeof theme.primaryColor === 'string' && /^#[0-9A-F]{6}$/i.test(theme.primaryColor)
    && typeof theme.secondaryColor === 'string' && /^#[0-9A-F]{6}$/i.test(theme.secondaryColor)
    && typeof theme.buttonColor === 'string' && /^#[0-9A-F]{6}$/i.test(theme.buttonColor);
}
function applyTheme(theme: LoginTheme): void {
  document.documentElement.dataset.theme = theme.theme;
  document.documentElement.style.setProperty('--primary', theme.primaryColor); document.documentElement.style.setProperty('--secondary', theme.secondaryColor); document.documentElement.style.setProperty('--button', theme.buttonColor); document.documentElement.style.setProperty('--glass', String(theme.glassOpacity)); document.documentElement.style.setProperty('--blur', `${theme.blurPixels}px`); document.documentElement.style.setProperty('--card', String(theme.cardOpacity)); document.documentElement.style.setProperty('--glow', String(theme.glowIntensity)); document.documentElement.style.setProperty('--radius', `${theme.borderRadius}px`);
  const logo = `${theme.logoText}`; heroLogo.firstChild!.textContent = logo; cardLogo.firstChild!.textContent = logo; heroEyebrow.textContent = theme.eyebrow; heroTitle.textContent = theme.title; heroDescription.textContent = theme.description; heroCtaText.textContent = theme.ctaText; heroCta.hidden = !theme.ctaVisible;
  institutionalLink.hidden = !theme.institutionalText || !theme.institutionalUrl; institutionalLink.textContent = theme.institutionalText; institutionalLink.href = theme.institutionalUrl;
  document.documentElement.classList.toggle('decorations-off', !theme.decorationsEnabled);
  const fallback = `/themes/${theme.theme}.webp`; themeArt.onerror = () => { if (themeArt.src.endsWith(fallback)) return; themeArt.src = fallback; }; themeArt.src = theme.assetUrl;
}
async function loadTheme(): Promise<void> {
  const requested = new URLSearchParams(window.location.search).get('preview'); const preview = requested && knownThemes.has(requested as ThemeId) ? requested : null;
  const endpoint = preview ? `/login-theme/v1/preview/${preview}` : '/login-theme/v1/active'; const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 3_000);
  try { const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal }); const data: unknown = await response.json(); if (response.ok && themeIsSafe(data)) applyTheme(data); }
  catch { /* The bundled Neon theme remains usable when the presentation endpoint is unavailable. */ }
  finally { window.clearTimeout(timeout); }
}

loginForm.addEventListener('submit', (event) => { event.preventDefault(); if (!identifier.value.trim() || !loginPassword.value) { setFeedback('Informe seu usuário e senha.'); return; } const handoff = createGameHandoff(); if (!handoff) { setFeedback('Permita a abertura de uma nova aba para entrar no jogo.'); return; } setBusy(loginSubmit, true, 'ENTRAR'); const credentialText = loginPassword.value; loginPassword.value = ''; void (async () => { try { await waitForCoreReady(); const result = await connection.login(identifier.value.trim(), credentialText); if (!result.ok) { handoff.gameWindow?.close(); handoff.close(); setFeedback(errorMessage(result.category)); return; } handoff.send(result.username, credentialText); setFeedback('Login aprovado. O jogo foi aberto em uma nova aba.', 'success'); } catch (cause) { handoff.gameWindow?.close(); handoff.close(); setFeedback(cause instanceof Error ? cause.message : 'Não foi possível conectar ao Habbux.'); } finally { setBusy(loginSubmit, false, 'ENTRAR'); } })(); });
registerForm.addEventListener('submit', (event) => { event.preventDefault(); if (!registerForm.reportValidity()) return; if (registerPassword.value !== registerConfirm.value) { setFeedback('As senhas não coincidem.'); registerConfirm.focus(); return; } setBusy(registerSubmit, true, 'CRIAR CONTA'); const credentialText = registerPassword.value; void connection.register(registerUsername.value.trim(), registerEmail.value.trim(), credentialText).then((result) => { if (!result.ok) { setFeedback(errorMessage(result.category)); return; } return connection.logout().then(() => { identifier.value = registerUsername.value.trim(); registerPassword.value = ''; registerConfirm.value = ''; renderMode('LOGIN'); setFeedback('Conta criada com sucesso. Agora entre para jogar.', 'success'); }); }).catch(() => setFeedback('Não foi possível criar sua conta.')).finally(() => setBusy(registerSubmit, false, 'CRIAR CONTA')); });
switchMode.addEventListener('click', () => renderMode(mode === 'LOGIN' ? 'REGISTER' : 'LOGIN'));
document.querySelectorAll<HTMLButtonElement>('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => { const field = document.getElementById(button.dataset.passwordToggle ?? '') as HTMLInputElement | null; if (!field) return; const show = field.type === 'password'; field.type = show ? 'text' : 'password'; button.textContent = show ? 'Ocultar' : 'Mostrar'; button.setAttribute('aria-label', `${show ? 'Ocultar' : 'Mostrar'} senha`); }));
heroCta.addEventListener('click', () => { identifier.focus({ preventScroll: false }); }); if (new URLSearchParams(window.location.search).get('mode') === 'register') renderMode('REGISTER'); connection.connect(); void loadTheme(); window.addEventListener('pagehide', () => connection.dispose());
