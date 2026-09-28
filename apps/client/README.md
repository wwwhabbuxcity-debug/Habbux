# Habbux Client

Bootstrap TypeScript estrito + PixiJS 8 com codec binário e conexão WebSocket
para o Core v1. A interface de diagnóstico mostra estado, sessão anônima e RTT;
não há login nem gameplay. Uma única codebase atende desktop, tablet e mobile.

Na raiz do repositório, com Node 22 e npm 10:

```sh
npm ci
npm run client:dev
npm run client:typecheck
npm run protocol:test
nice -n 19 env NODE_OPTIONS=--max-old-space-size=512 RAYON_NUM_THREADS=1 npm run client:build
```

O endpoint público do client é configuração de build, nunca domínio fixo no
source. `.env.example` usa `CLIENT_WS_URL=ws://127.0.0.1:3100/ws`; para uma
instalação WSS futura, altere o valor do ambiente do build para a URL externa
com caminho `/ws`. Vite injeta somente essa URL pública e valida esquema/path.
Não coloque segredo nessa variável.

O client envia `CLIENT_HELLO` após o upgrade, só marca READY após `SERVER_HELLO`,
e então mede RTT por ping de aplicação com sequência uint32. Reconexão é
exponencial e limitada a oito tentativas; pode ser desativada pela API da
conexão, e o botão manual permite iniciar novamente. Timeout de resposta de ping
encerra a conexão para que o backoff atue. `npm run protocol:test` e os testes Java
consomem os mesmos vetores binários de `packages/protocol`.

O bootstrap desenha uma forma original para validar o renderer. Usa WebGL
preferencialmente, DPR limitado a 2, indicação de GPU de baixo consumo e nenhum
loop de renderização ocioso. O canvas se mantém abaixo do painel Core e CSS
reorganiza os indicadores em telas pequenas. O client não envia dados a serviços
externos.

`communication/core.ts` contém o framing, conexão e reconexão realmente usados;
`renderer/` segue isolado do transporte. Vite escuta somente loopback em
desenvolvimento. TypeScript 6.0.3 mantém o compilador estrito, e Vite/PixiJS têm
versões exatas nos manifests e lockfile raiz.
