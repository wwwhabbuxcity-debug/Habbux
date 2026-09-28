# Princípios de performance

**Measure before optimize.** Medir carga representativa, identificar o custo e
comparar antes/depois com o mesmo método. Não trocar clareza por uma hipótese de
ganho sem profiling ou benchmark relevante.

| Regra | Aplicação |
|---|---|
| NO SQL IN MOVEMENT HOT PATH | Posição e validação de deslocamento usam estado carregado em RAM |
| NO BLOCKING I/O ON NETTY EVENT LOOP | SQL, arquivos, HTTP e esperas vão para executores limitados |
| NO UNBOUNDED QUEUES | Todo produtor define limite, rejeição, métricas e recuperação |
| NO UNBOUNDED CACHES | Cada cache define TTL/invalidação, tamanho, dono e descarte |
| NO GLOBAL ROOM LOCK | Autoridade sequencial por quarto; paralelismo entre quartos |
| NO DATABASE QUERY PER FRAME/TICK | Projeções em memória; persistência fora do ciclo visual/de eventos |
| NO JSON FOR HIGH-FREQUENCY GAMEPLAY MESSAGES | Wire binário versionado; JSON pode servir configuração e logs |
| NO PREMATURE MICRO-OPTIMIZATION WITHOUT MEASUREMENT | Medir latência, alocação, CPU e efeito prático antes da mudança |

## Hot paths

Movimentação não consulta SQL a cada tile. Chat não depende de round-trip ao
PostgreSQL para entregar uma mensagem já autorizada; políticas de moderação e
persistência futuras precisam de caminho limitado e falha definida. Wired runtime
usa regras carregadas e orçamento de execução, sem consulta repetida durante a
avaliação nem recursão ilimitada.

Autoridade e consistência não são sacrificadas para melhorar uma métrica. Compras
e transferências usam confirmação transacional mesmo que seu custo seja superior
ao de uma atualização visual. Não aplicar a mesma estratégia de descarte/retry a
uma posição substituível e a uma concessão de item.

## Orçamento de recursos

Limitar bytes e itens de entrada/saída, executores, conexões, timers, caches,
trabalho por evento e retenção de logs. Observar RAM total, memória nativa/GPU,
threads e buffers; heap pequeno não prova baixo consumo total.

Usar batching quando medido, com tamanho e tempo máximos. Evitar alocações e cópias
desnecessárias nos trechos comprovadamente quentes, preservando ownership seguro.
Pools de objetos próprios não entram por padrão: podem aumentar retenção e risco.

## Medição e operação

Reportar p50, p95, p99, taxa de erro e saturação, além de média/throughput. Separar
tempo em fila de tempo executando. Incluir aquecimento, GC, dataset, duração,
configuração e consumo do gerador. Resultados não são comparáveis se máquina ou
cenário mudar sem registro.

No servidor compartilhado atual, builds usam `nice -n 19`; não executar ensaio
de carga, instalar uma plataforma pesada ou ajustar serviços de outros projetos.
Capacidade e SLOs permanecem **TBD** no [orçamento](PERFORMANCE-BUDGET.md).
