# Fonte única do Habbux Protocol

`protocol.json` é o registro canônico versionado de framing, limites, IDs de
controle e motivos de desconexão. A especificação humana está em
[`docs/protocol/HABBUX-PROTOCOL-v1.md`](../../docs/protocol/HABBUX-PROTOCOL-v1.md).

Nenhum enum de mensagens independente deve ser escrito à mão no Java/TypeScript.
Quando o codec for implementado, um gerador pequeno lerá este registro e os
schemas de payload, emitirá tipos/IDs/codecs para ambas as linguagens e fixtures
binárias de referência. CI verificará geração determinística e diferenças de
arquivos gerados. Até lá o registro é documentação validável, não um protocolo
operacional. Não duplicar o catálogo fora deste diretório.

Validar: `npm run protocol:validate`; regressões: `npm run protocol:test`.
