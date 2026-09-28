# Convenções de testes

Os testes entregues validam somente código implementado. Casos de
gameplay abaixo são requisitos para futuros incrementos, não resultados já obtidos.

| Tipo | Escopo | Dependências |
|---|---|---|
| Unit | Configuração, regras puras e transformação de contratos | Sem rede, DB ou relógio real obrigatório |
| Integration | Listener WebSocket real, handshake, sessão e ping/pong | Porta efêmera em loopback; sem serviço externo |
| Protocol | Registro central, codecs e interoperabilidade Java/TypeScript | Vetores fixos válidos/inválidos compartilhados |
| E2E | Percurso observável pelo navegador e servidor | Ambiente isolado e dados próprios |
| Load | Capacidade, degradação e recuperação | Máquina dedicada e gerador medido |

## Determinismo

Injetar relógio, fonte de IDs e aleatoriedade quando influírem no resultado.
Registrar seed dos testes gerativos. Usar sincronização, eventos ou relógio virtual
no lugar de sleeps arbitrários. Timeout limita uma espera por condição; não é
afirmação de que uma condição aconteceu.

Fixtures são pequenas, autorizadas e versionadas. Banco de teste usa namespace
próprio, cleanup garantido e migrations reais. Teste nunca aponta para banco,
Redis, quarto ou conta de outro projeto. Ordem de execução não pode ser dependência
oculta; recursos são liberados mesmo em falha.

## Concorrência e Room Engine futuro

Executar o modelo de quarto com executor manual e relógio virtual para reproduzir
ordem, timers, saturação, unload e conclusão atrasada. A mesma sequência inicial
e seed deve produzir eventos e estado equivalentes. Não inicializar o hotel inteiro
para testar uma decisão do domínio.

Complementar com testes reais de contenção e invariantes: um proprietário por
quarto, nenhum gasto duplicado, nenhuma posse duplicada e ausência de saldo negativo
por corrida. Um resultado determinístico não substitui teste do agendador real.

## Contratos e qualidade

Codecs compartilham vetores canônicos entre Java e TypeScript: round-trip sozinho
é insuficiente porque dois lados podem repetir o mesmo erro. Incluir
limites, truncamento, flags, IDs inválidos, estados incorretos de handshake e
consumidor lento. Fuzzing deve ter orçamento e seed reproduzível.

Build, typecheck e validação do protocolo são gates diferentes. Sucesso no build
não demonstra correção de DB, compatibilidade de navegadores ou capacidade de
jogadores. Testes ausentes/indisponíveis são registrados como NOT RUN/NOT TESTED.

CI deve conter só verificações que funcionem com o repositório atual. Cobertura
mede código exercitado, não substitui seleção dos riscos. Ver
[benchmarks](../../benchmarks/README.md) para carga e critérios de relatório.
