# Concorrência do futuro Room Engine

Status: requisitos e modelo; Room Engine não implementado.

## Autoridade e ordenação

Cada quarto possui um único proprietário lógico do estado. Comandos entram em
uma fila limitada e são processados sequencialmente para aquele quarto:

```text
Comando validado → Event Queue limitada → Room Worker → State Mutation → Outgoing Events
```

Não existe uma thread física por quarto nem lock global do hotel. Um conjunto
limitado de workers atende vários quartos, com no máximo uma execução simultânea
por quarto. Quartos diferentes podem executar em paralelo. A quantidade de
workers e o orçamento por execução serão definidos por medição.

A ordem é a de aceitação pelo proprietário do quarto; eventos concorrentes de
conexões diferentes não possuem uma ordem global presumida. Registrar sequência
local permite diagnosticar a ordem efetivamente aplicada. O agendador preserva a
ordem de cada fila e cede execução após orçamento limitado para evitar que um
quarto monopolize o executor.

## Estado e trabalho externo

Somente o proprietário altera o estado. Leituras externas usam projeções/snapshots
imutáveis com versão, nunca referências mutáveis a jogadores ou objetos. Consultas
SQL e outros I/O não bloqueiam o worker. Uma conclusão assíncrona retorna como
novo evento com correlação e versão; resultados obsoletos são descartados ou
revalidados conforme a operação.

Transferir jogador entre quartos exige um protocolo explícito de saída/entrada,
timeouts e compensação. Não adquirir locks de dois quartos. Regras econômicas
continuam pertencendo à transação persistente, mesmo quando acionadas no quarto.

## Saturação e justiça

- Limitar eventos e bytes por fila, custo admitido por origem e duração por turno.
- Rejeitar comandos novos com resultado definido quando não houver capacidade.
- Não descartar silenciosamente ações econômicas ou eventos de mudança de posse.
- Eventos substituíveis só podem ser agregados com equivalência documentada.
- Medir tamanho e idade da fila, tempo de processamento, rejeições e tempo até
  uma alteração tornar-se observável.

Timers usam o mesmo caminho ordenado dos demais eventos. Não criam loops, threads
ou temporizadores ilimitados por objeto; limites e cancelamento serão definidos
antes da implementação de comportamentos recorrentes.

## Carregamento, unload e encerramento

Carregar quarto prepara seu estado antes de admitir comandos. Unload transita
para drenagem, recusa novas entradas, cancela timers, resolve trabalho pendente,
persiste o que precisa ser durável e remove referências. Quarto com jogadores ou
transação pendente não é descartado como se estivesse ocioso.

Shutdown retira prontidão e usa prazo de drenagem. Se a persistência falhar, o
processo reporta a falha e a política de recuperação é aplicada; não marca dados
como salvos. Limites de perda aceitável dependem do tipo de estado, nunca de um
timeout implícito de infraestrutura.

## Testabilidade

Relógio virtual, IDs e gerador aleatório controlados permitem reproduzir uma
sequência de comandos sem Netty, banco ou hotel inteiro. Testar exclusividade de
mutação, ordem local, justiça entre quartos, fila cheia, conclusão atrasada,
transferência, unload e shutdown. Testes de concorrência reais complementam o
executor determinístico; repetir um teste com sleeps não prova correção.
