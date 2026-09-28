# ADR 0003: PostgreSQL como fonte persistente

**STATUS:** Aceita

## CONTEXT

Identidade, propriedade e economia precisam sobreviver a reinícios com invariantes transacionais.

## DECISION

PostgreSQL é a fonte oficial dos dados persistentes. Schema será Habbux próprio e migrations versionadas.

## CONSEQUENCES

Requer backup, operação e migrations com compatibilidade. Hot paths mantêm estado ativo em RAM e não fazem query por movimento.
