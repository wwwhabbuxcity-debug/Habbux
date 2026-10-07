const isUiLab = import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-lab');
const isPlayerGame = window.location.pathname === '/game' || window.location.pathname === '/game/';
if (isPlayerGame) await import('./player');
else if (isUiLab) await import('../ui/lab');
else await import('./main');
