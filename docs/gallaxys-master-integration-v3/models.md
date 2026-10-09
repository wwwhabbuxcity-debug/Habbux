# Modelos: inventário real e conversão independente V3

A consulta somente leitura ao banco operacional `gallaxys_polaris` encontrou
**64 modelos: 61 em room_models e 3 em room_models_custom**. Não foram lidas
contas, mensagens, ocupantes ou mobiliário. Não houve escrita no banco Gallaxys.
O inventário [estruturado](models-inventory.json) registra cada nome/ID, origem,
SHA-256 do heightmap normalizado, dimensões, tiles, elevações, porta, spawn,
conectividade e resultado de validação. Heightmaps reais estão exclusivamente
no backup operacional indicado em cada entrada, com arquivos modo 0600; não
foram incorporados no repositório/runtime desta entrega.

Encontrados: 64; autorizados: **0**; externos convertidos: **0**. Todos os
modelos externos ficam UNKNOWN/BLOCKED: a licença do código não comprova a
permissão individual dos dados. A validação estrutural aceita 61 e rejeita 3;
44 também são conectados pelas regras atuais (vizinhos cardinais, desnível ≤1).
Uma falha de spawn local é rejeição estrutural neste conversor, mesmo quando um
loader legado tolera buscar spawn distante. Inventário não equivale a autorização.

Os 63 modelos legados foram preservados byte por byte: SHA-256
`7d35274051005f0111684376724b87741a61cc4f65e5d688ed09428ffedfc5be`.
Os direitos desse pacote histórico continuam sem prova individual; sua
preservação solicitada não os reclassifica como ORIGINAL/AUTHORIZED. Nenhum novo
modelo Gallaxys foi adicionado. Há três modelos ORIGINAL independentes, criados
nesta entrega: `hbx_courtyard_v3`, `hbx_terrace_v3`, `hbx_alcove_v3`.
O registro carrega **66** modelos, mantendo índices/IDs virtuais dos 63 antigos.
As geometrias novas cobrem sala plana, terraço de um nível e contorno recortado.

## Contrato e ferramentas

`tools/room-models/converter.mjs` exporta `normalizeGeometry`, `convertModel`,
`convertBatch`, `toCompactTsv` e `toRoomState`. A CLI recebe JSON contendo
`models`, saída TSV nova e TSV existente opcional. Exemplo, usando saída nova:

```sh
nice -n 19 /opt/node22/bin/node tools/room-models/converter.mjs \
  tools/room-models/originals.json /tmp/habbux-original-models-new.tsv \
  apps/emulator/src/main/resources/room-models-v1/models.tsv
```

Proveniência exige status ORIGINAL/AUTHORIZED e campos author/license/source/
evidence não vazios. UNKNOWN, REFERENCE_ONLY e evidência incompleta são rejeitados.
Este manifesto é entrada de um operador responsável, não prova automática de
uma autorização falsa. IDs próprios `hbx_` são obrigatórios; duplicatas no lote
ou existentes são rejeitadas; saída usa `wx` e nunca sobrescreve arquivo.

Heightmaps aceitam lista de linhas ou string CRLF/LF. Normalização usa `x` como
vazio e base36 ASCII como altura 0..35 (a letra x fica reservada para vazio).
Limites 96×96, retangularidade, caracteres, porta interna e direção 0..7 são
verificados. Spawn: porta caminhável, célula à frente ou vizinha; não há busca
remota. Todas as células caminháveis devem conectar ao spawn com desnível ≤1.
O TSV usa caracteres TAB reais (byte 0x09), compatíveis com o loader Java e
o formato legado, sete campos:
ID, largura, altura, doorX, doorY, direção, linhas separadas por vírgula.

`RoomModelLoader` carrega os recursos uma vez no bootstrap; originais passam
novamente pelo limite Java de spawn local/conectividade. Não existe I/O de
conversão no movimento. O arquivo legado não é revalidado pela regra nova.
[Fixtures](models-original-fixtures.json) exportam RoomState serializável dos
três originais para o renderer e preservam IDs longos como string.

`inventory.mjs` é ferramenta offline opcional: faz somente SELECT via cliente
MariaDB local e salva heightmaps apenas num caminho explícito `/root/backups/`.
Todos os arquivos de saída são novos (`wx`); repetir exige outro destino/revisão.
Não depende de credenciais versionadas nem de libs adicionais.

## Verificação

Node 22 / nice 19: **10 testes PASS**, zero falhas. Cobrem autorização, IDs,
normalização, porta/spawn, retângulo/limites/caracteres, conectividade/desnível,
formato TSV e recusa de sobrescrita real pela CLI. Dois testes adicionais
conferem byte TAB 0x09 contra o recurso legado real e colisão de ID via CLI
com arquivo existente contendo tabs reais. `git diff --check`: PASS.
Teste Java adicional cobre ilhas, spawn remoto e escada válida. Execução Java
fica na validação sequencial do responsável pela integração; não foi executada
por este subtrabalho para evitar builds concorrentes no host compartilhado.
