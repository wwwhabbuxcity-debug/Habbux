# ADR 0021 — Apoio dos pés como pivot do avatar

Status: aceito. Data: 2026-10-08.

O avatar usava o vértice inferior do tile como apoio. O deslocamento vertical
dependia do maior limite dos frames e o horizontal incluía as pernas. Isso
divergia do centro usado pelo piso, hover e destino lógico.

O Container do avatar passa a usar exatamente `roomToScreen(x,y,z,config)`.
A composição aplica um pivot fixo de apoio, registrado offline nos sapatos
STAND: média das bordas inferiores opacas das colunas, com offsets originais.
O ponto representa o apoio entre as solas, não a extensão máxima do sapato.
A mesma referência serve todos os frames WALK. A reflexão acontece em torno
desse pivot; não há compensação horizontal ou vertical no Container externo.

`foot = projectedTile + scale × (mirror × (localPoint - support))`.
Para `localPoint = support`, o resultado é o centro do tile, independentemente
de direção, frame, gênero, escala ou Z. Z entra somente na projeção; DPR entra
somente na rasterização. Não se arredondam coordenadas do movimento.

As 16 referências são validadas contra a região STAND e reaproveitadas. Não há
leitura de pixels/bounds por frame em produção. O laboratório pode desenhar
centro, apoio, origem e bbox; essa opção fica desligada no renderer normal.
Manifestos legados usam uma referência fixa dos sapatos, sem leitura de WALK.

A pausa cardinal→diagonal é independente deste erro geométrico e mantém a
pendência de sincronização descrita no relatório V2. Velocidade, protocolo e
pathfinding não mudam. Evidência: [relatório V7](../foot-alignment-v7/report.md).
