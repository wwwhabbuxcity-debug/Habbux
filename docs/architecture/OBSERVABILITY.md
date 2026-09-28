# Observabilidade

Status: Core registra lifecycle, conexões e erros em JSON e mantém contadores
internos agregados. Não há plataforma de monitoramento instalada por este documento.

## Logs estruturados

Usar registros JSON com timestamp UTC, nível, serviço, ambiente, evento e mensagem
legível. Adicionar correlação quando disponível: conexão, sessão, usuário, quarto,
tipo de mensagem e código de erro. Campo ausente deve ficar ausente; não inventar
identificadores nem usar texto livre como substituto de um código estável.

Não registrar secrets, senhas, tokens completos, conteúdo de chat ou payloads por
padrão. IDs operacionais também exigem acesso restrito e política de retenção.
Sanitizar texto externo e limitar seu tamanho. Erros repetitivos precisam de
limitação/amostragem para que um atacante não esgote disco com logs. Eventos
administrativos/econômicos usam auditoria própria; amostragem não pode apagar o
histórico exigido para rastrear uma transação.

## Métricas futuras

O Core já mantém contadores agregados em `ConnectionRegistry`: `activeConnections`,
`activeSessions`, `framesReceived`, `framesSent`, `invalidFrames` e
`rejectedConnections`. Não são expostos por endpoint HTTP e não têm labels por
conexão. O evento de shutdown registra os totais após cleanup.

| Área | Sinais necessários |
|---|---|
| Rede | Conexões, bytes/mensagens, falhas de handshake, rejeições, timeouts |
| Event loop | Atraso de agendamento, duração de tarefas, filas e saturação |
| Rooms | Filas, idade do evento, latência de processamento, unload e rejeições |
| JVM | Heap, memória nativa, GC/pausas, threads, CPU e alocações |
| Persistência | Latência, erros, deadlocks, retries e atraso de escrita |
| Pool de DB | Em uso/ociosas, espera de aquisição, timeout e limite configurado |
| Client | Frame time, recursos gráficos, falhas de carga e perda de contexto |

Métricas agregam labels de cardinalidade limitada: serviço, ambiente, operação,
resultado e código de erro conhecido. Não usar user ID, room ID, connection ID,
texto de SQL ou URL arbitrária como label. Correlação detalhada fica em logs ou
traces amostrados. Histogramas e unidades precisam ser estáveis antes dos alertas.

## Health checks

Liveness indica processo vivo; readiness indica capacidade de aceitar o trabalho
prometido. Dependência opcional não derruba liveness nem obriga restart contínuo.
Quando uma dependência obrigatória falha, readiness reflete isso sem expor
credenciais, stack trace ou detalhes internos em endpoint público.

Checks possuem timeout e cache curto para não causar carga proporcional às
sondagens. Não testar disponibilidade criando compra, usuário ou outro dado de
produção. Endpoints de administração/diagnóstico ficam restritos.

## Profiling e tracing

Usar recursos maduros de profiling da JVM, como JFR, em janela controlada e com
overhead observado. Capturas podem conter dados sensíveis; controlar tamanho,
destino, permissão e retenção. Não gravar perfis contínuos sem orçamento de disco.

Tracing distribuído só será introduzido quando houver fronteiras reais a observar.
Propagar correlação de forma limitada e validada; amostrar conforme custo. Uma
biblioteca/plataforma nova precisa de necessidade concreta, sem instalar uma
pilha extensa para observar um Hello World.

## Operação

Alertas futuros precisam de limiar baseado em medições, janela, responsável e
ação possível. Seguir [orçamento](../performance/PERFORMANCE-BUDGET.md) e
[infraestrutura de monitoramento](../../infrastructure/monitoring/README.md).
Não declarar capacidade, disponibilidade ou SLO cumpridos sem série real.
