import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'CLIENT_');
  const configuredPort = process.env.CLIENT_DEV_PORT ?? env.CLIENT_DEV_PORT;
  const defaultWsUrl = mode === 'production' ? 'wss://tyvo.online/ws' : 'ws://127.0.0.1:3100/ws';
  const wsUrl = process.env.CLIENT_WS_URL ?? env.CLIENT_WS_URL ?? defaultWsUrl;
  const port = configuredPort === undefined ? undefined : Number(configuredPort);
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error('CLIENT_DEV_PORT deve ser inteiro entre 1024 e 65535.');
  }
  let parsedWsUrl;
  try { parsedWsUrl = new URL(wsUrl); }
  catch { throw new Error('CLIENT_WS_URL deve ser uma URL WebSocket válida.'); }
  if (!['ws:', 'wss:'].includes(parsedWsUrl.protocol) || parsedWsUrl.pathname !== '/ws' || parsedWsUrl.username || parsedWsUrl.password || parsedWsUrl.search || parsedWsUrl.hash) {
    throw new Error('CLIENT_WS_URL deve usar ws:// ou wss:// e terminar em /ws.');
  }
  if (mode === 'production' && parsedWsUrl.protocol !== 'wss:') {
    throw new Error('O build de produção precisa usar wss:// no WebSocket.');
  }
  return {
    base: '/client/',
    envDir,
    server: { host: '127.0.0.1', strictPort: true, ...(port === undefined ? {} : { port }) },
    build: { target: 'es2022', sourcemap: false },
    define: { __HABBUX_WS_URL__: JSON.stringify(wsUrl) },
  };
});
