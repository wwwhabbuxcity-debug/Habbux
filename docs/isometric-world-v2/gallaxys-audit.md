# Auditoria Gallaxys / Habbux — Isometric World V2

Referência inspecionada somente para leitura. Checkpoint efetivo Habbux:
`7e8fd47` em `main`, árvore limpa antes do trabalho; `382383b` é seu pai.
A correção CMS/SSO de `7e8fd47` foi preservada. Não houve cópia de código,
protocolo, imagem ou textura Gallaxys. Não houve build, deploy ou restart Gallaxys.

## Ambiente e rollback

| Item | Caminho/estado observado |
|---|---|
| Habbux fonte | `/var/www/Habbux` |
| Emulator | `apps/emulator/src/main/java/com/habbux/room/` |
| Client | `apps/client/src/renderer/` (TypeScript strict / PixiJS 8.21.0) |
| Assets atuais | `apps/client/public/assets/avatar/v1/` (manifesto e seis PNGs existentes) |
| Docs | `docs/`, arquitetura v1 e ADRs |
| Protocol | `packages/protocol/protocol.json`, 26 mensagens |
| Quartos | `apps/emulator/src/main/resources/room-models-v1/models.tsv`, 63 modelos válidos, seis expostos no seletor |
| Checkout servido | `/var/www/tyvo.online`, anterior `a05ae4f`, ancestral do Habbux |
| Release anterior Tyvo | `/var/www/tyvo.online/.deploy/releases/20261008T030918Z` |
| Release local Habbux anterior | `.deploy/releases/20261007T235636Z` |
| Runtime | `habbux-tyvo`, Java 25, loopback 3100, heap 256 MiB |
| Config operacional | `/etc/habbux/tyvo-online.env`; valores sensíveis não registrados |
| Proxy | `/etc/nginx/sites-enabled/tyvo.online`, HTTPS/WSS `/ws` |
| Banco operacional | DEV `habbux_phase2_test`; nenhuma migração ou alteração de cadastro nesta tarefa |
| Build | Node 22.23.2 em `/opt/node22`, npm 10.9.8, Java 25 + wrapper Maven |
| Checkpoint | branch `isometric-world-v2-baseline-7e8fd47`, bundle em `/root/backups/habbux-isometric-world-v2/baseline.bundle` |

Os artefatos publicados anteriores e o JAR ativo foram preservados para rollback.
O checkout Tyvo estava atrasado em relação ao Habbux; é ancestral, sem mudanças
pendentes. Atualização será fast-forward, preservando CMS e HUD já incorporados.

## Arquivos de referência efetivamente inspecionados

Caminhos relativos a `/var/www/gallaxys.com/`:

| Arquivo | Evidência/responsabilidade |
|---|---|
| `Polaris-Emulator-main/Emulator/src/main/java/com/eu/habbo/habbohotel/rooms/RoomUnit.java` | `cycle`, `setGoalLocation`, consumo da fila, estado MOVE, altura e rotação; linhas 135, 212, 314, 572 |
| `…/rooms/RoomCycleManager.java` | ciclo de unidades e envio/coalescência de atualizações; `cycleWithCoalescedFlushes` e `cycleRoomUnit` |
| `…/rooms/RoomLayout.java` | heightmap e elevação; `getHeightAtSquare` |
| `…/rooms/pathfinding/impl/PathfinderImpl.java` | A* por fila de prioridade, custo, validação, timeout e reconstrução do caminho |
| `…/rooms/pathfinding/impl/AdjacentTileFinder.java` | oito vizinhos e política configurável de diagonais |
| `…/util/pathfinding/Rotation.java` | correspondência lógica X/Y → setores de rotação |
| `…/messages/outgoing/rooms/users/RoomUserStatusComposer.java` | status MOVE/posição/rotação difundidos aos participantes |
| `Octane-Renderer/packages/room/src/object/logic/MovingObjectLogic.ts` | interpolação por tempo, fila e correções instantâneas; buffering adicional é específico de slides/rollers, não uma curva universal do avatar |
| `…/object/visualization/avatar/AvatarVisualization.ts` | atualização visual de 41 ms, avanço de WALK a cada duas atualizações; direção relativa à câmera, profundidade e offsets |
| `Octane-Renderer/packages/avatar/src/AvatarImage.ts` | composição/cache de partes, direção e contador de animação |
| `…/room/src/utils/RoomGeometry.ts` | base vetorial da câmera, projeção, inversa e profundidade |
| `…/room/src/utils/LegacyWallGeometry.ts` | referência de localização/interação de paredes (mapeada; não transplantada) |
| `…/room/src/object/RoomPlaneParser.ts` | heightmap → planos, altura 3.6 no modelo original, multiplicadores de espessura, buracos |
| `…/room/src/object/RoomPlaneData.ts` | origem, vetores dos lados e normal de cada plano |
| `…/room/src/object/visualization/room/RoomVisualization.ts` | escolhe materiais, visibilidade, altura/espessura e planos |
| `…/room/src/object/visualization/room/RoomPlane.ts` | cores, materiais/texturas, máscaras e cache |

