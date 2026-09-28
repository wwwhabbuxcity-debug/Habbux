# Client

Uma codebase TypeScript com PixiJS 8 como camada gráfica de baixo nível.
Vite prepara desenvolvimento e build; npm workspaces organiza os projetos sob
Node 22. A fundação mostra apenas uma página/canvas mínimo, sem gameplay.

## Responsabilidades

| Área | Limite |
|---|---|
| `bootstrap` | Inicializar configuração, renderer e descarte dos recursos |
| `core` | Ciclo de vida e composição; sem estado global irrestrito |
| `communication`, `protocol` | Transporte futuro e contratos originados de `packages/protocol` |
| `renderer` | Cena, câmera, sorting, animações e futura apresentação de entidades |
| `assets` | Carregamento, cache com limites e descarte de HBX/texturas |
| `input` | Normalizar mouse, teclado, touch e gestos em intenções |
| `components`, `layouts`, `views`, `styles` | Interface adaptativa e acessível |
| `stores`, `events` | Projeções do estado recebido e eventos locais com posse definida |
| `services` | Adaptadores de APIs e recursos externos |
| `localization` | Textos e formatos independentes das regras de jogo |
| `utils` | Funções pequenas sem dependência oculta de ambiente |

As áreas são limites de crescimento. Não exigem classes, stores ou interfaces
vazias nesta etapa. PixiJS não precisa controlar formulário, navegação textual ou
acessibilidade que o DOM possa oferecer de forma mais adequada.

## Autoridade e atualização

O servidor decide regras, permissões, saldos e propriedade. O Client apresenta
projeções e envia intenções. Predição visual futura precisa de reconciliação; nunca
vira confirmação de compra, movimento permitido ou ação autorizada.

Rede não altera objetos gráficos diretamente. Mensagens validadas atualizam uma
projeção e o renderer consome mudanças. Frame rate e frequência de eventos de rede
são independentes; não enviar mensagem nem fazer consulta de API a cada frame.
Relógio visual não é relógio de autoridade do jogo.

## Renderização e recursos

Carregar assets sob demanda, limitar cache e liberar referências e texturas quando
a cena deixa de usá-las. Definir dono de listeners, timers e recursos GPU para
permitir descarte. Considerar perda/restauração de contexto gráfico, aba oculta,
redução de trabalho visual e limites de resolução.

Somente HBX é o destino nativo planejado. Não incorporar interpretador SWF/Nitro
ao runtime. Formatos de importação pertencem ao pipeline offline.

## Build e verificação

TypeScript estrito e build separado permitem encontrar contratos inválidos antes
da publicação. O lockfile npm fixa a resolução das dependências; CI usa instalação
reproduzível. Qualquer configuração entregue ao navegador é pública: não colocar
tokens privados, senhas de banco ou chaves de serviço em variáveis do frontend.

Ver [multiplataforma](CLIENT-MULTIPLATFORM.md),
[testes](TESTING.md) e [orçamento de performance](../performance/PERFORMANCE-BUDGET.md).
