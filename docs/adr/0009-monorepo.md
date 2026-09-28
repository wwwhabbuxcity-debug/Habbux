# ADR 0009: Monorepo por módulos

**STATUS:** Aceita

## CONTEXT

Emulador, client, web, contratos e ferramenta de assets mudam juntos em algumas interfaces, mas têm runtimes distintos.

## DECISION

Manter módulos no mesmo Git com builds separados: Maven para Java e npm workspaces para TypeScript. Não criar serviços distribuídos sem necessidade.

## CONSEQUENCES

CI deve isolar responsabilidades e não obrigar banco para build simples. Versões e secrets não são inferidos a partir do ambiente de produção.
