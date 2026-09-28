# Habbux

**Project status: EARLY DEVELOPMENT / NETWORK + PERSISTENCE FOUNDATION**

Habbux é uma plataforma multiplayer independente em fase inicial. Não é fork de
Polaris, Arcturus, Morningstar, Nitro ou Octane. O Core de transporte já abre
WebSocket binário e conclui handshake anônimo e ping/pong; não há login, gameplay,
conversor de assets ou engine de quartos. Nenhum código ou asset desses projetos
foi incorporado.

Princípios: **desempenho, estabilidade, baixa latência, escala e manutenção**.
Medir antes de otimizar; não prometer capacidade sem ensaio reproduzível.

## Visão da arquitetura

Java 25 + Netty formam a base do futuro servidor autoritativo orientado a eventos.
RAM mantém estado ativo; PostgreSQL é a fonte de persistência e Redis será
opcional para dados efêmeros com limites/expiração. O client usa TypeScript e
PixiJS em uma única codebase adaptativa para desktop, tablet e mobile.

O protocolo binário próprio possui registro canônico versionado e Core v1 de
rede. A base Auth/User contém schema, JDBC, hashing e executor limitado, ainda sem
fluxo de login integrado. O pipeline futuro importa SWF/Nitro e gera HBX nativo; o client não
interpretará esses formatos de importação. Web e futura API dependem de contratos,
sem acesso ao estado interno do emulador. Não há microserviços adicionais nem
frameworks de servidor adicionados por conveniência.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `apps/emulator` | Processo Java 25, listener WebSocket Netty, persistência/Auth foundation e testes |
| `apps/client` | Bootstrap TypeScript/PixiJS, codec e painel de diagnóstico |
| `apps/web` | Página mínima do projeto, sem produto definitivo |
| `packages/protocol` | Registro único de IDs, framing e limites |
| `asset-engine` | Pipeline conceitual de importação e geração HBX, sem ferramentas implementadas |
| `database` | Migration Flyway para usuários/credenciais; sem tabelas de gameplay |
| `infrastructure` | Compose local opcional, vhost, deploy estático e observabilidade |
| `tests`, `benchmarks` | Codec, integração, smoke limitado e baseline de codec |
| `tools` | Validação de contrato e higiene do repositório |
| `docs` | Arquitetura, protocolo, HBX, performance, segurança e ADRs |

## Requisitos de desenvolvimento

- JDK 25, sem preview. Maven é obtido pelo wrapper com versão e checksum fixos.
- Node.js 22.23.2 e npm 10.9.8 (lockfile versionado).
- Git, `curl` ou `wget` e `unzip` para o wrapper, acesso aos registries oficiais.
- Docker com Compose é opcional para dados; não é requisito do Hello World.

Versões de dependências são exatas; atualização é revisada em PR. Compilar com
`nice -n 19` em hosts compartilhados, sem builds paralelos. O Maven limita heap e
processadores em `.mvn/jvm.config`; Vite usa `RAYON_NUM_THREADS=1` nos exemplos.

## Instalação, build e testes

Na raiz do repositório:

```sh
java -version
node --version
nice -n 19 ./mvnw --batch-mode clean verify
nice -n 19 env NODE_OPTIONS=--max-old-space-size=512 npm ci
npm run typecheck
npm run protocol:validate
npm run protocol:test
npm run repository:check
nice -n 19 env NODE_OPTIONS=--max-old-space-size=512 RAYON_NUM_THREADS=1 npm run build
```

`clean verify` compila e executa testes de codec, handshake, timeout, pool/config,
Argon2id e executor. Integração PostgreSQL só roda com configuração para
`habbux_phase2_test`; sem ela aparece como `SKIPPED`. Typecheck cobre client e web. Para iniciar o Emulator em
loopback:

```sh
env HABBUX_ENV=development HABBUX_EVENT_LOOP_THREADS=1 HABBUX_SHUTDOWN_TIMEOUT_MS=5000 \
  HABBUX_BIND_HOST=127.0.0.1 HABBUX_PORT=3100 \
  "$JAVA_HOME/bin/java" -Xmx256m -XX:ActiveProcessorCount=2 -jar apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar
```

Em outro terminal, `npm run client:dev` abre o painel técnico, apontado por
`CLIENT_WS_URL` em `.env`. O smoke separado de até 100 conexões loopback pode ser
rodado com `nice -n 19 npm run core:load-smoke`; não mede capacidade de produção.
Build produz `apps/client/dist` e `apps/web/dist`, ignorados pelo Git.

Use `.env.example` como referência; copiar para `.env` não carrega variáveis no
processo Java automaticamente. O launcher recebe variáveis pelo ambiente. TLS/WSS
de produção exige uma borda proxy configurada em uma etapa própria. Comandos de
desenvolvimento Vite estão nos READMEs dos apps. Não exponha dev server na Internet.
Docker/migrations: [instruções locais](infrastructure/docker/README.md)
e [persistência](database/README.md).

## Documentação

- [Arquitetura v1](docs/architecture/ARCHITECTURE-v1.md)
- [Client multiplataforma](docs/architecture/CLIENT-MULTIPLATFORM.md)
- [Concorrência dos quartos](docs/architecture/ROOM-CONCURRENCY.md)
- [Dados e economia](docs/architecture/DATA-ARCHITECTURE.md)
- [Habbux Protocol](docs/protocol/HABBUX-PROTOCOL-v1.md)
- [HBX v1](docs/hbx/HBX-SPEC-v1.md)
- [Princípios de performance](docs/performance/PERFORMANCE-PRINCIPLES.md)
- [Orçamentos a medir](docs/performance/PERFORMANCE-BUDGET.md)
- [Segurança](docs/security/SECURITY-BASELINE.md)
- [Decisões arquiteturais](docs/adr/README.md)
- [Testes](tests/README.md) e [plano de benchmarks](benchmarks/README.md)
- [Dependências e licenças](THIRD_PARTY.md)

## Segurança e escopo

Nunca versionar senhas, tokens, chaves, certificados, `.env` real ou dados de
usuários. `.env.example` contém apenas valores locais falsos. O check automático
busca padrões conhecidos e não substitui revisão do diff antes de commit/push.
Segredos expostos devem ser revogados, não apenas removidos do último commit.

O CI valida os componentes existentes: Java/testes de integração locais,
client/web/typecheck, vetores de protocolo, higiene e configuração Compose. Não
afirma gameplay nem capacidade de produção. O fluxo Auth e gameplay ainda estão
em etapas posteriores.
