# Habbux

**Project status: EARLY DEVELOPMENT / FOUNDATION**

Habbux é uma plataforma multiplayer independente em fase de fundação. Não é fork
de Polaris, Arcturus, Morningstar, Nitro ou Octane. Não há
hotel jogável, protocolo operacional, conversor de assets ou engine de quartos
neste commit. Nenhum código ou asset desses projetos foi incorporado.

Princípios: **desempenho, estabilidade, baixa latência, escala e manutenção**.
Medir antes de otimizar; não prometer capacidade sem ensaio reproduzível.

## Visão da arquitetura

Java 25 + Netty formam a base do futuro servidor autoritativo orientado a eventos.
RAM mantém estado ativo; PostgreSQL será a fonte de persistência e Redis será
opcional para dados efêmeros com limites/expiração. O client usa TypeScript e
PixiJS em uma única codebase adaptativa para desktop, tablet e mobile.

O protocolo binário próprio possui um registro canônico versionado. O pipeline
futuro importa SWF/Nitro e gera HBX nativo; o client não interpretará esses formatos
de importação. Web e futura API dependem de contratos, sem acesso ao estado
interno do emulador. Não há microserviços adicionais nem frameworks de servidor
adicionados por conveniência.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `apps/emulator` | Bootstrap Java, configuração externa, lifecycle, logs e testes |
| `apps/client` | Bootstrap TypeScript/PixiJS e limites do client |
| `apps/web` | Página mínima do projeto, sem produto definitivo |
| `packages/protocol` | Registro único de IDs, framing e limites |
| `asset-engine` | Pipeline conceitual de importação e geração HBX, sem ferramentas implementadas |
| `database` | Migrations SQL com Flyway opcional, sem tabelas de gameplay |
| `infrastructure` | Compose local opcional, vhost, deploy estático e observabilidade |
| `tests`, `benchmarks` | Testes existentes; integração, e2e e carga descritos sem diretórios vazios |
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

`clean verify` compila e executa os testes Java. Typecheck cobre client e web;
build produz `apps/client/dist` e `apps/web/dist`, ignorados pelo Git. O smoke Java
inicia, informa ready e encerra sem abrir portas:

```sh
env HABBUX_ENV=development HABBUX_EVENT_LOOP_THREADS=1 HABBUX_SHUTDOWN_TIMEOUT_MS=5000 \
  java -Xmx128m -XX:ActiveProcessorCount=1 -jar apps/emulator/target/habbux-emulator-0.1.0-SNAPSHOT.jar
```

Use `.env.example` como referência; copiar para `.env` não carrega variáveis no
processo Java automaticamente. O launcher recebe variáveis pelo ambiente.
Portas futuras são categorias configuráveis, não listeners já implementados.
Comandos de desenvolvimento Vite estão nos READMEs dos apps. Não expor dev server
na Internet. Docker/migrations: [instruções locais](infrastructure/docker/README.md)
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

O CI valida somente componentes existentes: Java/testes, client/web/typecheck,
registro de protocolo, higiene e configuração Compose. Não afirma testes de
integração, gameplay ou carga inexistentes. Esta etapa termina na fundação;
implementação do jogo depende de uma próxima tarefa explícita.
