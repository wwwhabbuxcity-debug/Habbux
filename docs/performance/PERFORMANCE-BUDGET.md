# Orçamento de performance

Status: **nenhuma capacidade de jogadores foi medida neste bootstrap**.
Foram executados smokes locais curtos com 25 sessões WebSocket e 4 logins
concorrentes, descritos no [plano de benchmarks](../../benchmarks/README.md). Eles
não medem capacidade sustentável; metas de capacidade seguem TBD.

| Indicador | Unidade/definição | Meta | Resultado medido |
|---|---|---|---|
| Connection count | Conexões simultâneas por cenário e máquina | TBD | NOT RUN |
| Messages/sec | Mensagens válidas processadas/s; incluir mix e tamanho | TBD | NOT RUN |
| p50 | Latência ponta a ponta por operação, ms | TBD | NOT RUN |
| p95 | Latência ponta a ponta por operação, ms | TBD | NOT RUN |
| p99 | Latência ponta a ponta por operação, ms | TBD | NOT RUN |
| Memory/player | Incremento de RSS/heap por jogador ativo, bytes | TBD | NOT RUN |
| Memory/room | Estado e filas por quarto representativo, bytes | TBD | NOT RUN |
| CPU/player | CPU-segundos por jogador/s no cenário definido | TBD | NOT RUN |
| Room tick/event latency | Fila + processamento; registrar separadamente, ms | TBD | NOT RUN |
| DB latency | Aquisição de conexão, query e transação, ms | TBD | NOT RUN |
| GC pause | Distribuição de pausas e tempo total, ms/% | TBD | NOT RUN |
| Event-loop lag | Diferença entre agendamento esperado e execução, ms | TBD | NOT RUN |
| Error/rejection rate | Falhas, timeouts e rejeições por operação, % | TBD | NOT RUN |
| Client frame time | p50/p95/p99 por dispositivo e cena, ms | TBD | NOT RUN |
| Client memory | RAM/texturas estimadas por dispositivo e cena, bytes | TBD | NOT RUN |

Conexão ociosa, usuário autenticado e jogador ativo são populações diferentes.
10.000 WebSockets ociosos não equivalem a 10.000 jogadores reais. Não somar
resultados de cenários isolados para anunciar capacidade composta.

## Como preencher

Registrar commit, dependências, JVM/flags, sistema, CPU/RAM, topologia de rede,
configuração, versões dos serviços, dataset, seed, distribuição dos usuários por
quarto, taxa de ações, aquecimento e janela medida. Reservar recursos e registrar
interferências. Separar cliente gerador e servidor quando possível.

Metas precisam incluir duração sustentável, latência máxima aceitável, limite de
erros e margem de recursos. Um pico breve que cria backlog não é capacidade
sustentável. Parar a carga quando critérios de proteção forem atingidos; valores
desses critérios são **TBD** no ambiente dedicado.

O [plano de benchmarks](../../benchmarks/README.md) define progressão e cenários.
Comparações futuras devem guardar resultados brutos fora do Git quando grandes,
com metadados e referência verificável no relatório.
