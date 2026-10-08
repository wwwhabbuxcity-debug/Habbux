# ADR 0020 — Partes completas do avatar e geometria estática do quarto

Status: aceito. Data: 2026-10-08.

## Problema

O manifesto não descrevia mãos (`lh`/`rh`). A seleção frontal masculina de olhos
foi removida no ciclo anterior, embora o atlas existente tivesse uma seleção
compatível com a orientação e os limites da cabeça. O compositor aplicava uma
ordem fixa a braços, tronco e cabeça. O cache em bitmap do piso não tinha uma
vantagem de desempenho demonstrada no ambiente de teste por software.

## Decisão

Manter um compositor compartilhado, com camadas por direção e espelhamento do
conjunto. Reutilizar olhos que já estavam presentes no Habbux, da mesma
orientação. Incluir apenas um atlas SVG original de braços/mãos, MIT, produzido
offline a partir dos punhos das mangas existentes; nenhuma região ou metadado
novo do Gallaxys entra no gerador. Manifestos antigos de onze partes continuam
compatíveis. A licença dos seis PNGs anteriores permanece sem comprovação.

Manter 500/707 ms por segmento, 82 ms por frame e tick de 100 ms. O clock visual
tem um caminho sem snapshots no processamento de cada frame. Não compensar
lacunas de rede adivinhando destinos ou mudando essas durações.

Agrupar paredes nos planos externos posteriores com o piso plano, em um
Graphics cuja geometria o Pixi reaproveita. Paredes em recortes e pisos elevados
mantêm a ordenação individual. Hover continua separado e usa a mesma projeção.
O bitmap do fundo fica desativado por padrão: a comparação A/B registrou custo
maior na maioria dos casos. `room-cache=1` permite repetir o experimento no
laboratório. Sombras de contato e acabamento das paredes usam vetores originais.

## Evidência e limites

[Relatório completo](../gallaxys-engine-parity-v2/report.md), matrizes por parte,
modelos reais e benchmark com aquecimento e trabalho espaçado por RAF.
SwiftShader não demonstra desempenho em GPU física. O protocolo de movimento
ainda não oferece timestamps/duração; uma transição cardinal→diagonal pode
esvaziar a fila. Referências públicas do imager permitem comparar anatomia e
frames, mas não provam equivalência de um quarto ou de caminhada em rede.
