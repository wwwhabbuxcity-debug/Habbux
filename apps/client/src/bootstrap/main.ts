import { mountPreview } from '../renderer/preview';
import '../styles/main.css';

const viewport = document.querySelector<HTMLElement>('#viewport');
const status = document.querySelector<HTMLElement>('#renderer-status');

if (!viewport || !status) {
  throw new Error('Client bootstrap: required elements were not found.');
}

try {
  const dispose = await mountPreview(viewport, status);
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) dispose();
  });
  import.meta.hot?.dispose(dispose);
} catch {
  status.textContent = 'A prévia gráfica não está disponível neste dispositivo. Você pode continuar pelo site.';
  viewport.hidden = true;
}
