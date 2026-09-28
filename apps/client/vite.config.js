import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'CLIENT_DEV_');
  const configuredPort = process.env.CLIENT_DEV_PORT ?? env.CLIENT_DEV_PORT;
  const port = configuredPort === undefined ? undefined : Number(configuredPort);
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new Error('CLIENT_DEV_PORT deve ser inteiro entre 1024 e 65535.');
  }
  return {
    base: '/client/',
    envDir,
    server: { host: '127.0.0.1', strictPort: true, ...(port === undefined ? {} : { port }) },
    build: { target: 'es2022', sourcemap: false },
  };
});
