# ADR 0016: Directory, lifecycle e execution do Room Engine v1

**STATUS:** Aceita

## Contexto

Quartos precisam serializar mudança de estado individual sem uma thread física
por quarto, sem lock global e sem executar caminho, banco ou broadcast no Netty
EventLoop. Activation/unload também deve sobreviver à concorrência entre joins,
disconnects e o timeout de idle. A máquina de destino inicial tem CPU e memória
limitadas; limites têm de ser reais e observáveis.

## Decisão

- `RoomId` é `long` positivo compatível com PostgreSQL `BIGINT` e `uint64` do
  protocolo.
- O diretório usa `ConcurrentHashMap` com cálculo atômico por ID e reserva por
  `Semaphore`, limitado a 128 quartos ativos/loading por padrão. Quartos só são
  carregados quando pedidos.
- Metadados/grade são buscados em executor JDBC separado, com dois workers e
  fila 64 por padrão; nenhuma consulta corre na mailbox.
- Dois workers compartilhados por padrão (máximo 8) consomem uma fila ready com
  capacidade de um slot por quarto. Cada quarto tem FIFO de 512 eventos por
  padrão. Um worker processa no máximo 32 eventos ou 2 ms por lote, depois cede
  a sala para trás da fila.
- Entrada e saída são eventos do mailbox. Saída é imutável e o adaptador agenda
  encoding/write no EventLoop. Bytes Netty não
  atravessam a fronteira do domínio.
- Idle sweep é um único scheduler de controle. Reserva e retirement pertencem
  ao slot do quarto; nova demanda cancela unload ainda não confirmado. Shutdown
  fecha conexões antes de drenar as mailboxes.
- Persistência guarda apenas metadados e grade estática. Presença e posição de
  entrada são runtime, sem SQL no caminho quente. Movimento e chat ficam para os
  próximos checkpoints.

## Consequências

Mailbox ou executor cheio rejeita explicitamente em vez de crescer memória sem
limite. O limite de tempo só atua entre eventos; um evento já iniciado não pode
ser interrompido, então pathfinding e protocolos impõem seus próprios limites.
O número padrão de workers e lotes é ponto de partida e não é promessa de
capacidade; carga deve ser medida no host real. Migração de runtime para processo
distribuído, transferência entre quartos e consistência em múltiplos servidores
exigirão novo protocolo e decisão.
