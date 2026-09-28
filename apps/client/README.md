# Habbux Client

Bootstrap TypeScript strict + PixiJS 8, build Vite. Uma codebase para desktop,
tablet e mobile. Não há gameplay, conexão WebSocket, autenticação ou assets externos.

Na raiz do repositório, com Node 22 e npm 10:

```sh
npm ci
# Copie .env.example para .env e ajuste CLIENT_DEV_PORT para uso local.
npm run client:dev
npm run client:typecheck
nice -n 19 env NODE_OPTIONS=--max-old-space-size=512 RAYON_NUM_THREADS=1 npm run client:build
```

O build gera `apps/client/dist`, publicado em `/client/`. O servidor de
desenvolvimento escuta somente loopback; nunca é o servidor de produção.
As portas de desenvolvimento são lidas de `.env` na raiz (ou do ambiente).
Sem configuração explícita, vale o padrão do Vite; `strictPort` evita troca silenciosa.

O bootstrap desenha uma forma original para validar o renderer. Usa WebGL
preferencialmente, DPR limitado a 2, indicação de GPU de baixo consumo e nenhum
loop de renderização ocioso. Redesenha na mudança de viewport/visibilidade e
informa indisponibilidade gráfica em texto acessível. Não restringe zoom da
página nem inventa um fallback de gameplay. Não envia dados a serviços externos.
O adaptador oficial `pixi.js/unsafe-eval`, apesar do nome, substitui as operações
que usam eval e permite `script-src 'self'` sem liberar `unsafe-eval`. CSS externo
dimensiona o canvas; `autoDensity: false` evita estilos inline de dimensionamento.

`skipLibCheck` evita validar definições internas de dependências; todo código
Habbux é verificado em modo estrito. TypeScript 6.0.3 mantém o compilador JS e
permite limitar heap; atualizações major exigem revisão. Vite e PixiJS possuem
versões exatas no manifesto e dependências transitivas no lockfile raiz.

## Limites dos módulos

| Limite | Responsabilidade futura |
| --- | --- |
| `bootstrap/` | Composição, ciclo de vida e falha de inicialização |
| `renderer/` | Pixi, desenho e descarte explícito de recursos GPU |
| `styles/` | Estilos adaptativos da página mínima |
| `core/` | Ciclo de vida compartilhado, somente quando houver uso real |
| `communication/` | Transporte binário e limites de backpressure |
| `protocol/` | Codecs derivados de `packages/protocol`, sem IDs duplicados |
| `assets/` | Carregamento HBX, cache limitado e integridade |
| `input/` | Intenções de mouse, teclado e touch sem alterar estado autoritativo |
| `components/`, `layouts/`, `views/` | Interface, disposição adaptativa e composição de telas |
| `stores/` | Projeção local do estado recebido do servidor |
| `services/`, `events/` | Casos de uso locais e eventos com ciclo de vida explícito |
| `localization/`, `utils/` | Traduções e utilidades pequenas com uso comprovado |

Somente os três primeiros diretórios têm implementação nesta etapa. Os demais
são limites conceituais documentados, sem classes ou pastas vazias artificiais.
O renderer terá limites `room`, `avatar`, `furniture`, `animation`, `camera` e
`sorting` quando esses módulos forem implementados. Nenhum deles define regras
autoritativas de jogo. Consulte `docs/architecture/CLIENT-MULTIPLATFORM.md`.

Documentação das bibliotecas:
[Pixi Application](https://pixijs.com/8.x/guides/components/application),
[Vite](https://vite.dev/guide/).
