# Habbux Protocol v1 — draft

Especificação inicial própria, sem compatibilidade com protocolos de outros
hotéis. Não há listener, encoder/decoder ou gameplay implementado nesta etapa.
`packages/protocol/protocol.json` é a fonte única dos IDs e limites; o validador
da fundação confere o registro, não valida tráfego de rede.

## Transporte e framing

WebSocket binário sobre TLS na borda. Uma mensagem WebSocket reconstituída contém
exatamente um frame Habbux: VERSION (uint8), MESSAGE_ID (uint16), FLAGS (uint8),
PAYLOAD_LENGTH (uint32) e PAYLOAD. Inteiros sem sinal em big endian. Cabeçalho de
8 bytes; comprimento refere-se somente ao payload. Limite inicial de payload:
64 KiB, configurável futuramente apenas dentro do teto negociado. Mensagens
maiores exigem outro contrato; não aumentar limites silenciosamente.

Limitar também tamanho agregado durante fragmentação WebSocket, antes de
alocar/copy ou decodificar. Comprimento recebido deve coincidir exatamente com o
frame, com soma verificada contra overflow. Frames truncados, bytes extras,
texto, versão desconhecida, ID desconhecido, direção inválida e flags reservadas
são erros de protocolo. Todos os bits de FLAGS estão reservados como zero.
Compressão WebSocket fica desabilitada inicialmente, evitando amplificação e
custo de CPU até medição específica. Não interpretar comprimento como int
assinado nem aceitar alocações comandadas pelo cliente.

## Payload e compatibilidade

Codec binário e schemas dos cinco controles: **TBD**, antes de qualquer conexão
real. Não serializar objetos Java, executar scripts ou usar JSON para gameplay
frequente. Strings futuras terão encoding UTF-8 e limites em bytes e caracteres;
coleções terão teto de itens; valores inválidos serão rejeitados, não truncados.

Cada schema terá campos, ranges, obrigatoriedade, direção, autorização e
compatibilidade explícitos. Não reutilizar IDs removidos; reservar tombstones.
Mudança incompatível de framing/schema exige nova versão. Política de janela de
suporte é TBD; não assumir que clientes antigos continuam válidos. O handshake
básico precisa permanecer decodificável durante negociação de versões.

## Ciclo da conexão planejado

Após upgrade, conexão não autenticada envia HELLO dentro de prazo configurado.
Servidor valida origem permitida, versão e limites; devolve WELCOME somente após
negociação aceita. Formato de ticket de autenticação, sua emissão pela API,
expiração curta, uso único e defesa contra replay são TBD. Nenhum segredo deve
ir na URL ou em logs. Não aceitar eventos de domínio antes de autenticação e
autorização. Logout/revogação precisam invalidar a sessão.

PING/PONG de aplicação medirão RTT/liveness com correlação; ping/pong nativo do
WebSocket também exige limite para evitar abuso. Intervalos, tolerância a abas
suspensas e prazo de desconexão são TBD e externos. Não usar o relógio do cliente
como autoridade. DISCONNECT informa motivo estável do registro; o mapeamento
para códigos Close WebSocket válidos é TBD. Encerramento abrupto ainda precisa
limpar recursos, sem depender do recebimento de DISCONNECT.

## Erros e proteção

Distinguir erro de protocolo, validação, autenticação, autorização, domínio,
infraestrutura e interno conforme `docs/architecture/ERROR-MODEL.md`. Mensagens
malformadas graves encerram a conexão com código genérico, sem stack trace.
Rejeições de domínio futuras podem manter a conexão. Nunca devolver SQL,
credenciais ou detalhes internos. Rate limits por origem, conexão, sessão e tipo
de mensagem; filas de entrada/saída limitadas; quotas e política de sobrecarga
antes de enfileirar. Leituras pausadas/desconexão devem ser decisões explícitas.

## Fonte única e próximos testes

A geração Java/TypeScript partirá do registro e schemas versionados. Não criar
listas paralelas. CI futura verificará geração limpa e fixtures compartilhadas
para byte order, limites, fragmentação, frames inválidos, compatibilidade entre
versões e round-trip. Fuzzing terá tempo/memória limitados. Heartbeat e handshake
serão testados com relógio controlável, sem sleeps arbitrários. Essa etapa só
testa integridade do catálogo; não afirma interoperabilidade de um codec ausente.
