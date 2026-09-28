# ADR 0005: Protocolo binário próprio e versionado

**STATUS:** Aceita

## CONTEXT

Client e emulador precisam de contrato comum e limites definidos sem importar protocolos de terceiros.

## DECISION

Definir Habbux Protocol v1; o registro canônico de IDs, direções, framing e tamanhos/formatos limitados dos payloads fica em `packages/protocol/protocol.json`. O framing e as mensagens Core têm codecs operacionais e vetores binários em `packages/protocol/golden-vectors-v1.txt`.

## CONSEQUENCES

Testes Java e TypeScript comparam os mesmos vetores e os IDs locais com o registro. Os enums locais ainda são declarações manuais, então toda mudança contratual precisa atualizar os três lados no mesmo diff. Alterações incompatíveis exigem nova versão. O Core define Auth mínima, mas não gameplay.
