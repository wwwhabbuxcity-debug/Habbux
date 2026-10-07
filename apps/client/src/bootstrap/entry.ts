const isUiLab = import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-lab');
const isPlayerGame = window.location.pathname === '/game' || window.location.pathname === '/game/';
try {
  if (isPlayerGame) await import('./player');
  else if (isUiLab) await import('../ui/lab');
  else await import('./main');
} catch (cause) {
  const message = cause instanceof Error ? cause.message : 'erro desconhecido';
  console.error('[Habbux][game]', { stage: 'BOOT_FAILED', cause: message });
  const heading = document.createElement('h1');
  heading.textContent = 'Não foi possível iniciar o Game.';
  const detail = document.createElement('p');
  detail.textContent = import.meta.env.DEV ? message : 'Atualize a página e tente novamente.';
  document.body.replaceChildren(heading, detail);
}
