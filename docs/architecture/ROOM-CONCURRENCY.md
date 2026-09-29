# Concorrência do Room Engine v1

Status: **checkpoints 1–3 implementados: lifecycle, diretório, scheduler,
mailbox, presença, grade estática, entrada/saída, pathfinding, movimento, chat
limitado e UI diagnóstica do Client**. Baselines de carga e a auditoria final de
falhas e desempenho pertencem ao checkpoint 4.

## Autoridade e ordem

Cada `RoomRuntime` possui um único proprietário lógico: o worker que executa seu
mailbox naquele lote. A fila FIFO é limitada (padrão 512 eventos por quarto) e
preserva a ordem em que o mailbox aceita comandos concorrentes. Eventos do mesmo
quarto nunca executam ao mesmo tempo; quartos diferentes usam workers distintos
quando disponíveis.

O `RoomScheduler` tem dois workers fixos por padrão, limitados a oito, e fila de
salas prontas limitada ao máximo de quartos ativos (padrão 128). Não existe uma
thread por quarto, worker pinado a um quarto ou lock global para o estado do
hotel. Cada lote cede após no máximo 32 eventos **ou 2 ms**, o que ocorrer
primeiro. Um evento individual já iniciado não é interrompido; busca de caminho
é limitada a 4.096 nós e 128 passos por padrão.

```text
Netty EventLoop → valida frame/estado → mailbox limitado por RoomId
                                    → worker compartilhado
                                    → mutação exclusiva + eventos imutáveis
Netty EventLoop ← tarefas de saída ordenadas pela origem do quarto
```

O Room Engine não recebe `ByteBuf`, canal mutável nem `User` completo. `RoomClient`
é um adaptador não bloqueante: transforma mensagens imutáveis em tarefas do
EventLoop. A escrita verifica o estado de backpressure do canal; conexão sem
capacidade de escrita é fechada pelo limite de saída já existente no Core.

## Diretório, ativação e lifecycle

O diretório é `ConcurrentHashMap<RoomId, Slot>` com reserva atômica por chave e
`Semaphore` para limitar quartos em loading/ativos (padrão 128). Só ativa um
quarto sob demanda; não faz preload da tabela. Um executor separado de dois
workers e fila limitada (padrão 64) lê metadados e grade do PostgreSQL, sem SQL
no EventLoop nem no worker de gameplay. Falha de ativação libera a reserva.

Estados runtime: `LOADING → IDLE ↔ ACTIVE → UNLOADING → CLOSED`. A entrada muda
`IDLE` para `ACTIVE`; saída do último ocupante muda para `IDLE`. Um único
agendador de controle verifica idle timeout (padrão 30 s). Admissão e retirement
usam estado por slot; uma entrada concorrente atualiza a atividade e cancela
unload antes da transição a `CLOSED`, ou espera o slot sair do diretório e ativa
uma nova instância. A capacidade de quartos continua reservada até remover o slot.

No shutdown, o servidor fecha listener e canais primeiro, aceita os eventos de
leave enviados por `channelInactive`, para o executor de I/O, enfileira drenagem
de cada runtime, espera os workers dentro do timeout e só então encerra os
EventLoops. Timeout/falha de drenagem é reportado pelo bootstrap; não confirma
cleanup sem checagem.

## Presença e persistência

Uma conexão autenticada mantém zero ou um quarto (`NONE`, `JOINING`, `IN_ROOM`,
`LEAVING`).
O principal é copiado para presença mínima (`session UUID`, user ID, username,
posição e adaptador de saída). Capacidade e alocação de posição são verificadas
no owner do quarto, então concorrência não ultrapassa o limite. Máximo de
capacidade é 100; entrada em grid sem tile livre retorna “cheio”. Leave duplo é
idempotente e disconnect cancela join pendente e enfileira remoção. O mesmo
user ID não pode ocupar duas presenças no mesmo quarto; sessões do mesmo usuário
podem entrar em quartos diferentes.

