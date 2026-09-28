# Habbux Emulator

Emulator Java 25 com servidor Netty WebSocket para o Core v1. O processo fica em
execução até receber SIGTERM/SIGINT; usa loopback por padrão, PostgreSQL é
opcional, e não conecta a Redis ou aos demais projetos deste servidor. Auth e
Room Core existem; movimento, chat e Furniture Engine ainda não.

Na raiz do repositório, com JDK 25 e Node 22/npm 10:

```sh
nice -n 19 ./mvnw --batch-mode clean verify
nice -n 19 env PATH=/opt/node22/bin:$PATH NODE_OPTIONS=--max-old-space-size=512 npm ci
npm run protocol:validate
npm run protocol:test
```

Para iniciar manualmente, exporte as variáveis de `.env.example` no ambiente do
processo; Java não lê `.env` automaticamente:

```sh
env HABBUX_ENV=development HABBUX_EVENT_LOOP_THREADS=1 \
  HABBUX_SHUTDOWN_TIMEOUT_MS=5000 HABBUX_BIND_HOST=127.0.0.1 HABBUX_PORT=3100 \
  "$JAVA_HOME/bin/java" -Xms32m -Xmx256m -XX:ActiveProcessorCount=2 \
  -jar apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar
```

O Client local usa `CLIENT_WS_URL=ws://127.0.0.1:3100/ws`. Para encerrar, envie
SIGTERM ao PID específico do Emulator; o hook para novas conexões, fecha canais e
desliga os event loops. Não exponha o listener diretamente: terminação TLS e WSS
exigem proxy de borda configurado numa etapa de deploy própria.

## Configuração

| Variável | Padrão | Limites |
|---|---|---|
| `HABBUX_ENV` | obrigatória | `development`, `test`, `production` |
| `HABBUX_EVENT_LOOP_THREADS` | obrigatória | 1–32 |
| `HABBUX_SHUTDOWN_TIMEOUT_MS` | obrigatória | 1–30.000 ms |
| `HABBUX_BIND_HOST` | `127.0.0.1` | hostname/IP não vazio |
| `HABBUX_PORT` | `3100` | 0–65.535; 0 reservado para teste efêmero |
| `HABBUX_MAX_PAYLOAD_BYTES` | 65.536 | 16–65.536 bytes (SERVER_HELLO tem 16 bytes) |
| `HABBUX_HANDSHAKE_TIMEOUT_MS` | 10.000 | 100–60.000 ms |
| `HABBUX_IDLE_TIMEOUT_SECONDS` | 120 | 1–3.600 s |
| `HABBUX_MAX_CONNECTIONS` | 256 | 1–10.000 |
| `HABBUX_MAX_PRE_READY_MESSAGES` | 3 | 1–16 |
| `HABBUX_ALLOWED_ORIGINS` | localhost Vite | lista separada por vírgula, sem `*` |
| `HABBUX_ROOM_WORKERS` | 2 | 1–8 workers compartilhados |
| `HABBUX_MAX_ACTIVE_ROOMS` | 128 | 1–1.024 slots em loading/ativos |
| `HABBUX_ROOM_MAILBOX_CAPACITY` | 512 | 8–16.384 eventos por quarto |
| `HABBUX_ROOM_EVENTS_PER_RUN` | 32 | 1–1.024 eventos por lote |
| `HABBUX_ROOM_MAX_RUN_MS` | 2 | 1–100 ms; verificado entre eventos |
| `HABBUX_ROOM_IDLE_TIMEOUT_MS` | 30.000 | 100–3.600.000 ms |
| `HABBUX_MAX_ROOM_CAPACITY` | 100 | 1–100 presenças por quarto |
| `HABBUX_ROOM_IO_QUEUE_CAPACITY` | 64 | 1–4.096 ativações aguardando JDBC |

Origem ausente é permitida para clientes nativos; uma origem enviada pelo browser
precisa corresponder exatamente à allowlist. A configuração de produção deve
incluir apenas a origem publicada, junto com o proxy WSS.

## Dependências e lifecycle

- `netty-codec-http` e `netty-handler` 4.2.18.Final: HTTP upgrade, WebSocket,
  agregação limitada e idle timeout; BOM central mantém módulos na mesma versão.
- SLF4J 2.0.20 e Logback 1.6.4: logs JSON em appender assíncrono de fila limitada,
  para que o event loop não escreva em console diretamente.
- JUnit Jupiter 6.1.3: codec, configuração e integração WebSocket local.

O controle de lifecycle espera futures somente na thread principal/teste. O
event loop não executa I/O de aplicação, banco, filesystem, sleeps ou `.get()`.
O registry de sessões é concorrente e limitado pela admissão; cada conexão usa
os event loops partilhados do Netty, sem thread dedicada.

Se PostgreSQL estiver configurado, o Room Core lê quartos sob demanda em um
executor JDBC separado. Presença e posição de entrada ficam em memória. Com Room
Core ativo, `HABBUX_MAX_PAYLOAD_BYTES` precisa ser pelo menos 7.308
bytes para comportar o maior snapshot v1 possível; o default permanece 65.536.

Teste local separado de 100 conexões: depois de `mvn clean verify`, dependências
Node instaladas e Java 25 ativo, rode `nice -n 19 npm run core:load-smoke`. O
script inicia um processo local em loopback, faz handshake/ping/pong/disconnect
em cada WebSocket e confere counters zerados no shutdown. O ensaio não estima
capacidade de produção.
