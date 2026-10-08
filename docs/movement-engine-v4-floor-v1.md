# Movement Engine V4 e Interactive Floor V1

## Auditoria

O Gallaxys/Octane usa `MovingObjectLogic.ts` para interpolar mensagens de
movimento e manter uma fila de segmentos. A conversão de coordenadas de tela e
tile fica em `LegacyWallGeometry.ts`. A seleção visual usa os eventos de tile do
`RoomSpriteCanvas.ts` e os estados de destaque de
`RoomAreaSelectionManager.ts`.

O `Octane-Renderer` declara GPL-3.0. Nenhum código, asset ou protocolo foi
copiado para o Habbux; o comportamento foi usado somente como referência
técnica.

## Movimento Habbux

O servidor continua autoritativo: tick de 100 ms, passo cardinal de 500 ms e
diagonal de 707 ms. `RoomRuntime` substitui o caminho anterior quando chega um
novo destino, e o cliente mantém a fila de segmentos recebidos. A animação usa
quatro frames WALK em relógio independente de 82 ms por frame e retorna a STAND
quando o último segmento termina.

Esta etapa não altera velocidade, protocolo, pathfinding, fila ou composição do
avatar. Os testes existentes cobrem interpolação, diagonais, continuidade do
WALK, oito direções e foot anchor.

## Chão interativo

`tile-interaction.ts` resolve o tile visível testando os losangos projetados,
considerando escala, origem da câmera e elevação. Quando há sobreposição, a
superfície de maior elevação vence. O mesmo resultado alimenta hover e clique,
portanto os dois não podem selecionar tiles diferentes.

`RoomRenderer` mantém um único `Graphics` para o destaque. Ele é desenhado entre
o piso e a camada de entidades, é redesenhado apenas quando o tile muda e é
removido em `pointerleave`, troca de quarto e descarte do renderer. Mouse usa
`pointermove`; touch mostra o feedback por 450 ms e continua usando o clique
autoritativo do servidor.
