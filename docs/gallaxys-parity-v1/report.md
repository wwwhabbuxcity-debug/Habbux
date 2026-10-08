# Habbux — Gallaxys Parity V1

Data: 2026-10-08. Baseline: `91678db1c9bcf79ee279f0a31b21e8713d4c4d60`.
Código original no Habbux; Gallaxys consultado somente em leitura. Publicação
estática em Tyvo, sem alterações no Java, protocolo, banco, CMS, SSO, chat ou HUD.

## Auditoria e matriz comparativa

A auditoria anterior [Isometric World V2](../isometric-world-v2/gallaxys-audit.md)
e [Avatar V3](../avatar-engine-v3/baseline.md) foi reaproveitada. Conferidos nesta
execução os caminhos reais, não apenas os nomes dos projetos:

- Polaris: `RoomUnit`, `RoomCycleManager`, `RoomLayout`, `PathfinderImpl`,
  `AdjacentTileFinder`, `Rotation` e `RoomUserStatusComposer` em
  `/var/www/gallaxys.com/Polaris-Emulator-main/Emulator/src/main/java/com/eu/habbo/`.
- Octane/Octane-Renderer: `MovingObjectLogic`, `AvatarVisualization`,
  `AvatarImage`, caches e `HabboAvatarPartSets`; `RoomPlaneParser`, `RoomPlane`,
  `RoomVisualization`, `RoomGeometry` e `LegacyWallGeometry`.
- Recursos locais: `gamedata/config/{FigureMap,FigureData,HabboAvatarActions}.json`
  e metadados de `bundled/figure/hh_human_{body,shirt,leg,shoe,face}.nitro`.
  Metadados observados em memória, sem transportar imagens ou bundles.
- `bundled/generic/room.nitro`: `roomVisualization` separa `floorData`,
  `wallData`, `landscapeData` e máscaras; piso e parede usam planos, materiais
  e texturas. Não é uma malha que precise expor cada célula caminhável.

| Sistema | Gallaxys | Habbux e diferença | Correção/limite |
|---|---|---|---|
| Pathfinding | A*, custo e ocupação/altura, oito vizinhos; timeout configurado 25 ms; diagonais com política configurável | BFS limitado, altura/ocupação e dois cantos da diagonal; mobiliário e permissões não existem | Preservado; testes Java de caminhos e mudança de destino. Nenhuma evidência justifica trocar o algoritmo nesta correção |
| Interpolação | `MovingObjectLogic`: movimento normal linear, intervalo padrão 500 ms; tratamento extra de slides não é caminhada universal | Segmentos 500/707 ms, fila limitada 256, apresentação 100 ms; coordenadas CSS eram arredondadas | Removido arredondamento do ponto comum. Sem mudar velocidades nem criar oscilação artificial |
| Oito direções | Rotação do grid, transformação relativa à câmera e espelhamento de partes | Projeção fixa 64×32; setores 0..7 e espelhamento 4→2, 5→1, 6→0 | Mantidos e capturados em AvatarView real, com dois avatares e DPR 1/2 |
| WALK/STAND | Visual de 41 ms; avanço a cada duas atualizações; ações, geometria e partes completas | WALK quatro frames/82 ms; fase contínua entre segmentos; aparência mínima | Preservada cadência. Corrigida anatomia STAND feminina e registros de aliases |
| Sprites/offsets | Seleção via FigureData/FigureMap, anatomia e partes separadas; `lh/rh`, layers dependentes da pose | Onze partes, seis PNGs existentes; STAND feminino usava `bd_999` incompleto; alguns fallbacks usavam outra direção/registro | Reutilização de `bd_1` já presente, fallbacks completos da própria base, omissão de detalhes opcionais incompatíveis. Sem offsets inventados |
| Piso | Planos de área, faces laterais, materiais e cache | Losangos com linhas e mudanças de cor muito frequentes | Tábuas de quatro células com juntas alternadas, variação de cor 0,8%, veios discretos; pedra em placas de duas células; relevo e hover preservados |
| Paredes | Planos, normal/espessura, topo, extremidades e altura comum relacionada ao heightmap | Caps calculados separadamente; encontros internos divergiam e altura variava por tile | Grafo de vértices compartilhados; topo comum `maxZ + wallHeight`; tampas só em extremidades, rodapé/cornija e detalhes vetoriais originais |
| Profundidade | Câmera vetorial, planos, máscaras e ordering de objetos/partes | Profundidade isométrica fixa por painel, piso elevado e avatar | Preservada separação por profundidade; unir vértices não une todos os painéis num objeto que esconda indevidamente avatares. Recortes/altura/parede próxima capturados |

