# Persistência e migrations

PostgreSQL é a fonte de verdade persistente. A primeira migration cria somente
identidade e credenciais do User/Auth Core; tabelas de gameplay não existem.
`migrations/` usa SQL versionado `Vnnnn__descricao.sql`, gerenciado por Flyway.
Seeds sintéticas e snapshots só serão adicionados quando houver conteúdo real.

Flyway é ferramenta de desenvolvimento/deploy, não dependência de runtime do
Emulator. O perfil Maven opcional `database-migrations` usa a mesma versão fixada
na imagem local e aceita credenciais de migration separadas. Ele lê
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_MIGRATION_USER` e
`POSTGRES_MIGRATION_PASSWORD` pelo ambiente; não passe senha na linha de comando.
Depois de carregar um arquivo local ignorado pelo Git:

```sh
set -a
. /caminho/seguro/habbux.env
set +a
./mvnw --batch-mode -Pdatabase-migrations flyway:validate
./mvnw --batch-mode -Pdatabase-migrations flyway:migrate
```

O usuário de runtime (`POSTGRES_USER`/`POSTGRES_PASSWORD`) deve ter somente
permissões DML necessárias. O usuário de migration é separado e não deve ser
carregado pelo processo do Emulator. Flyway mantém histórico/checksums e
serializa migrations. Não editar migrations aplicadas; fazer uma nova versão.
`clean` permanece desabilitado.

Depois da primeira migration, conceda ao usuário de runtime somente `SELECT` e
`INSERT` nas colunas usadas por login/cadastro e `USAGE/SELECT` na sequence de
identidade. Conceda colunas e operações explicitamente em cada nova migration; não
use privilégios padrão amplos. Não conceda `UPDATE`, `DELETE`, DDL, `CREATE DATABASE`
ou superuser ao runtime nesta fase. No Compose descartável local, o usuário inicial pode
ser dono para facilitar desenvolvimento; ambientes persistentes devem separar as
credenciais.

## Schema v1

- `users`: identidade `BIGINT GENERATED ALWAYS AS IDENTITY`, username/email
  originais e normalizados, status e timestamps `TIMESTAMPTZ`.
- `user_credentials`: relação 1:1 com o usuário e hash PHC Argon2id. Não guarda
  senha, token ou sessão persistente.
- Índices: PKs e constraints `UNIQUE` geram somente os índices usados pela busca
  de login por `username_normalized` ou `email_normalized`.
- Constraints rejeitam formato/tamanho inválido, status fora do conjunto,
  relações órfãs e hashes fora do formato PHC Argon2id v=19.

Username é ASCII, começa por letra, aceita letras/números/`_`, de 3 a 20 bytes;
comparação em minúsculas via `Locale.ROOT`. Email aceita formato ASCII básico com
domínio e TLD, até 254 caracteres; o produto compara o endereço inteiro sem
diferenciar maiúsculas. Validação de aplicação é mais estrita; unicidade e
normalização também são protegidas no banco.

Na raiz, após copiar `.env.example` para `.env`:

```sh
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data up -d
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data --profile tools run --rm migrations validate
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data --profile tools run --rm migrations migrate
```

O teste opcional de integração aplica migrations somente no banco local de nome
exato `habbux_phase2_test`, confirma `current_database()` antes de qualquer DDL e
limpa somente as duas tabelas Habbux desse banco. As variáveis `HABBUX_TEST_POSTGRES_*`
devem ficar em arquivo local ignorado e com modo `0600`; host precisa ser loopback.
O teste exige usuário de migration separado e papel de runtime `habbux_phase2_app`.
Sem as variáveis locais de teste, o teste PostgreSQL aparece como `SKIPPED`; isso
não é PASS de integração.

DDL é transacional no PostgreSQL quando suportado; operações como `CREATE INDEX
CONCURRENTLY` exigem estratégia explícita fora de transação. Deploy futuro usa
credencial exclusiva de migration, backup/restauração testados e mudanças
compatíveis por expansão/contração. Nunca executar migrations automaticamente
no loop de rede nem usar bancos de outros projetos para testes.
