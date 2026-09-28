# Networking

Status: desenho inicial; não há listener de gameplay nesta etapa.

## Transporte e contrato

O transporte planejado é WebSocket binário sobre TLS na borda. O servidor usa
Netty. A especificação de framing, versões, IDs, payloads, handshake, heartbeat e
motivos de desconexão pertence a
[`packages/protocol`](../../packages/protocol/README.md) e
[Habbux Protocol v1](../protocol/HABBUX-PROTOCOL-v1.md).
`packages/protocol/protocol.json` é a fonte única dos números do contrato;
este documento não mantém outra tabela de IDs.

## Pipeline futuro

1. Validar upgrade HTTP, origem permitida, limites de conexões e tempo de handshake.
2. Limitar o tamanho do frame WebSocket e o total agregado antes de alocar um
   payload inteiro; fragmentação não pode contornar o limite da mensagem.
3. Validar versão, flags, ID e tamanho declarado conforme o contrato central.
4. Decodificar campos com limites, consumir exatamente o payload e rejeitar
   truncamento, bytes extras, valores impossíveis e UTF-8 inválido quando aplicável.
5. Validar estado da sessão, autenticação, autorização e rate limit da operação.
6. Traduzir em comando imutável e oferecer à fila limitada de seu proprietário.
7. Serializar a resposta autorizada e enviar somente enquanto o canal comportar.

Retenção/liberação de buffers Netty precisa de dono claro e teste de vazamento.
Dados que atravessam executores precisam de política explícita de posse; não
compartilhar buffers mutáveis apenas porque copiar parece custoso.

## Event loops e backpressure

Não executar SQL, acesso a arquivos, chamadas HTTP, espera por locks, compressão
pesada ou espera síncrona de futures no event loop. Tarefas caras vão para
executores limitados; a fila cheia produz rejeição previsível.

O canal de saída tem limite de bytes pendentes e tempo máximo sem progresso.
Consumidor lento pode ter admissões pausadas ou ser desconectado de forma
controlada. Coalescer atualização substituível pode ser permitido; não descartar
confirmação econômica, comando ou evento cuja ordem mude o resultado.

Limites por conexão, por identidade autenticada e globais possuem métricas. IP
não equivale a pessoa: NAT e proxies precisam ser considerados. Headers de IP
encaminhado só são confiáveis quando originados de proxies explicitamente
configurados; o cliente não pode escolher a identidade usada no rate limit.

## Ciclo da conexão

O handshake versionado deve concluir antes de comandos de domínio. Heartbeat
identifica conexões sem progresso; usa relógio monotônico e prazos externos.
Reconnect cria sessão explicitamente validada; não reaplica compras anteriores
sem chave de idempotência e consulta do resultado persistente.

Handshake não será tratado como autenticação. Sessão, identidade e permissões
continuam sendo verificados durante sua vida útil. A expiração/revogação deve
encerrar ou restringir acesso segundo contrato futuro.

## Observabilidade e testes

Medir conexões aceitas/rejeitadas, erros de decode, tempo de handshake,
mensagens/bytes, fila de saída, event-loop lag, timeouts e disconnect reasons.
Evitar labels de conexão/usuário em séries de métricas. Testar limites exatos,
fragmentação, desconexão parcial, consumidor lento e fuzzing em ambiente isolado.
Nenhum ensaio de carga deve ser executado neste servidor compartilhado.