A altura 3,6 e espessura 0,25 da referência estão na base vetorial do Octane.
Não foram tratadas como unidades diretamente intercambiáveis com Z de 16 px no
Habbux. Mantidos os parâmetros Habbux de parede 8 Z, espessura 0,16 tile e piso
0,5 Z. Não se afirma equivalência visual só por comparar números.

## Sprite solto: reprodução, causa e correção

Reproduzido no **STAND feminino, frame 0, direções 0 a 7**. A peça separada é
`sh` (sapatos); na direção 3 eram dois componentes. Exemplo D2:
`h_std_sh_2_2_0`, offset `(-23,7)`, região 25×14. O offset do sapato estava
coerente. O problema era o **corpo-base `h_std_bd_999_2_0`**, que não completava
os tornozelos/mãos quando combinado com pernas e mangas curtas. WALK já usava
a anatomia completa `bd_1`; por isso o defeito principal não ocorria em WALK.

Correção no manifesto: STAND feminino usa `bd_1` da mesma direção e registro,
já entregue nos seis PNGs. Nenhuma imagem foi criada, recortada ou importada. O manifesto agora é revalidado
na carga (`no-cache`), para aplicar correções também em navegadores com cache anterior.
Nos três fallbacks de STAND com orientação incompatível (`lg` D1, `ch` D0,
`ls` D1), reutilizada a seleção completa já existente do mesmo setor. Detalhes
opcionais `ey`/`hrb` de outra orientação deixaram de ser desenhados. Seis registros
de aliases WALK foram ajustados ao registro real do frame selecionado na própria
base, incluindo os setores espelhados. Alterar o frame e manter a âncora do
frame ausente deformava mangas/mãos.

Auditoria de pixels com Pillow, composição das mesmas regiões/offsets e
componentes conectados de oito vizinhos: 80 estados (2 aparências × 8 direções ×
5 poses). Antes, todos os STAND femininos tinham componentes `sh` separados
(66–125 pixels nas direções mostradas; D3 tinha dois). Depois, **zero componentes
separados de pelo menos dois pixels**, incluindo todos os WALK auditados.
JSON integral: `pixel-components.json` no checkpoint operacional. As matrizes
antes/depois e AvatarView real confirmam a correção visual.

## Movimento e geometria

Removido `Math.round()` na posição do Container comum. No mobile, com zoom
reduzido, passos de menos de um pixel CSS repetiam a posição e depois saltavam.
Teste real de vinte amostras a cada 16 ms: baseline **10/19 posições repetidas**;
candidato **0/19**. Desktop: 0/19 antes e depois. Filtro nearest e transformação
comum permanecem; nenhum membro é arredondado isoladamente.

500/707 ms, tick 100 ms, quatro frames/82 ms, filas, sobras de tempo entre passos
e fase de WALK foram preservados. Não foi introduzida aceleração ou animação
artificial para mascarar a diferença. Caminhos curtos/longos, horizontal,
vertical, diagonal e curva são exercitados pelos testes/capturas.

Limitação de rede mantida: `ROOM_USER_POSITION` só possui `userId,x,y,z`.
Não há timestamps, início/fim de percurso ou cancelamento de segmentos já
recebidos. Jitter superior à apresentação de 100 ms e certas mudanças de
cadência/destino podem deixar atraso ou pausa; não é possível garantir correção
cronológica absoluta apenas no client. Paridade completa de sincronização remota
não foi declarada; este ciclo não altera contrato nem exige restart.

