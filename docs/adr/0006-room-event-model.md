# ADR 0006: Estado lógico por quarto

**STATUS:** Aceita

## CONTEXT

Quartos precisam mutação ordenada e isolamento sem lock global e sem uma thread física por sala.

## DECISION

Um worker de pool limitado executa fila limitada de cada quarto sequencialmente; quartos diferentes podem progredir em paralelo. Cada quarto tem um proprietário lógico.

## CONSEQUENCES

Saturação exige backpressure e rejeição explícita. Transferências entre quartos e trabalho persistente requerem protocolo próprio. Não implementado nesta fundação.