## Fluxo e diferenças

Polaris: destino → A* com validação de tile, unidade e altura → fila de `RoomTile`
→ ciclo de `RoomUnit` → rotação e status MOVE → mensagens aos clientes do quarto.
Um novo destino recompõe o caminho da posição autoritativa. Há permissões,
walkthrough, mobis, assentos e configurações que não existem no Habbux.

Octane: mensagem → posição/alvo → interpolação temporal → geometria/câmera →
visualização do avatar → composição das partes → sorting dos sprites.
`MovingObjectLogic.easeProgress` mantém movimento linear quando não há estilo
especial de mobi. Não há evidência de Bézier obrigatório para uma caminhada
normal. O sistema de quartos usa planos/normal/materiais e máscaras, não uma
textura proprietária necessária à matemática dos losangos.

Habbux: protocolo próprio → `CoreConnection` → `RoomState` → `RoomRenderer` →
`AvatarView`, com servidor Java/mailbox autoritativo e BFS limitado reutilizando
arrays. A projeção fixa não usa toda a câmera vetorial Octane. O protocolo Habbux
atual só envia `(userId,x,y,z)`, sem início/fim de percurso ou timestamps.
Não é possível provar a cronologia absoluta dos passos a partir desses pacotes.

## Geometria e diagnóstico horizontal

Habbux projeta centros com:

```
screenX = originX + (X - Y) * tileWidth * scale / 2
screenY = originY + (X + Y) * tileHeight * scale / 2 - Z * elevationHeight * scale
```

Baseline confirmado: tile 64×32, elevação 16 px/unidade, tick 100 ms,
cardinal 500 ms, diagonal 707 ms, WALK quatro frames a cada 82 ms, oito direções.
Foot anchor por metadados, compositor comum e snapping do conjunto foram mantidos.

O atlas existente mostra `0 NE, 1 E, 2 SE, 3 S, 4 SW, 5 W, 6 NW, 7 N` na tela.
O código antigo associava `(1,-1)` a 0 embora a projeção produza `(64,0)`.
Era um deslocamento de um setor entre grid e sprite, não ausência de diagonal
no BFS. A matriz real anterior foi capturada em `baseline-current-directions.png`.

| Delta grid | Deslocamento de tela | Sprite correto |
|---|---|---|
| 0,-1 | acima/direita | 0 NE |
| 1,-1 | direita horizontal | 1 E |
| 1,0 | abaixo/direita | 2 SE |
| 1,1 | abaixo vertical | 3 S |
| 0,1 | abaixo/esquerda | 4 SW |
| -1,1 | esquerda horizontal | 5 W |
| -1,0 | acima/esquerda | 6 NW |
| -1,-1 | acima vertical | 7 N |

