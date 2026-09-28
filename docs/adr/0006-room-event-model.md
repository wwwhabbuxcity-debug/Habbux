# ADR 0006: Estado lógico por quarto

**STATUS:** Aceita

## CONTEXT

Quartos precisam mutação ordenada e isolamento sem lock global e sem uma thread física por sala.

## DECISION

Um worker de pool limitado executa fila limitada de cada quarto sequencialmente; quartos diferentes podem progredir em paralelo. Cada quarto tem um proprietário lógico.

## CONSEQUENCES

Saturação exige rejeição explícita. Transferências entre quartos e trabalho persistente requerem protocolo próprio. O Room Engine v1 implementa scheduler e mailbox limitados; transferências seguem fora do escopo.

Implementação do lifecycle, mailbox limitada, workers compartilhados, diretório
sob demanda e shutdown está descrita no [ADR 0016](0016-room-engine-execution.md).
