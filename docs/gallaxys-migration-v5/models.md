# Modelos — migração efetiva V5

**64 encontrados; 61 correspondências exatas com fonte SQL; 61 convertidos e
integrados (58 GPL + 3 próprios declarados); 3 rejeitados por geometria.**
Registro Java: **127 modelos** (63 legados + 3 originais V3 + 61 V5). IDs e
recursos existentes não foram sobrescritos; IDs virtuais anteriores preservados.

## Correlação objetiva e licença

`Polaris-Emulator-main/README.md`, linhas 3–7, descreve Polaris como fork Arcturus
Community e inclui explicitamente o banco pronto para importação no pacote.
`LICENSE` na raiz contém GPLv3; `Emulator/pom.xml`, linhas 11–17, declara GPLv3.
O bloco `room_models` em `Database/Default Database/CleanDB.sql`, linha 54389,
contém as 61 definições operacionais: **cada hash de heightmap (CRLF/LF
normalizado) e cada porta X/Y/direção corresponde exatamente**. A licença do
conjunto foi interpretada como GPL-3.0 do banco explicitamente distribuído,
sem aviso separado de exclusão/licença encontrado nesse bloco. Isso é inferência
documentada do escopo da distribuição, não prova individual de autoria de cada
modelo nem permissão para PNGs/Habbo em geral. A autorização da dona do projeto
não foi confundida com licença de terceiros.

Os 58 aprovados pela correspondência ao SQL conservam GPL-3.0 e fonte correspondente limitada às definições
necessárias em `tools/room-models/gpl-source/cleandb-models.json`; licença
integral em `COPYING`, atribuição/alterações e obrigações em `NOTICE.md`.
Não foram copiados código Polaris, banco completo, usuários ou public_items.
Não se atribuiu MIT. Distribuição deve preservar avisos/licença e oferecer
fonte correspondente das conversões, incluindo scripts. Obrigações aplicáveis
à distribuição derivada permanecem; não se anunciou relicenciamento automático
do Habbux inteiro. Recursos de dados continuam arquivo separado carregado no
bootstrap, sem mudança de protocolo ou I/O no movimento.

## Resultado por modelo

[Mapeamento completo](model-mapping.json) registra os 64 IDs de origem, hash,
porta, ID Habbux novo para aprovados, dimensões, tiles, spawn e motivo de rejeição.
[Fixtures](model-fixtures.json) contêm os 61 modelos para validação no renderer.

Política V5 explícita `PRESERVE_GEOMETRY_V5` conserva componentes desconectados
(e.g. áreas separadas por altura) e permite padding somente à direita com `x`
para células ausentes em linhas curtas. O gate V3 padrão continua exigindo mapa
retangular/conectado. **16 mapas antes rejeitados por desconexão foram recuperados**
sem alterar um tile existente. Alcance do componente do spawn fica registrado,
sem afirmar que todos os tiles são alcançáveis. Pathfinding continua impondo os
limites de altura/canto; não há passagem inventada entre componentes.

Rejeições finais: `custom_model` e `snowstorm_arena_1` sem spawn adjacente;
`the_den` tem linhas 16/20 **e símbolos U+0001/U+0002**. Padding resolve somente
linhas curtas; inventar significado para controles alteraria geometria, portanto
a conversão ainda o rejeita. Não foram alterados porta, símbolos, desenho ou
alturas para forçar 59 modelos.
## Três modelos próprios declarados

A proprietária confirmou `custom_9`, `custom_10` e `custom_13` como próprios:
“ambos sao meu pode fazer total acesso”, em resposta à pendência desses modelos
e das imagens de piso/parede. A confirmação foi aplicada sem nova autorização.
`tools/room-models/owned-source/custom-models.json` registra IDs 9/10/13,
heightmaps, portas, hashes e evidência `OWNER_DECLARED_OWNED` por modelo.
Os três ficam em `gallaxys-owned.tsv`, separados das 58 definições GPL;
a titularidade declarada não recebeu GPL ou MIT por inferência. A condição de
uso é identificada por `LicenseRef-Habbux-Owner-Declared`: autorização de migração
recebida, sem licença pública de redistribuição declarada.

`custom_10` conserva sua porta e spawn originais e apenas 1 dos 133 tiles
alcançável. O componente restante permanece isolado e pathfinding rejeita os
destinos inacessíveis. `custom_9` e `custom_13` conservam geometria e spawn.

## Implementação e verificações

`tools/room-models/migrate-v5.mjs` lê somente blocos de modelos do SQL local e
referência operacional V3, compara heightmap/porta, aplica gate reutilizável V3,
gera TSVs novos, source JSON limitado, mapeamento e fixtures. Aceita caminho SQL,
diretório da referência operacional e raiz de saída opcionais; nenhuma
consulta/escrita no banco é necessária. Saídas novas usam `wx`; a raiz de saída
permite regeneração em staging sem sobrescrever os artefatos existentes.

`RoomModelLoader` carrega `/room-models-v5/gallaxys-gpl.tsv` e
`/room-models-v5/gallaxys-owned.tsv` em separado e valida spawn local no bootstrap.
Identificadores `hbx_gx_*_v5` não colidem com nenhum anterior; os três próprios
foram acrescentados depois dos 58 GPL para preservar IDs virtuais 1..124.
`RoomModelTest` passa a exigir total 127 e presença dos três custom próprios.

Node 22/nice 19, testes direcionados após os próprios: **14 PASS**, zero falhas. Cobertura nova
confere os 64 resultados, exclusões, 61 IDs sem colisão, fonte correspondente,
SHA da fonte, portas/spawn, policy sem relaxar defaultV3, alcance do componente do spawn e igualdade byte a byte
do TSV convertido. Primeiro ensaio teve 1 falha ao comparar hash da fonte com
hash após canonicalização de maiúsculas; teste corrigido para verificar hash da
fonte preservada e geometria normalizada separadamente. `git diff --check` e
syntax check: PASS. Java/Maven e validação completa passaram na integração sequencial principal.
Render real e medições são registrados no relatório consolidado.
Nenhum deploy, commit, serviço iniciado/reiniciado ou alteração no Gallaxys.

Artefatos com 58 conversões foram preservados antes de incorporar os modelos
próprios em `/root/backups/habbux-v5-owned-models-20261009T052906Z/`.
O catálogo cliente passou a oferecer os três novos IDs virtuais 125–127, além
das entradas anteriores. Teste Java específico usa o `custom_10` do registro
real para conferir spawn (21,3), interior (4,1) inacessível e coordenada fora do
mapa rejeitada; execução final Java cabe à integração sequencial principal.
Integração final Java25: 123 testes, 119 PASS e4 SKIPPED de PostgreSQL opcional;
zero falhas/erros. Renderer validou os61 modelos em desktop e mobile.


A primeira versão (42 modelos) foi inspecionada e preservada antes de regenerar
em `/root/backups/habbux-gallaxys-migration-v5-20261009T043548Z/models-initial/`.
Teste Java adicional `RoomMigratedModelPathTest` usa o RoomManager/pathfinder
real: destino dentro do componente aceito, altura isolada UNREACHABLE e coordenada
fora dos limites INVALID_DESTINATION. Execução Java: PASS no build principal.
