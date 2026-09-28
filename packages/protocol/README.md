# Fonte canônica do Habbux Protocol

`protocol.json` define framing, limites, direções, IDs e tamanhos fixos das
mensagens Core. `golden-vectors-v1.txt` é compartilhado pelos testes Java e
TypeScript. As regras legíveis estão em
[`docs/protocol/HABBUX-PROTOCOL-v1.md`](../../docs/protocol/HABBUX-PROTOCOL-v1.md).

Java e TypeScript declaram enums locais para uso tipado; testes comparam os IDs
ao registro e ambos decodificam os mesmos vetores em bytes. Uma alteração de
contrato precisa atualizar o JSON, a especificação e os dois codecs na mesma
mudança; divergências falham nos testes. Não criar um catálogo paralelo.

Validar o contrato e vetores: `npm run protocol:validate` e
`npm run protocol:test`.
