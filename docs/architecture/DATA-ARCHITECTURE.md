# Arquitetura de dados

## Responsabilidade de cada armazenamento

| Meio | Autoridade | Usos previstos |
|---|---|---|
| PostgreSQL | Fonte oficial persistente | Identidades, propriedade, economia e configurações duráveis |
| RAM do Emulator | Estado ativo validado | Posições, sessões em execução, projeções e estado do quarto |
| Redis opcional | Efêmero; recuperável | Cache com invalidação, presença, sessão temporária, rate limits e coordenação justificada |

RAM não substitui durabilidade econômica. Redis não define saldo, posse ou
histórico oficial. Seu desaparecimento não pode destruir dados permanentes.
A persistência inicial contém somente usuários e credenciais para Auth. Migrations
são explícitas e não rodam no boot do Emulator.

## Acesso e hot paths

Carregar estado antes de admitir ações do jogador. Movimentação por tile, chat,
renderização e execução repetida de Wired não fazem round-trip ao banco. Escritas
assíncronas usam fila limitada, tratamento de falha e garantia de durabilidade
definida por tipo de dado. Métricas de atraso e rejeição tornam saturação visível.

O `UserRepository` concentra SQL parametrizado e conversão de registros. Login e
cadastro são as únicas operações de escrita do Auth nesta fase; não há sessão
persistida. HikariCP
usa por padrão mínimo 1/máximo 2 conexões, aquisição de até 1,5 s e queries com
timeout de 5 s. A fundação expõe conexões ativas, ociosas e pendentes. Esses
limites são baseline conservador, não capacidade medida. Aumentar workers não
justifica aumentar automaticamente conexões. Transações devem durar o mínimo
necessário e não conter chamadas de rede externas.

## Transações, índices e concorrência

- Usar constraints de unicidade e integridade para invariantes persistentes.
- Índices derivam de consultas reais, seletividade e custo de escrita; validar
  planos com dados representativos antes de afirmar melhoria.
- Batch tem limites de itens/bytes e política explícita de rollback e retry.
- Lock otimista usa versão e trata conflito; não salva por cima do concorrente.
- Lock pessimista é reservado a disputa que exige serialização, com ordem
  consistente de aquisição e limite de espera. Não manter lock durante I/O remoto.
- Isolation level é escolhido pela invariante. Ser transacional não elimina
  automaticamente anomalias: testar interleavings e tratar abortos/deadlocks.

## Requisitos do futuro Economy Engine

Compra, débito e concessão de inventário pertencem à mesma transação ou a um
fluxo durável formalmente definido. No primeiro desenho, preferir uma transação
PostgreSQL para evitar coordenação distribuída desnecessária.

Um comando econômico possui chave de idempotência ligada à identidade e à
operação. A transação registra a chave com constraint única, valida fundos,
aplica débito e propriedade, grava auditoria e persiste o resultado. Repetição
devolve o resultado anterior; a mesma chave com conteúdo diferente é rejeitada.
O prazo de retenção dessas chaves precisa considerar retries e reconexão.

Não separar “ler saldo”, “verificar saldo” e “gravar saldo” sem proteção
transacional. O banco deve impedir saldo negativo causado por corrida e dupla
concessão de um mesmo item. O Client não escolhe preço final, saldo ou proprietário.
Auditoria identifica ator, operação, correlação e alterações antes/depois, com
acesso restrito e retenção definidos.

Sucesso só é enviado após commit. Se a conexão cair após commit, o retry consulta
o resultado idempotente. Eventos derivados de uma compra podem exigir outbox
transacional futura para cobrir a janela entre commit e publicação; introduzir
esse mecanismo quando houver consumidor real. Retry é limitado, aplica atraso
controlado e repete a unidade transacional inteira apenas quando for seguro.

## Migrations

Mudanças de schema são versionadas em [`database`](../../database/README.md).
Não alterar migration já aplicada. Testar em banco descartável novo e sobre a
versão anterior; incluir efeitos de locks, volume e compatibilidade durante deploy.
Dados e schema de outros projetos não são fontes desta base.

O schema v1 mantém `users` e `user_credentials`; `BIGINT GENERATED ALWAYS AS
IDENTITY` fornece identidade compacta. O login procura username ou email
normalizados em colunas únicas indexadas. A fundação prepara DML mínimo para o
runtime; migrations usam credencial separada.

Mudanças destrutivas exigem backup verificado e plano de restauração. Preferir
adicionar, migrar dados e só depois remover campos. Rollback de código nem sempre
desfaz migration: documentar limites e nunca prometer rollback de dados perdido.

## Uso de Redis

Introduzir somente quando houver coordenação ou cache medidamente útil. Cada
chave precisa de proprietário, TTL, limite de cardinalidade/tamanho, política de
invalidação e comportamento na indisponibilidade. Cache pode usar versões ou
invalidação explícita; TTL sozinho só atende dados com staleness aceito.

Não usar Redis para cache sem limite, locks distribuídos improvisados, cópia
indefinida de todos os dados ou dependência obrigatória em todo comando. Sessões
e permissões exigem comportamento de falha explícito: falhar fechado quando a
indisponibilidade impedir verificar autorização.
