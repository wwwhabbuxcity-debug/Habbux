# ADR 0008: HBX como formato nativo futuro

**STATUS:** Aceita

## CONTEXT

O runtime do client não deve depender de parsers de formatos de importação legados.

## DECISION

SWF e Nitro serão entradas do pipeline; HBX será a saída nativa futura. Definição v1 continua conceitual e decisões sem evidência ficam TBD.

## CONSEQUENCES

Exige ferramentas e validação próprias, além de estratégia de compatibilidade. Nenhum formato binário ou conversor está implementado.
