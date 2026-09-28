# Convenções de testes

Os testes entregues validam somente código implementado. Casos de
gameplay abaixo são requisitos para futuros incrementos, não resultados já obtidos.

| Tipo | Escopo | Dependências |
|---|---|---|
| Unit | Configuração, regras puras e transformação de contratos | Sem rede, DB ou relógio real obrigatório |
| Integration | Listener WebSocket e repositório PostgreSQL | Porta efêmera; DB só `habbux_phase2_test` |
| Protocol | Registro central, codecs e interoperabilidade Java/TypeScript | Vetores fixos válidos/inválidos compartilhados |
| E2E | Percurso observável pelo navegador e servidor | Ambiente isolado e dados próprios |
| Load | Capacidade, degradação e recuperação | Smoke Core loopback limitado; carga prolongada exige máquina dedicada |

## Determinismo

Injetar relógio, fonte de IDs e aleatoriedade quando influírem no resultado.
Registrar seed dos testes gerativos. Usar sincronização, eventos ou relógio virtual
no lugar de sleeps arbitrários. Timeout limita uma espera por condição; não é
afirmação de que uma condição aconteceu.

Fixtures são pequenas, autorizadas e versionadas. Banco de teste usa namespace
próprio, cleanup garantido e migrations reais. Teste nunca aponta para banco,
Redis, quarto ou conta de outro projeto. Ordem de execução não pode ser dependência
oculta; recursos são liberados mesmo em falha.

O teste PostgreSQL exige host loopback, nome exato `habbux_phase2_test`, credencial
de migration e papel de runtime. Confirma `current_database()` antes de migration
e cleanup. Sem `HABBUX_TEST_POSTGRES_*`, o caso aparece como `SKIPPED`, nunca PASS.
O E2E Auth também verifica desconexão e desligamento durante uma operação em fila,
falha do banco, timeout e esgotamento do executor/pool sem bloquear PING. O cenário
Auth do load smoke aceita uma conta de teste `load_...` pré-criada ou registra uma
conta temporária aleatória quando `HABBUX_LOAD_AUTH_SEED=1`; o modo seed só aceita
loopback e o DB dedicado, confere o banco atual e remove essa conta ao terminar.
O Emulator recebe somente as credenciais runtime; a credencial de migration fica
no cliente local de carga. O cenário aceita no máximo oito conexões concorrentes.

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
