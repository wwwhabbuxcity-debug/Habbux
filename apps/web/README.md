# Habbux Web

Página mínima de desenvolvimento. HTML sem framework de UI e TypeScript strict
para a entrada do build. Vite gera arquivos estáticos para servir em `/`.
Conteúdo e navegação continuam legíveis sem JavaScript.

Na raiz, depois de `npm ci`:

```sh
npm run web:dev
npm run web:typecheck
nice -n 19 env NODE_OPTIONS=--max-old-space-size=512 RAYON_NUM_THREADS=1 npm run web:build
```

`WEB_DEV_PORT` vem de `.env` na raiz (copie `.env.example`) ou do ambiente.
Sem configuração explícita, vale o padrão do Vite; `strictPort` evita troca silenciosa.

`src/main.ts` é o ponto de entrada; `src/styles/` contém os estilos. Não há login,
sessões, analytics, chamadas de rede, fontes remotas ou estado de jogo. A página
leva a `/client/`; em desenvolvimento local os dois apps usam servidores Vite
separados, e esse link pressupõe a publicação integrada pelo nginx.

Futuras necessidades Web/API passam por contratos em `services/api` e
`packages/schemas`. Web nunca importará estado interno do Emulator nem acessará
o banco diretamente. Rotas, componentes e integrações só serão criados quando
existir funcionalidade aprovada. O layout atual é provisório, não a UI definitiva.
