# ADR 0007: TypeScript e PixiJS

**STATUS:** Aceita

## CONTEXT

A camada gráfica precisa de tipos e APIs de renderização de baixo nível, mantendo inputs em uma base compartilhada.

## DECISION

Usar TypeScript strict e PixiJS 8 na codebase de client. Bootstrap renderiza uma forma sob demanda apenas para validar o pipeline.

## CONSEQUENCES

Acrescenta build/bundling e custo gráfico. Compatibilidade de GPU, memória e touch deve ser verificada em dispositivos reais antes de metas de qualidade/capacidade.
