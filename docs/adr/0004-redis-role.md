# ADR 0004: Redis opcional e efêmero

**STATUS:** Aceita

## CONTEXT

Presença, rate limit e coordenação podem exigir estado compartilhado temporário; não devem criar uma segunda verdade permanente.

## DECISION

Redis pode ser adicionado para cache, presença, sessão ou coordenação com TTL/limites. Não é requisito do Hello World nem autoridade de economia.

## CONSEQUENCES

Indisponibilidade exige comportamento por caso de uso. Cada chave requer dono, tamanho, expiração, invalidação e fallback definidos; introduzir somente com necessidade concreta.
