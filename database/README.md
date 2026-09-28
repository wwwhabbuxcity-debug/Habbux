# Persistência e migrations

PostgreSQL é a fonte de verdade; nenhuma tabela de gameplay existe nesta etapa.
O schema será próprio. `migrations/` recebe SQL versionado `V0001__descricao.sql`
e permanece versionado vazio para a montagem local do Flyway.
Seeds sintéticas e snapshots de schema só ganharão diretórios quando houver
conteúdo real. Snapshots servem para revisão, nunca como segunda fonte manual de
migrations.

Flyway é ferramenta de desenvolvimento/deploy, não dependência do emulador.
Ele mantém histórico/checksums e serializa migrations. Não editar migrations
aplicadas; fazer uma nova versão. `clean` permanece desabilitado.

Na raiz, após copiar `.env.example` para `.env`:

```sh
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data up -d
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data --profile tools run --rm migrations validate
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data --profile tools run --rm migrations migrate
```

O diretório `migrations/` vazio é intencional: não criar tabela fictícia para
obter um teste verde. Antes da primeira migration, adicionar teste de integração
em banco isolado e verificar criação do zero e upgrade de uma versão anterior. DDL é
transacional no PostgreSQL quando suportado; operações como `CREATE INDEX
CONCURRENTLY` exigem estratégia explícita fora de transação. Deploy futuro usa
credencial exclusiva de migration, backup/restauração testados e mudanças
compatíveis por expansão/contração. Nunca executar migrations automaticamente
no loop de rede ou usar bancos de outros projetos para testes.
