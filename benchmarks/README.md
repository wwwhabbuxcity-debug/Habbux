# Plano de benchmarks

O benchmark de codec (`npm run core:benchmark`) mede encode/decode do codec
TypeScript para um frame PING de 4 bytes. O load smoke (`npm run core:load-smoke`)
fala o protocolo binário real com um Emulator loopback iniciado pelo próprio
script. Nenhum dos dois é teste de capacidade de jogadores.

## Core v1: load smoke local

Selecione `HABBUX_LOAD_SCENARIO=connection`, `session` ou `auth`. O padrão é
`session`, com 25 conexões, 2 conexões de aquecimento e 3 PING/PONG por sessão.
Connection mede upgrade/handshake e fechamento; session mede também RTT; auth
mede login bem-sucedido seguido de PING/PONG. O smoke para em 100 conexões para os
dois primeiros cenários e 8 para Auth. Isso é um teto operacional do utilitário,
não uma meta de capacidade. A duração é curta; não há carga prolongada ou teste de
Room Engine.

O relatório inclui tentativas, handshakes, logins, erros, fechamento, conexões/s,
mensagens/s e p50/p95/p99 de handshake, login e PING/PONG. Quando Linux e JDK
oferecem os dados, coleta RSS/threads via `/proc`, CPU do processo via ticks e
heap/GC via `jstat`. Ao encerrar, lê contadores do servidor, executor Auth e pool
PostgreSQL. Campo sem fonte disponível sai como `null`; o script não estima valor.

Exemplo seguro de sessão:

```bash
HABBUX_LOAD_SCENARIO=session HABBUX_SMOKE_CONNECTIONS=25 \
  nice -n 19 /opt/node22/bin/npm run core:load-smoke
```

Auth só roda com usuário de teste prefixado `load_` e as variáveis
`HABBUX_LOAD_AUTH_USERNAME`/`HABBUX_LOAD_AUTH_PASSWORD`, ou com
`HABBUX_LOAD_AUTH_SEED=1`. O modo seed registra um usuário temporário com senha
aleatória, faz o login medido e apaga apenas essa identidade depois de confirmar
`current_database()`. Se a verificação/remoção falhar, o smoke falha e identifica
que a limpeza ficou pendente. Não apaga outras contas.

Os dois modos exigem PostgreSQL em loopback, database exatamente
`habbux_phase2_test` e credenciais do papel de runtime. Seed exige também a role
de migration, usada somente pelo cliente de carga para remover o usuário gerado.
O processo Emulator recebe só o conjunto de conexão runtime; credenciais de
migration e senha de carga não são herdadas por ele. Exemplo para executar com o
arquivo local de teste protegido:

```bash
set -a
. /root/.config/habbux/phase2-test.env
set +a
HABBUX_LOAD_SCENARIO=auth HABBUX_LOAD_AUTH_SEED=1 HABBUX_SMOKE_CONNECTIONS=4 \
  nice -n 19 /opt/node22/bin/npm run core:load-smoke
```

### Execuções locais de referência

Em 2026-09-28, uma execução `session` mediu 25 conexões, com 2 sessões de
aquecimento e 3 PING/PONG por conexão; a janela medida foi 301 ms. Houve 25/25
handshakes e fechamentos, 75/75 respostas PONG e 0 sessões ativas no shutdown.
Resultados: abertura WebSocket p50/p95/p99 **53,94/94,07/100,71 ms**; handshake
Core **63,99/102,58/104,81 ms**; PING/PONG **42,40/63,82/105,63 ms**; 83,06
ciclos completos/s e 332,23 mensagens enviadas pelo cliente/s. O Emulator registrou
104,31 MiB de RSS, 12,17 MiB de heap usado, 22 threads, 0 coleções GC e 152,8% de
um núcleo durante a janela.

Uma execução `auth` isolada usou um usuário temporário gerado e removido pelo
script no DB de teste; 1 sessão de aquecimento e 4 logins medidos, cada um seguido
de PING/PONG. A janela foi 499 ms: 4/4 logins e fechamentos, sem falhas, rejeições
do executor ou sessões órfãs. Login p50/p95/p99 **270,93/413,09/413,09 ms**;
PING/PONG **5,13/19,07/19,07 ms**. Houve 8,02 ciclos completos/s e 24,05 mensagens
enviadas pelo cliente/s. O pool terminou com 0 conexões ativas, 0 pendentes e 2
ociosas antes do fechamento; o executor Auth terminou com 0 ativos, 0 na fila e 0
rejeitados. RSS foi 216,20 MiB, heap usado 97 MiB, 28 threads e 8 coleções GC
(74 ms) durante a janela. A execução mais recente também confirmou a remoção da
conta temporária: a base isolada terminou com 0 usuários e 0 credenciais.

Foi uma execução curta por cenário, feita no mesmo servidor compartilhado, sem
repetição estatística ou geração separada do Emulator. Os percentis Auth têm só 4
amostras. Não se avançou a níveis maiores nem a login storm: o resultado serve
apenas para validar o fluxo e registrar um ponto local. Não representa capacidade
sustentável, jogadores reais ou comportamento sob carga prolongada.

## Core v1: baseline do codec

Execução única em 2026-09-28, com Node v22.23.2, Linux x64, AMD EPYC Processor
(with IBPB), 4 CPUs lógicas. Comando:
`nice -n 19 env HABBUX_BENCH_ITERATIONS=250000 npm run core:benchmark`. Payload
PING de 4 bytes, 20.000 iterações de aquecimento:

| Operação | Duração | Operações/s |
|---|---:|---:|
| Encode | 413,09 ms | 605.202 |
| Decode | 142,89 ms | 1.749.560 |

Encode inclui criar o buffer e escrever o frame; decode inclui validação e cópia
defensiva do payload. Foi uma execução local sem repetição estatística, rede ou
JVM; use apenas como baseline do codec TypeScript nesta máquina.

## Progressão

Planejar níveis de 100, 500, 1.000, 2.500, 5.000 e 10.000+ conexões/jogadores
simulados, registrando qual população cada nível representa. São pontos de ensaio,
não metas garantidas. Avançar só se o nível anterior permanecer estável dentro dos
critérios de proteção e do orçamento definidos para o ambiente dedicado.

**100 WebSockets de smoke ou 10.000 WebSockets ociosos NÃO equivalem a jogadores
reais.**

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

Não executar carga prolongada neste servidor compartilhado com Gallaxys,
Peptídeos, Labsciences e Modelgold. A única exceção deste Core é o smoke local,
explicitamente limitado a 100 conexões loopback e sem tocar outros projetos.
Não reutilizar contas, bancos ou dados desses projetos.
Critérios de parada e capacidade permanecem **TBD** no
[orçamento de performance](../docs/performance/PERFORMANCE-BUDGET.md).
