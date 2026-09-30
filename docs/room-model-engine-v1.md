# Room Model Engine v1

O Habbux carrega os modelos estruturais aprovados em um recurso compacto
(`apps/emulator/src/main/resources/room-models-v1/models.tsv`) durante o
bootstrap. O caminho de movimento não lê JSON nem faz I/O.

- `x`/`X` são void e não caminháveis; base-36 representa elevação `0..35`.
- Existem 63 modelos válidos no pacote de pesquisa; `the_den` permanece fora do
  registro por ter linhas não retangulares e caracteres não suportados.
- A porta é preservada mesmo quando o tile da porta é void. O spawn usa a porta
  quando caminhável, o tile à frente quando necessário e só então uma célula
  caminhável adjacente.
- A movimentação v1 continua cardinal. Uma transição exige diferença de altura
  de no máximo um nível; não há rampas, escadas ou Furniture nesta fase.
- Salas virtuais DEV usam IDs `9000000000000000001` em diante, na ordem do
  recurso. Salas persistidas continuam tendo precedência e usam o snapshot Core
  v1 legado. Modelos usam `ROOM_MODEL_SNAPSHOT` (ID 26) com elevação, spawn e
  porta.

O seletor visual fica disponível somente com `?dev=1` e oferece seis modelos
representativos: pequeno, médio, grande, irregular, multi-altura e complexo.
Isso é uma ferramenta de desenvolvimento, não um Navigator ou sistema de
permissões de produto.