PostgreSQL persiste somente proprietário, nome, descrição, capacidade,
dimensões, walkability, spawn e timestamps. Grid estática é limitada a 64×64
(4.096 tiles), com um byte por tile. Ocupantes, posições, caminhos, mailbox,
estado e relógios existem somente em RAM. SQL acontece na ativação e criação
explícita; interações em runtime não consultam o banco. Quarto ativo
continua operando se PostgreSQL ficar indisponível depois da ativação.

Cada pedido recebe somente o destino; o servidor calcula BFS em grade sem pesos,
com vizinhos cardinais na ordem norte/oeste/leste/sul. Diagonais e corte de canto
não existem. A busca reutiliza arrays pelo owner e guarda somente o caminho
limitado de cada presença em movimento.

## Snapshot, spawn e tráfego

Spawn busca em largura a partir do spawn configurado, ordem fixa norte/oeste/
leste/sul, ignorando tiles bloqueados e ocupados. Se não houver tile livre,
entrada falha sem sobrepor ocupantes. O payload de snapshot tem no máximo 7.438
bytes: nome de até 128 bytes UTF-8, 4.096 bytes de grade, até 100 entradas com
ID/posição/username de até 20 bytes e campos fixos. O limite de frame deve
comportar esse snapshot; o limite global do protocolo continua 65.536.

Um ticker compartilhado acorda a cada 100 ms, inspeciona o diretório limitado e
envia tick pela mailbox só aos quartos com movimento pendente. Cada tick avança
até 16 presenças por quarto em rotação FIFO. Caminhos têm no máximo 128 passos;
destino bloqueado/ocupado, sem caminho ou busca acima de 4.096 nós resulta em
falha limitada. Movimento não consulta SQL.

Chat limita cada mensagem a 256 bytes UTF-8 e 128 code points, rejeita vazio e
caracteres de controle e aplica intervalo padrão de 1.000 ms por presença. O
conteúdo fica somente em memória e é transmitido pela mailbox do quarto; o Client
retém no máximo 50 mensagens localmente para diagnóstico.

Respostas geradas pelo quarto são enfileiradas no EventLoop. Uma conexão lenta
não segura o worker: writes não aguardam socket, e a fila Netty existente fecha
a conexão se passar o high watermark de 64 KiB. Saturação de mailbox rejeita o
evento explicitamente; eventos críticos de cleanup usam reserva na mesma FIFO,
sem exceder sua capacidade total.

## Observabilidade e teste

O snapshot de métricas conta quartos ativos/usuários, profundidade atual e máxima
de mailbox, workers vivos/ativos, eventos aceitos/rejeitados/processados,
handler failures, joins/falhas, saídas, pedidos e resultados de pathfinding,
chats, ativações/unloads e latência média de processamento. Histogramas fixos
com buckets logarítmicos estimam p50/p95/p99 de fila, join e movimento com custo
limitado por evento. Esses percentis são aproximados e servem para diagnóstico.
Testes do checkpoint atual cobrem 10 mil eventos ordenados, paralelo entre
quartos, justiça por quantidade e tempo de lote, mailbox cheia, handler
exception, 100 entradas no mesmo quarto, activation race, unload/rejoin,
cancelamento durante ativação, disconnect, leave duplo, ausência do quarto e
shutdown. Pathfinding/movimento cobrem rota cardinal ao redor de obstáculos,
passos por tick, colisão, destino inválido, trecho desconectado e limites de
busca/caminho. Chat cobre broadcast ordenado, texto Unicode, validação, rate
limit e integração com WebSocket; cenários de carga e a auditoria final ficam no
checkpoint 4.

Essas garantias de teste não definem capacidade sustentável. Use o relatório de
load smoke distribuído e de hot room para resultados, percentis e condições da
máquina observada. Benchmarks do scheduler sem rede cobrem 100 e 1.000 mailboxes;
isso também não define capacidade sustentável. Furniture,
economia, bots, direitos de quarto e transferência entre quartos continuam fora
do Room Engine v1.
