# ADR 0011: Maven com wrapper

**STATUS:** Aceita

## CONTEXT

A construção Java precisa de versão reproduzível, CI simples e uso sem instalar Maven de sistema.

## DECISION

Usar Maven 3.9.16 através do wrapper oficial only-script versão 3.3.4 com SHA-256 fixado; plugin/dependências têm versões explícitas e Java 25 verificado.

## CONSEQUENCES

O primeiro download ainda requer acesso ao Central; checksum protege a distribuição. Maven centraliza reactor/testes, mas não fixa sozinho JDK/OS. Sem snapshots/ranges externos.
