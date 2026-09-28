# Plano de benchmarks

**Nenhum benchmark de capacidade foi executado neste bootstrap.** Este diretório
contém o plano; ferramentas e resultados serão adicionados com funcionalidades
mensuráveis. Não usar números de conexões como alegação de jogadores suportados.

## Progressão

Planejar níveis de 100, 500, 1.000, 2.500, 5.000 e 10.000+ conexões/jogadores
simulados, registrando qual população cada nível representa. São pontos de ensaio,
não metas garantidas. Avançar só se o nível anterior permanecer estável dentro dos
critérios de proteção e do orçamento definidos para o ambiente dedicado.

**10.000 WebSockets ociosos NÃO equivalem a 10.000 jogadores reais.**

## Cenários futuros

| Cenário | Carga e invariantes a observar |
|---|---|
| Idle connections | Heartbeats, memória/conexão, descritores, timeout e GC |
| Login storm | Taxa de autenticação, filas, rejeição controlada e DB/pool |
| Movement | Jogadores ativos por quarto, mensagens, ordem e ausência de SQL por tile |
| Chat | Distribuição por quarto, broadcast, rate limits e consumidor lento |
| Room join/leave | Carregamento, transferência, snapshots, unload e vazamentos |
| Large rooms | Fan-out, filas de saída, justiça entre quartos e frame time no Client |
| Furniture interaction | Validação, mudança de estado e eventos derivados |
| Wired execution | Custo por cadeia, timers, limites e isolamento de abuso |
| Inventory | Dataset realista, paginação, leitura e consistência após alterações |
| Catalog purchases | Compras concorrentes, idempotência, saldo e propriedade sem duplicação |
| Reconnect storm | Recuperação simultânea, sessão, backoff e repetição segura |

Executar cenários isolados e depois um mix representativo. Incluir churn,
consumidores lentos e falha/recuperação controlada de dependências; não testar
apenas o caminho feliz. Cada cenário aguarda implementação de sua funcionalidade.

## Método

1. Definir hipótese, dataset, seeds, ações/s, distribuição de quartos, duração,
   aquecimento, limites de parada e máquina dedicada.
2. Registrar commit, versões/configuração, CPU/RAM/rede, JVM/GC e topologia dos
   geradores. Medir também CPU/rede do gerador para detectar gargalo nele.
3. Capturar throughput, p50/p95/p99, erros/rejeições, backlog/idade, CPU/RAM, GC,
   event-loop lag, pool e DB. Separar tempo em fila de execução.
4. Preferir geração que preserve a taxa planejada sob lentidão quando essa for
   a hipótese do teste; registrar agendamento e atraso para não esconder filas
   deixando de gerar requisições durante uma pausa do servidor.
5. Repetir de forma controlada, informar dispersão e guardar dados brutos com
   referência verificável. Uma execução isolada não demonstra estabilidade.
6. Comparar antes/depois no mesmo cenário e registrar regressões funcionais,
   consumo e taxa de erro junto com qualquer ganho de throughput.

Ensaios longos devem observar crescimento de memória, deriva de filas e recuperação
após queda de carga. Microbenchmarks futuros, quando úteis, usam ferramenta madura
como JMH, com warmup e prevenção de otimizações que eliminem trabalho medido.

## Restrições operacionais

Não executar carga neste servidor compartilhado com Gallaxys, Peptídeos,
Labsciences e Modelgold. Não reutilizar contas, bancos ou dados desses projetos.
Critérios de parada e capacidade permanecem **TBD** no
[orçamento de performance](../docs/performance/PERFORMANCE-BUDGET.md).