Outro defeito: `nextStepAt = now + 707 ms` arredondava repetidamente cada passo
para o próximo tick de 100 ms. Agora o prazo anterior é acumulado; continua
havendo no máximo um passo por avatar por tick. O cliente transfere sobra de
frame ao próximo segmento, em vez de descartá-la. Um buffer inicial de um tick
(100 ms) absorve quantização sem mudar 500/707 ms ou prever tiles.

A política de canto foi explicitamente endurecida: ambos os tiles ortogonais
devem estar livres, com altura compatível e sem outro ocupante. A mesma regra é
revalidada quando o passo é executado. O teste antigo que autorizava passar junto
a um canto bloqueado agora exige o contorno de quatro passos; nenhum teste foi removido.

## Piso, paredes e profundidade Habbux V2

`room-surfaces.ts` gera geometria própria sobre os mesmos vértices do hover.
Materiais wood/stone e plaster/panel são padrões procedurais e cores, sem assets
novos. Piso: topo contínuo, juntas discretas, faces externas e de desnível,
espessura de 0.5 unidade Z (8 px). Tiles `Z=-1` são vazios, não piso preto.

Paredes: segmentos nas bordas negativas X/Y do contorno real, incluindo recortes;
altura 8 unidades Z (128 px), espessura 0.16 unidade de grid, tampa, término,
canto compartilhado, rodapé e iluminação por face. Estes são parâmetros de
material explícitos, não offsets de posição do avatar. Paredes frontais abertas
preservam a visão do quarto. Não foi criado editor de quarto ou catálogo.

Piso elevado e paredes entram na camada ordenada de entidades; paredes ficam
no plano `X+Y-0.5`, pisos em `X+Y-0.25`, destaque em `X+Y-0.125`, avatares usam a
profundidade existente. Assim a parede de um recorte pode ocultar um avatar atrás
e o avatar à frente permanece visível. Não se promete sorting completo de
futuros mobis grandes: esses objetos precisarão de extensões de plano/footprint.

A câmera mede todas as faces e alturas; remove a dupla aplicação de Z e a escala
mínima antiga que recortava salas largas no mobile. Geometria estática só é
reconstruída ao mudar quarto, mapa ou viewport; posições recebidas não redimensionam
o canvas. Sprites/texturas permanecem reutilizados, fila limitada a 256 segmentos.

## Licenças e limites da referência

`Polaris-Emulator-main/LICENSE`, `Octane/LICENSE` e `Octane-Renderer/LICENSE`
contêm GPL versão 3. Pacotes Octane declaram `GPL-3.0`. A existência desta licença
não autoriza declarar os respectivos assets como livres. Nenhum manifesto de
permissões para as texturas `.nitro`/gamedata foi encontrado nesta inspeção.

Uma eventual incorporação/distribuição derivada exigiria avaliação das condições
do texto GPL, incluindo avisos, licença e fonte correspondente; não foi assumida
compatibilidade com o Habbux `UNLICENSED`. Texto primário:
https://www.gnu.org/licenses/gpl-3.0.html; também preservado nos LICENSE locais.
A solução entregue é código novo e geometria/padrões próprios.

Os seis sheets de avatar já existentes NÃO foram copiados/alterados nesta tarefa.
A árvore Habbux não contém comprovação individual de licença desses PNGs: os
documentos anteriores afirmam independência, mas isso não prova titularidade.
A limitação foi registrada; nenhum asset novo de procedência incerta foi adicionado.

Não há sessão autenticada Gallaxys disponível para uma captura de quarto de
referência. A auditoria de comportamento vem dos fontes locais, e as capturas
visuais vêm do pipeline Habbux real. Sem comparação lado a lado autenticada,
não se declara equivalência visual com Gallaxys nem aprovação estética da dona.

Consulta primária adicional de licença: [texto oficial GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.html), seções 5 e 6. A primeira abertura automática expirou; o mecanismo de busca retornou o texto oficial. Os LICENSE locais foram lidos diretamente.
