# ADR 0005: Protocolo binário próprio e versionado

**STATUS:** Aceita

## CONTEXT

Client e emulador precisam de contrato comum e limites definidos sem importar protocolos de terceiros.

## DECISION

Definir Habbux Protocol; registro canônico de IDs e framing fica em `packages/protocol/protocol.json`. A especificação inicial permanece draft até os codecs e schemas serem testados.

## CONSEQUENCES

Exige geração e testes compartilhados para evitar divergência. Alterações incompatíveis precisam nova versão; nenhuma interoperabilidade operacional é afirmada neste bootstrap.
