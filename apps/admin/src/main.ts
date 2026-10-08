import './styles.css';

type Settings = { hotelName: string; motd: string; registrationsEnabled: boolean; maintenanceEnabled: boolean };
type Overview = { settings: Settings; server: { activeConnections: number; activeSessions: number; activeRooms: number; activeRoomUsers: number } };
type ApiError = { error?: { message?: string } };

const element = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Elemento ausente: ${selector}`);
  return found;
};
const form = element<HTMLFormElement>('#settings-form');
const nameInput = element<HTMLInputElement>('#hotel-name');
const motdInput = element<HTMLTextAreaElement>('#motd');
const registrationsInput = element<HTMLInputElement>('#registrations-enabled');
const maintenanceInput = element<HTMLInputElement>('#maintenance-enabled');
const refreshButton = element<HTMLButtonElement>('#refresh');
const saveButton = element<HTMLButtonElement>('#save');
const saveState = element<HTMLElement>('#save-state');
const feedback = element<HTMLElement>('#feedback');

function feedbackMessage(message: string, kind: 'error' | 'success' | 'info' = 'info'): void { feedback.textContent = message; feedback.dataset.kind = kind; }
function setBusy(busy: boolean): void { saveButton.disabled = busy; refreshButton.disabled = busy; saveButton.textContent = busy ? 'Salvando…' : 'Salvar alterações'; }
function populate(settings: Settings): void { nameInput.value = settings.hotelName; motdInput.value = settings.motd; registrationsInput.checked = settings.registrationsEnabled; maintenanceInput.checked = settings.maintenanceEnabled; }
function setMetric(selector: string, value: number): void { element<HTMLElement>(selector).textContent = String(value); }
async function parseResponse<T>(response: Response): Promise<T> { const data = await response.json() as T & ApiError; if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível concluir a operação.'); return data; }

async function load(): Promise<void> {
  setBusy(true); saveState.textContent = 'Atualizando';
  try {
    const overview = await parseResponse<Overview>(await fetch('/admin-api/v1/overview', { cache: 'no-store' }));
    populate(overview.settings); setMetric('#active-connections', overview.server.activeConnections); setMetric('#active-sessions', overview.server.activeSessions); setMetric('#active-rooms', overview.server.activeRooms); setMetric('#active-users', overview.server.activeRoomUsers);
    saveState.textContent = 'Dados atualizados'; feedbackMessage('');
  } catch (error) { saveState.textContent = 'Indisponível'; feedbackMessage(error instanceof Error ? error.message : 'Não foi possível carregar o painel.', 'error'); }
  finally { setBusy(false); }
}

form.addEventListener('submit', (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  setBusy(true); saveState.textContent = 'Salvando';
  const body = new URLSearchParams({ hotelName: nameInput.value, motd: motdInput.value, registrationsEnabled: String(registrationsInput.checked), maintenanceEnabled: String(maintenanceInput.checked) });
  void (async () => {
    try {
      const settings = await parseResponse<Settings>(await fetch('/admin-api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }));
      populate(settings); saveState.textContent = 'Salvo agora'; feedbackMessage('Configuração salva e aplicada.', 'success'); await load();
    } catch (error) { saveState.textContent = 'Não salvo'; feedbackMessage(error instanceof Error ? error.message : 'Não foi possível salvar a configuração.', 'error'); }
    finally { setBusy(false); }
  })();
});
refreshButton.addEventListener('click', () => { void load(); });
void load();