`room-surfaces.ts` continua sendo a fonte da geometria de piso/parede/câmera.
Vértices externos de uma junção são determinados pelas normais dos painéis que
nela incidem, tanto no início quanto no final. Planos com base em alturas distintas
compartilham o topo. Faces estáticas são reconstruídas somente na troca de
geometria/resize. Juntas de material não mudam walkability ou hit testing.
No degrau ascendente, o centro projetado do tile anterior pode estar sob a borda
do tile seguinte: o hit test escolhe a superfície visível mais à frente.

## Licenças e comparação real

Polaris, Octane e Octane-Renderer têm referência GPL-3.0. Código e recursos não
foram incorporados. A presença de GPL no repositório não comprova licença
individual dos PNGs/figuras/texturas. Os seis PNGs preexistentes do Habbux ainda
não têm cadeia de direitos individual comprovada nos arquivos locais; mantidos
sem importar material adicional. Esta correção não resolve essa pendência.

Obtida uma referência pública legítima HTTP 200 do imager Gallaxys, STAND D2,
`gallaxys-reference-stand-d2.png`, apenas no backup operacional. Confere anatomia
contínua de pernas/sapatos, mas tem figura/paleta diferente do Habbux. Tentativas
adicionais via Python retornaram HTTP 403 e não produziram comparação de ciclo.
Não houve sessão autenticada de quarto Gallaxys, nem gravação comparável de
trajetória/piso/parede. Portanto **paridade visual integral é PARTIAL**, não PASS.
Não se usou conta alheia ou bypass de autenticação.

## Validação e publicação

- Client: **119 PASS** (51 anteriores + 68 neste ciclo; 63 modelos e cinco
  invariantes de anatomia/junção/material).
- Protocolo: **18 PASS**; registry validado com 26 mensagens.
- Maven Java 25 / wrapper / `clean verify`: **108 totais, 104 PASS, 4 SKIP**,
  zero failures/errors; 24 classes. Integração PostgreSQL opcional sem ambiente
  dedicado permanece SKIP; não se usou o banco ativo do hotel como banco de teste.
- Typecheck client/web, builds client/web, repository check e diff check: PASS.
  Builds sequenciais com `nice -n 19`, Node 22, memória JS limitada 512 MiB;
  Maven 512 MiB e dois processadores conforme configuração existente.
- Houve duas falhas nas verificações iniciais, preservadas nos logs: o teste novo
  supôs seis modelos no registro, mas são 63 (os seis são apenas o seletor DEV);
  o hit esperado sobre um degrau estava exatamente sob a borda do tile da frente.
  Corrigidas as premissas dos fixtures, sem alterar seleção de tile para forçar PASS.

Checkpoint operacional: `/root/backups/habbux-gallaxys-parity-v1/`, com branch
`gallaxys-parity-v1-baseline-91678db`, bundle Git, manifesto/release anteriores
e script `rollback-static.sh`. O rollback troca somente a release estática e
exige aviso antes de aparecer para visitantes. O JAR em execução não foi trocado.

## Evidência visual e medições finais

`tools/gallaxys-parity-visual.mjs` executado no build isolado por HTTP loopback,
WebSocket bloqueado no fixture. Chromium/Playwright existentes, SwiftShader;
não foram instalados navegador ou dependências. **84 PNGs finais**, mais baseline:
duas matrizes (80 poses), oito direções STAND/WALK com dois AvatarView reais
em desktop/mobile, seis modelos em ambas as telas, 13 cenários, quatro frames
consecutivos, hover/touch e resize com hit elevado. Zero erros JS e overflow.
DPR desktop 1, mobile 2; 1280×900 e 390×844; resize para 1000×720 e 844×390.

Evidências: `/root/backups/habbux-gallaxys-parity-v1/visual/{before,after}/index.html`.
Dados completos: `results.json`, `parity-results.json`, `pixel-components.json`.

