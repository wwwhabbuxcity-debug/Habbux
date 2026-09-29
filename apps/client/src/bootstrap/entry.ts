const isUiLab = import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-lab');
if (isUiLab) await import('../ui/lab');
else await import('./main');
