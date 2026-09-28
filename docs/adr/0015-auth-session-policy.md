# ADR 0015: Política local de Auth e associação de usuário

- Status: aceito
- Data: 2026-09-28

## Decisão

Login, cadastro, hashing Argon2id e SQL usam um executor fixo e limitado, fora do
EventLoop. A sessão guarda apenas `UserIdentity` (ID e username). É permitido ao
mesmo usuário autenticar em várias conexões; logout limpa somente a associação
da sessão atual. Não há token nem sessão persistida nesta etapa.

Cada canal aceita uma operação Auth por vez e limita cinco pedidos por minuto.
Falhas por identidade normalizada são mantidas em estruturas LRU limitadas e
localizadas em 64 stripes; cinco falhas em 15 minutos causam pausa temporária de
60 segundos. Esse limitador não coordena múltiplas instâncias. O cadastro e o
login apresentam mensagens genéricas para não revelar existência de contas.

## Consequências

O usuário pode ter múltiplas conexões, sem estado distribuído ou política de
substituição prematura. Em implantação com mais de uma instância, coordenação de
sessão e rate limit distribuído podem ser avaliados; PostgreSQL continua fonte da
verdade. A conexão externa deve usar WSS e limites confiáveis na borda.
