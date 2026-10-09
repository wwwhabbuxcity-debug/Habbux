# ADR 0023 — Pré-anúncio autoritativo de movimento

Estado: aceita. Data: 2026-10-08.

## Contexto

Endpoints recebidos após o commit não informam qual será o próximo passo nem sua
duração. Em cardinal→diagonal, a apresentação de 500 ms acaba antes do próximo
endpoint de 707 ms arredondado pelo tick. Aumentar velocidade, extrapolar tiles
ou manter WALK parado mascararia a falha.

## Decisão

Pré-anunciar um único passo validado/reservado com origem, destino, sequência,
duração e tempo restante. Reservar destino e cantos do diagonal na mailbox da
sala antes do anúncio. Troca de destino preserva o passo prometido, substituindo
somente a cauda. Manter commit/ocupação no tick100 e eventos de endpoint legados.
Buffer visual100, segmentos500/707 e fase WALK82 permanecem.

Negociar suporte com ROOM_JOIN de ID reservado Long.MAX_VALUE e resposta
ROOM_JOIN_FAILURE categoria5 sem associação de sala. Client novo usa JOIN_MOVEMENT
somente após confirmação, ou JOIN legado ao receber categoria antiga. Assim
nenhum ID novo chega a clients/servidores que não o suportam. Logout/reconnect
limpam negociação. Registry canônico define IDs27/28 e STEP26 bytes.

## Consequências

Mais um evento por passo e uma ida/volta na primeira entrada após login.
Reservas têm um array fixo por sala e até três índices por presença, sem fila
extra/SQL. Passagens simultâneas em cantos diagonais ficam conservadoras.
Buffer finito absorve tick/jitter até100 ms; atrasos maiores param e retomam sem
prever destinos desconhecidos. Não se promete ausência de pausas em rede
arbitrariamente atrasada. Testes exercitam compatibilidade bidirecional,
reserva/saída/troca de destino, terminal e clock de animação.
