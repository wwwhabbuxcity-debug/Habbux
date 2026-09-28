# Concorrência do Room Engine v1

Status: **checkpoint 1 implementado: lifecycle, diretório, scheduler, mailbox,
presença, entrada/saída e spawn sobre grade estática**. Movimento, chat e load
baselines pertencem aos checkpoints posteriores.

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
primeiro. Um evento individual já iniciado não é interrompido; movimento terá
limites próprios para reduzir esse custo.

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

Uma conexão autenticada mantém zero ou um quarto (`NONE`, `JOINING`, `IN_ROOM`).
O principal é copiado para presença mínima (`session UUID`, user ID, username,
posição e adaptador de saída). Capacidade e alocação de posição são verificadas
no owner do quarto, então concorrência não ultrapassa o limite. Máximo de
capacidade é 100; entrada em grid sem tile livre retorna “cheio”. Leave duplo é
idempotente e disconnect cancela join pendente e enfileira remoção.

PostgreSQL persiste somente proprietário, nome, descrição, capacidade,
dimensões, walkability, spawn e timestamps. Grid estática é limitada a 64×64
(4.096 tiles), com um byte por tile. Ocupantes, posições, caminhos, mailbox,
estado e relógios existem somente em RAM. SQL acontece na ativação e criação
explícita; interações em runtime não consultam o banco. Quarto ativo
continua operando se PostgreSQL ficar indisponível depois da ativação.

## Snapshot, spawn e tráfego

Spawn busca em largura a partir do spawn configurado, ordem fixa norte/oeste/
leste/sul, ignorando tiles bloqueados e ocupados. Se não houver tile livre,
entrada falha sem sobrepor ocupantes. O payload de snapshot tem no máximo 7.308
bytes: 4.096 bytes de grade, até 100 entradas com ID/posição/username ASCII de
até 20 bytes e campos fixos. O processo com Room Engine habilitado exige
`HABBUX_MAX_PAYLOAD_BYTES >= 7308`; o limite global do protocolo continua 65.536.

Respostas geradas pelo quarto são enfileiradas no EventLoop. Uma conexão lenta
não segura o worker: writes não aguardam socket, e a fila Netty existente fecha
a conexão se passar o high watermark de 64 KiB. Saturação de mailbox rejeita o
evento explicitamente; eventos críticos de cleanup usam reserva na mesma FIFO,
sem exceder sua capacidade total.

## Observabilidade e teste

O snapshot de métricas conta quartos ativos, workers vivos, eventos aceitos,
rejeitados/processados, handler failures, maior mailbox e atraso médio de fila.
Testes do checkpoint atual cobrem 10 mil eventos ordenados, paralelo entre
quartos, justiça por quantidade e tempo de lote, mailbox cheia, handler
exception, 100 entradas no mesmo quarto, activation race, unload/rejoin,
cancelamento durante ativação, disconnect, leave duplo, ausência do quarto e
shutdown. Pathfinding, movimento, chat e cenários de carga ficam para os
próximos checkpoints.

Essas garantias de teste não definem capacidade sustentável. Use o relatório de
load smoke para limites, percentis e condições da máquina observada. Furniture,
economia, bots, direitos de quarto e transferência entre quartos continuam fora
do Room Engine v1.
