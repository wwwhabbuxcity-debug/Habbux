# ADR 0002: Netty para rede

**STATUS:** Aceita

## CONTEXT

O emulador futuro precisa multiplexar muitas conexões sem uma thread bloqueante por jogador.

## DECISION

Usar Netty 4.2 como base de I/O quando o listener for implementado. A fundação só inicializa e encerra um event loop; ainda não há socket.

## CONSEQUENCES

Introduz dependência e disciplina de ownership de buffers/event loop. I/O bloqueante terá executor separado e limitado. Medir event-loop lag antes de estimar capacidade.
