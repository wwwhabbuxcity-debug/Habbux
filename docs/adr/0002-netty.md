# ADR 0002: Netty para rede

**STATUS:** Aceita

## CONTEXT

O emulador precisa multiplexar conexões sem criar uma thread bloqueante por cliente.

## DECISION

Usar Netty 4.2 para o listener WebSocket e I/O assíncrono. O Core v1 já liga em loopback; não executa gameplay nem usa thread por conexão.

## CONSEQUENCES

Introduz dependência e disciplina de ownership de buffers/event loop. O codec copia payload validado para frame imutável; handlers transferem a posse de buffers de saída. Não há I/O de negócio bloqueante. Medir event-loop lag antes de estimar capacidade.
