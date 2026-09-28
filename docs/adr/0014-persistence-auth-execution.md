# ADR 0014: JDBC, pool e executor de Auth limitados

**STATUS:** Aceita

## CONTEXTO

PostgreSQL é a fonte de verdade e SQL precisa ficar explícito. JDBC bloqueia, e
hashing de senha também consome recursos; nenhum dos dois pode executar no Netty
EventLoop. O servidor compartilha máquina pequena com outros serviços.

## DECISÃO

Usar PostgreSQL JDBC + HikariCP, sem ORM. Pool padrão: mínimo 1, máximo 2,
aquisição 1.500 ms, consulta 5 s, ociosidade 10 min e vida máxima 30 min. Flyway
Community é executado explicitamente com credencial de migration separada; não há
migration automática no boot. `AuthExecutor` usa dois workers, `ArrayBlockingQueue`
de oito e rejeição explícita quando saturado. Registro faz hashing antes da
transação e executa apenas inserts parametrizados dentro dela.

## CONSEQUÊNCIAS

Indisponibilidade e saturação podem recusar Auth sem bloquear event loops ou
consumir memória sem limite. Valores são defaults conservadores, não capacidade
medida. Métricas do pool e executor ajudam a observar pressão antes de alterar os
limites. Shutdown drena por prazo curto e cancela tarefas ainda enfileiradas.