| Ambiente | Avatares | CPU submit antes → depois (ms/frame) | Objetos antes/depois | Heap depois (MiB) |
|---|---:|---:|---:|---:|
| 1280 px / DPR 1 | 2 | 0.309 → 0.473 | 75 / 75 | 15.4 |
| 1280 px / DPR 1 | 5 | 0.422 → 0.432 | 126 / 126 | 15.9 |
| 1280 px / DPR 1 | 10 | 0.377 → 0.666 | 211 / 211 | 16.4 |
| 390 px / DPR 2 | 2 | 0.252 → 0.356 | 75 / 75 | 24.3 |
| 390 px / DPR 2 | 5 | 0.974 → 0.403 | 126 / 126 | 29.0 |
| 390 px / DPR 2 | 10 | 0.577 → 0.380 | 211 / 211 | 22.6 |

Cada custo é a média de 100 frames manuais de 16 ms. A medição inclui update e
submissão de render, não tempo GPU. Objetos 75/126/211 permanecem iguais após
troca de cenário e em 2/5/10 avatares; filas limitadas e texturas compartilhadas.
Detalhes de material são estáticos, restritos por zoom e com strokes agrupados.
O piso plano é rasterizado no cache Pixi uma vez por geometria/resize, em DPR
limitado a 2. Na remoção da sala, o cache é desativado. Piso elevado e hover não
entram nessa textura, preservando profundidade e interação. Não há cache por avatar.
Não houve SQL nem criação de atlas por frame.

- 1280 px: FPS software 33.87 → 17.38; frame máximo final 183.3 ms.
- 390 px: FPS software 26.57 → 34.83; frame máximo final 83.4 ms.

FPS em SwiftShader e heap sofreram variação entre execuções no host compartilhado.
A primeira versão de detalhes custou mais no desktop e foi simplificada; valores
das rodadas intermediárias preservados em `pre-optimization/results.json` e
`before-floor-cache/results.json`. O desktop teve FPS menor nesta rodada (33,87 → 17,38);
o requisito de performance sem degradação permanece **PARTIAL**. As variações
de SwiftShader no host compartilhado não substituem um teste em GPU real.
Não se atribui ganho/regressão a hardware nem se garante 60 FPS/mobile físico.
**GPU real, memória GPU, teste prolongado de vazamento e E2E de conta autenticada:
NOT RUN**. As métricas acima são medições reais do fixture, não estimativas.

## Publicação verificada

- Commit de implementação: `c3f4d26e5948a2d7a91d686eb3fe63dfc83c463d`, push
  concluído em `wwwhabbuxcity-debug/Habbux`, branch `main`.
- Checkout Tyvo atualizado por fast-forward; dist client/web já testados copiados
  e publicados pelo script estático. Release: **`20261008T050808Z`**.
- `/`, `/game/`, `/client/` e manifesto: HTTP 200. `.git/config`: 403; fontes e
  registro privados: 404. `/client/`: WebSocket real **READY** em 1280/390 px.
- Fixture pública: dois avatares em STAND e horizontal, manifesto corrigido,
  zero erros JS/overflow; dez screenshots públicos adicionais em
  `visual/public/`. Isso não é teste de login/SSO/sala autenticada.
- Mesmo contexto de navegador carregou o manifesto anterior antes da publicação
  (`bd_999`) e, depois do reload, recebeu `bd_1`: warm-cache smoke **PASS**,
  registrado em `warm-cache-result.json`.
- Habbux PID `2442770` e Gallaxys PID `1808934`, ativos, sem troca de PID ou
  horário de início. JAR ativo preservado, SHA-256 verificado; seis PNGs originais
  preservados e SHA-256 conferido. Gallaxys responde HTTP 200.
- Rollback estático preparado; nenhum restart, migration ou mudança de configuração
  nginx/banco. Log do serviço lido após a publicação.

## Pendências reais

- Aprovação visual da responsável em Tyvo; não houve sessão de jogo autenticada
  de usuário real neste ciclo. Smoke público e fixture isolada não substituem isso.
- Comparação pareada de um quarto e de caminhada ao vivo no Gallaxys.
- Direitos individuais dos seis PNGs legados e aparência/paleta completa por protocolo.
- Timestamps/estado de percurso para sincronização robusta sob atraso de rede.
- FPS e memória GPU em hardware/mobile reais: Chromium usou SwiftShader.
