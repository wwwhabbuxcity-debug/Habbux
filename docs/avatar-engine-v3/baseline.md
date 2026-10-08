# Avatar Engine V3 — baseline

Data: 2026-10-07
Checkpoint: `7d1bbfc`
Branch de recuperação: `avatar-v3-baseline-7d1bbfc`

## Estado do Habbux

- `RoomManager` agenda o processamento das salas a cada 100 ms.
- `RoomRuntime` calcula o caminho no servidor, valida diagonais seguras e publica uma posição por segmento.
- Duração autoritativa atual: 500 ms cardinal e 707 ms diagonal.
- `ROOM_USER_POSITION` carrega somente `userId`, `x`, `y` e `z`; a ordem do WebSocket é a ordem autoritativa disponível ao client.
- `AvatarView` mantém posição lógica, posição visual, segmento atual e fila limitada de segmentos.
- `AvatarAnimationController` usa clock visual independente: 41 ms por atualização, quatro frames WALK a cada 82 ms.
- `RoomRenderer` projeta tiles em 64×32, usa elevação de 16 px e ordenação isométrica.

## Módulos mapeados

- Client: `apps/client/src/renderer/avatar-view.ts`, `avatar-animation.ts`, `avatar-assets.ts`, `avatar-manifest.ts`, `avatar-direction.ts`, `renderer-model.ts`, `room-renderer.ts` e `isometric.ts`.
- Assets: `apps/client/public/assets/avatar/v1/manifest/avatar-manifest-v1.json` e seis sheets PNG.
- Servidor: `apps/emulator/src/main/java/com/habbux/room/RoomRuntime.java`, `RoomManager.java`, `RoomGridDefinition.java`, `RoomPathfinder.java` e codecs em `apps/emulator/src/main/java/com/habbux/protocol`.
- Protocolo: `packages/protocol/protocol.json`, mensagem `ROOM_USER_POSITION`.

## Referência Gallaxys auditada

- Emulator: `/var/www/gallaxys.com/Polaris-Emulator-main/Emulator`; `RoomUnit.java`, `RoomCycleManager.java`, `RoomLayout.java`, `PathfinderImpl.java` e `AdjacentTileFinder.java`.
- Client/renderer: `/var/www/gallaxys.com/Octane` e `/var/www/gallaxys.com/Octane-Renderer`.
- Movimento visual: `Octane-Renderer/packages/room/src/object/logic/MovingObjectLogic.ts`; interpolação temporal, fila de mensagens consecutivas e duração padrão de 500 ms.
- Avatar: `packages/room/src/object/visualization/avatar/AvatarVisualization.ts` e `packages/avatar/src/AvatarImage.ts`; clock visual de 41 ms, avanço de frame a cada duas atualizações, composição por partes, offsets e profundidade.
- Geometria e composição de avatar foram usados somente como referência técnica. O código Gallaxys não foi copiado nem alterado.

## Auditoria dos assets Habbux

- Manifesto: 11 partes, 6 sheets, 8 direções, STAND e WALK.
- Corpo, pernas e sapatos possuem quatro regiões WALK diferentes por direção.
- Algumas partes auxiliares preservam frames iguais ou não têm pixels em certas direções; isso é fallback/oclusão de asset e não deve ser convertido em frame inventado.
- O manifesto valida limites das regiões dentro dos sheets, mas antes deste ciclo não havia auditoria explícita de bbox/pixel snapping.
- Os offsets usam origem lógica comum no ponto dos pés; o renderer precisa aplicar o offset como posição de canvas e manter a composição inteira estável.

## Problemas conhecidos antes da V3

1. O servidor e a fila de segmentos já corrigiam aceleração de caminhos longos.
2. O client mantinha `roundPixels: true` em cada Sprite. Durante interpolação fracionária, isso podia arredondar cada parte em momentos diferentes e produzir tremor, buracos ou desalinhamento aparente.
3. O laboratório DEV mostrava uma matriz WALK, mas ainda não exibia bbox, linha dos pés, frame atual ou STAND.
4. Não existe navegador automatizado disponível nesta execução; a validação visual E2E fica pendente.

## Baseline de testes conhecido

- Client: 19 testes PASS no checkpoint anterior.
- Maven: 104 testes PASS e 4 skips esperados.
- Protocolo: 18 testes PASS e registry válido.
- Typecheck, build e repository check PASS.

## Riscos e limites

- O protocolo atual não possui número de sequência por passo. TCP preserva ordem, mas não permite ao client provar ordem entre mensagens de fontes diferentes; teletransportes não adjacentes continuam sendo tratados como correção autoritativa.
- Sem navegador, não é possível afirmar que composição visual, escala e pés estão aprovados em produção.
- Não há autorização de licença para reutilizar sprites ou código Gallaxys; os assets Habbux permanecem independentes.
