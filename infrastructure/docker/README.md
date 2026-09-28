# Serviços locais opcionais

Docker Engine com Compose v2 é requisito apenas para estes serviços. O Hello
World Java e os builds web/client não precisam de Docker, PostgreSQL ou Redis.
As imagens têm versões e digests fixos, verificados no registry oficial; revisão
de vulnerabilidades e atualização devem ocorrer em PR. O digest fixa o manifesto
multi-plataforma, sem baixar imagens durante validação de configuração.

```sh
cp .env.example .env
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data --profile cache --profile tools config --quiet
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile data up -d
# Redis somente quando uma necessidade concreta justificar:
docker compose --env-file .env -f infrastructure/docker/compose.yaml --profile cache up -d
```

Portas publicadas só em loopback; exemplos de senha são públicos e exclusivos
para desenvolvimento. Redis não persiste e recusa novos dados quando chega ao
limite: o consumidor deve tratar esse erro. Não usar este Redis opcional como
fonte de saldo/inventário. `down` preserva volumes; `down -v` apaga dados locais e
não faz parte do fluxo normal. Não iniciar esta stack no servidor compartilhado
sem avaliar portas e recursos. O Compose limita CPU/RAM, sem pretensão de ser
configuração de capacidade de produção.
