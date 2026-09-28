# Habbux Emulator

Fundação Java 25 independente. O executável é um smoke check: valida configuração,
inicializa um event loop Netty, registra `starting`, `ready` e `stopped` em JSON e
encerra. **Não abre portas, não mantém um hotel online e não conecta a PostgreSQL
ou Redis.** `ready` significa apenas que esse bootstrap foi inicializado.

Na raiz do repositório, com um JDK 25 em `JAVA_HOME`:

```sh
nice -n 19 ./mvnw --batch-mode clean verify
HABBUX_ENV=development HABBUX_EVENT_LOOP_THREADS=1 HABBUX_SHUTDOWN_TIMEOUT_MS=5000 \
  "$JAVA_HOME/bin/java" -Xms32m -Xmx128m -XX:ActiveProcessorCount=2 \
  -jar apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar
```

O Maven Wrapper oficial usa Maven 3.9.16, distribuição HTTPS e SHA-256 fixo.
Escolhemos Maven por lifecycle estável, configuração declarativa e CI simples.
Plugins/dependências estão fixados; o BOM alinha os módulos Netty e JUnit, e o
Enforcer rejeita versões transitivas divergentes e dependências SNAPSHOT.
Maven não tem lockfile nativo: revisão de alterações no POM e convergência de
dependências são obrigatórias. Não há preview do Java nem daemon de build.
O timestamp do artefato é fixo; a reprodutibilidade byte a byte entre sistemas
diferentes ainda precisa ser medida. A distribuição do JDK também deve ser fixada
na infraestrutura de release futura.

## Configuração externa

Variáveis obrigatórias, sem leitura implícita de `.env`:

| Variável | Valores |
|---|---|
| `HABBUX_ENV` | `development`, `test`, `production` |
| `HABBUX_EVENT_LOOP_THREADS` | Inteiro de 1 a 32; usar 1 neste bootstrap |
| `HABBUX_SHUTDOWN_TIMEOUT_MS` | Inteiro de 1 a 30000; exemplo local: 5000 |

Os limites são proteção do bootstrap, não promessa de capacidade de produção.
Configuração inválida retorna código 2; falha operacional retorna 1; sucesso, 0.
Valores inválidos não são repetidos nos logs. Host, portas, credenciais e
integrações serão configuração externa quando o listener e a persistência
existirem; o bootstrap não consome `GAME_WS_PORT`.

## Dependências necessárias

- `netty-transport` 4.2.18.Final: lifecycle real de event loop com transporte NIO
  portátil. Não usamos `netty-all`, transporte nativo ou codecs ainda.
- SLF4J 2.0.20 e Logback 1.6.4: API de logging e encoder JSON maduro; sem biblioteca
  extra de JSON. O appender síncrono é suficiente para três logs do bootstrap.
  Logging no hot path exigirá política explícita de amostragem, fila limitada e
  tratamento de saturação antes de implementar tráfego.
- JUnit Jupiter 6.1.3: testes determinísticos de configuração e lifecycle.

Somente o thread de bootstrap aguarda os futures de inicialização/desligamento.
Nenhum I/O bloqueante é colocado no event loop. A API não expõe submissão de
trabalho: só uma tarefa interna de prontidão é enfileirada. Filas de produção,
backpressure e limites de mensagens são trabalho futuro obrigatório antes de
aceitar qualquer tráfego. O lifecycle deve ser chamado pelo mesmo thread de
controle; não é uma API concorrente de administração.

## Limites dos módulos futuros

Não criamos classes vazias para recursos ainda inexistentes. Os limites planejados
dentro de `com.habbux` são:

| Limite | Responsabilidade e regra |
|---|---|
| `bootstrap`, `config` | Composição, lifecycle e validação de configuração externa |
| `network`, `protocol` | Transporte, framing e contratos gerados de `packages/protocol`; sem regra de domínio |
| `auth`, `session`, `permission`, `moderation`, `command` | Identidade e autorização explícitas; sem confiar no client |
| `user`, `avatar`, `achievement` | Estado e progressão do usuário sob autoridade do servidor |
| `room`, `navigator`, `furniture`, `wired`, `pet`, `bot` | Eventos ordenados por quarto; estado isolado; sem thread por quarto |
| `catalog`, `inventory`, `economy` | Compras transacionais, idempotência e auditoria |
| `messenger`, `group` | Interações sociais com acesso por contratos definidos |
| `persistence`, `cache` | PostgreSQL oficial; Redis opcional e efêmero; nenhum SQL em hot path |
| `plugin` | APIs públicas versionadas; sem acesso irrestrito aos internals |
| `metrics` | Métricas de event loop, JVM e recursos; cardinalidade limitada |
| `common` | Somente utilidades pequenas comprovadamente compartilhadas |

O Room Engine será testável sem iniciar o processo inteiro. Nenhum desses
sistemas de gameplay foi implementado. Consulte `docs/architecture/EMULATOR.md`
e `docs/architecture/ROOM-CONCURRENCY.md` na raiz.
