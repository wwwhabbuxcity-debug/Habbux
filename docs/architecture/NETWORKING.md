# Networking

Status: **Core de transporte v1 implementado; gameplay ainda não existe.**

## Transporte e contrato

O transporte é WebSocket binário com caminho `/ws`. A borda TLS/WSS ainda não foi
configurada; o servidor local escuta em loopback por padrão. Framing, versões,
IDs, tamanhos, handshake e erros pertencem a
[`packages/protocol`](../../packages/protocol/README.md) e
[Habbux Protocol v1](../protocol/HABBUX-PROTOCOL-v1.md).
`packages/protocol/protocol.json` é a fonte canônica dos números do contrato.

## Pipeline implementado

1. Netty valida upgrade HTTP, origem enviada e limite de conexões; limita o
   handshake WebSocket e agrega fragmentos.
2. O tamanho WebSocket total fica limitado ao cabeçalho de 8 bytes mais o payload
   configurado, cujo teto é 65.536 bytes.
3. O codec valida versão, flags, ID e comprimento antes de copiar o payload.
4. Cada mensagem WebSocket binária contém exatamente um frame. Texto, truncamento,
   bytes extras e mensagens incompatíveis são encerrados de forma genérica.
5. O Core valida direção, tamanho dos payloads de controle e estado anônimo da
   sessão. Não há autenticação, autorização nem comandos de domínio.
6. PING/PONG de aplicação ecoa um uint32 big-endian; frames de controle WebSocket
   continuam sob responsabilidade do Netty.

Buffers ByteBuf de entrada pertencem ao handler Netty e são liberados pelo ciclo
do WebSocket; o frame imutável mantém cópia própria do payload. O encoder transfere
o ByteBuf de saída ao canal, que o libera após escrita ou falha.

## Event loops, limites e ciclo

Não executar SQL, filesystem, chamadas HTTP, sleeps ou espera síncrona de futures
no event loop. Não há threads por conexão. O Core usa event loops Netty, registry
concorrente, admissão limitada e uma tarefa agendada de handshake por conexão.
Cada canal limita a fila de saída com high watermark de 64 KiB; se o canal seguir
sem capacidade de escrita ao responder, a conexão é encerrada para não acumular
PONGs indefinidamente. O client normal mantém no máximo um PING pendente.

Defaults configuráveis: bind `127.0.0.1:3100`, payload máximo 65.536 bytes,
handshake 10 s, inatividade 120 s, 256 conexões e três mensagens antes de READY.
Handshake não é autenticação. Sessões de transporte recebem UUID aleatório e
seguem CONNECTED → HANDSHAKING → READY → DISCONNECTED. Disconnect, erro, timeout e
shutdown removem a sessão do registry.

Filas de gameplay, identidade/autorização e rate limit por operação ainda precisam
de projeto antes de qualquer mensagem de domínio.
Não encaminhar `X-Forwarded-For` sem proxy confiável configurado.

## Observabilidade e testes

O Core expõe contadores internos de conexões/sessões ativas, frames recebidos e
enviados, frames inválidos e conexões rejeitadas. Logs JSON registram start,
stop, conexão, sessão pronta, timeout, violações e exceções; não registram payload
nem PING individual. Appender assíncrono usa fila limitada.

Os testes verificam codec e vetores comuns em Java/TypeScript, handshake real,
PING/PONG, desconexão, timeout, 24 conexões simultâneas e entradas inválidas
determinísticas. O smoke separado cobre 100 conexões loopback; isso não estima
capacidade máxima ou número de jogadores.
