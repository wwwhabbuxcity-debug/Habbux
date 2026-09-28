import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'WEB_DEV_');
  const configuredPort = process.env.WEB_DEV_PORT ?? env.WEB_DEV_PORT;
  const port = configuredPort === undefined ? undefined : Number(configuredPort);
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error('WEB_DEV_PORT deve ser inteiro entre 1024 e 65535.');
  }
  return {
    base: '/',
    envDir,
    server: { host: '127.0.0.1', strictPort: true, ...(port === undefined ? {} : { port }) },
    build: { target: 'es2022', sourcemap: false },
  };
});
