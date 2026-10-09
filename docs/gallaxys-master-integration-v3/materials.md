# Materiais de superfícies V4

Sistema original compartilhado `renderer/room-materials.ts`, integrado a
`room-surfaces.ts` e `RoomRenderer`, sem copiar recursos Gallaxys.
Cada material define ID, cor principal/secundária, opacidade, repetição em unidades
do quarto, iluminação por face, acabamento plain/trimmed e textura procedural
opcional. Geometria define altura/espessura de parede, espessura de piso e paredes
ligadas/desligadas. Valores são limitados e validados; a configuração é copiada
antes de instalação, impedindo mutação externa sem reconstrução.

## Uso real

`RoomRenderer.setMaterials(configuration)` valida, ajusta a câmera e reconstrói
as superfícies estáticas uma vez. `setStyle(style)` preserva compatibilidade com
V3 e o diagnóstico `cacheBackground`. `DEFAULT_ROOM_MATERIALS` fornece a base;
`{ ...DEFAULT_ROOM_MATERIALS, floor: { ...DEFAULT_ROOM_MATERIALS.floor,
mainColor: 0xc7a67e, repeatScale: 2 }, wall: { ...DEFAULT_ROOM_MATERIALS.wall,
finish: 'plain' } }` é uma configuração utilizável diretamente.
O laboratório integra esses métodos; `diagnostics().materials` revela configuração
resolvida, `geometryBuildMs` mede a última construção, `spriteCount` conta sprites
reais e `textureSourceCount` conta fontes únicas desses sprites (não inclui caches
internos Pixi). Não atribuir essa última métrica a memória GPU.

Boards/slabs têm juntas alinhadas ao mundo e repetição independente do zoom;
grain/panels são vetores estáticos. A ausência de `texture` produz material liso.
Cor secundária controla juntas/grão; principal controla faces e iluminação.
Opacidade é aplicada a faces e detalhes. Plain retira acabamento de borda/rodapé.
Altura/espessura usam a projeção compartilhada, sem deslocar pés de avatares ou
alterar polígonos de interação. Caps de junções, recessos, elevação, faces externas
e sorting V3 foram preservados. Texturas/sprites por tile não foram adicionados.
Graphics continuam retidos pela GPU e só são reconstruídos em troca de geometria,
viewport ou material. Receber movimento não chama `setMaterials`.

## Direitos e limites

Padrões procedurais próprios: **AUTHORIZED**, origem declarada Habbux original.
Texturas externas Gallaxys: **UNKNOWN/REFERENCE_ONLY/BLOCKED**, bloqueadas para integração.
O validador rejeita os três estados. Esta versão suporta descritores procedurais,
não importa nem carrega imagens externas. A autorização de um descritor não
comprova automaticamente licença de imagem; nenhum loader de URL foi criado.
Sem cache novo global/ilimitado. Cache bitmap mantém o padrão V3 false; comparação
A/B e custo GPU pertencem às medições do laboratório, não a uma promessa de ganho.

## Validação

Node 22 portátil, `nice -n 19`, testes materiais + isometric-world-v2: **33 PASS**.
Primeira rodada: **4 PASS / 1 FAIL**, fixture tentou ler uma face inexistente de
tile interno; corrigido para conferir face externa elevada sem mudar geometria.
Testes verificam direitos, limites, isolamento por cópia, iluminação, vértices/depth
invariantes e enquadramento usando altura/espessura configuradas.
Build/typecheck e capturas ficam com a validação sequencial da integração.
GPU real/mobile físico: **NOT RUN** neste subtrabalho. Nenhum build, publicação,
restart ou alteração Gallaxys foi executado.

Revisão: plain também omite todos os strokes de rodapé/cornija. Padrões são
validados por superfície: boards/slabs no piso; grain/panels na parede. Typecheck
central passou antes da integração completa do movimento.

## Auditoria de regressão default

A rodada central A/B apontou FPS/CPU piores, com drawcalls estáticos e objetos
iguais. Revisão do diff identificou mudança não intencional da cor do grão
(default antigo usava `shadeColor(wall.front.color, 0.7)`, dependente da face;
V4 usava cor secundária comum). Essa diferença foi removida do caminho default,
assim como fills alpha=1 em objeto: o default volta aos fills numéricos originais.
Cor de juntas e painéis legados também preservadas literalmente. Materiais V4
explicitamente configurados conservam cor secundária/opacidade configuráveis.
Repetição default=1 gera as mesmas juntas; nenhuma geometria adicional foi achada.
`diagnostics().surfaceInstructions` conta fills/strokes/textures/instruções de
path dos Graphics estáticos apenas sob solicitação. Não é medida de vertices GPU.
Cor diferente não comprova causa dos FPS. Medição controlada ABBA da integração
é necessária para distinguir regressão de variabilidade do host/SwiftShader.
