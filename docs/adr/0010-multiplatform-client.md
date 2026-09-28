# ADR 0010: Uma codebase adaptativa

**STATUS:** Aceita

## CONTEXT

Desktop, tablet e mobile compartilham conteúdo e protocolo, embora tenham viewport, input e GPU distintos.

## DECISION

Manter um client responsivo e adaptar entrada/renderização a viewport, orientação, DPR e recursos disponíveis. Não criar três forks por dispositivo.

## CONSEQUENCES

Layouts e controles precisam testes em telas e inputs reais; acessibilidade e fallback de hardware permanecem requisitos contínuos.
