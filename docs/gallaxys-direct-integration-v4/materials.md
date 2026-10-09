# Conversão seletiva de materiais — Direct Integration V4

Origem somente leitura: `/var/www/gallaxys.com/gamedata/bundled/generic/room.nitro`.
SHA-256: `b029cafab61309969075d75f53cd6582d23f90c823878ee5100cd6f953f2180b`.
Bundle contém room.json (175004 bytes) e room.png (398965 bytes descomprimidos).
Auditoria V3 preservada; busca local por licença/proveniência em gamedata não
localizou prova de autoria/licença individual do bitmap. Autorização do dono para
seus recursos próprios não transforma esse atlas potencialmente terceiro em
recurso próprio. **room.png UNKNOWN, bloqueado para importação**. Nenhum pixel,
algoritmo ou arquivo fonte GPL foi incorporado. Fonte local não foi modificada.

## Resultado real

| Recurso | Quantidade integrada |
|---|---:|
| Presets numéricos de piso integrados | 3 |
| Presets numéricos de parede integrados | 3 |
| PNGs importados | 0 |
| Texturas bitmap convertidas | 0 |
| Novos padrões procedurais | 0 (reutiliza padrões originais Habbux) |
| Atlas de materiais bloqueados | 1 (`room.png`, UNKNOWN) |

Extração seleciona visualização size=64, camada única, cor RGB inteira válida.
Todos os 58 planos de piso e 162 de parede satisfazem o filtro. IDs de planos e
material são metadados de origem para rastreio; apenas cor RGB é aplicada à cena.
Não se reproduz disposição/desenho do atlas, máscaras, ornamentos ou shader
terceiro. Isso é conversão de parâmetros factuais, não importação de arte nem
relicenciamento de room.nitro. Repetição, espessura, altura, luz e desenho continuam
originais Habbux; não foram inventados valores supostamente extraídos.

`tools/extract-room-material-facts.py <caminho/room.nitro>` reproduz o extrator
original e emite fatos/sha256, sem salvar PNG. Limites de arquivo/metadados evitam
entrada ilimitada. Runtime recebe somente seis presets usados nos três modelos próprios; os 220 fatos disponíveis permanecem no inventário offline do extrator. Não lê Nitro.

## Integração

`apps/client/src/renderer/gallaxys-material-presets.ts` exporta
`GALLAXYS_NUMERIC_MATERIAL_PRESETS` com ID novo, superfície, sourcePlane,
sourceMaterial e color. `configureConvertedMaterials(floorId, wallId)` produz
configuração validada pronta para `RoomRenderer.setMaterials()`; RoomRenderer seleciona os pares automaticamente ao trocar modelId.
World-lab também expõe `convertedMaterials(floorId, wallId)` para comparação. Exemplo de piso:
`habbux-gx-numeric-v4-floor-101` = 10053120 RGB. Cada cor secundária é calculada
pelo procedimento original Habbux (fator 0,6), e padrões mantêm proveniência
`Habbux original procedural geometry`, AUTHORIZED. Nenhum novo cache, Sprite ou
textura por tile. Troca de preset reconstrói superfícies uma vez; movimento não.
Default renderer, HUD, CMS e administração permanecem preservados.

## Verificação

Node 22 portátil + nice19: **10 PASS** (4 conversão + 6 materiais). Testes percorrem
os seis presets validando cor, direitos/procedência original, IDs únicos, rejeição
de IDs desconhecidos/superfícies trocadas e imutabilidade do default. Não houve
falha nesta rodada. Typecheck/build/capturas pertencem
à integração central. Comparação autenticada Gallaxys, GPU real: NOT RUN.
Nenhum build, commit, publicação, restart ou alteração Gallaxys neste subtrabalho.

## Mapeamento realmente aplicado

| Modelo próprio | Plano piso → ID novo / RGB | Plano parede → ID novo / RGB |
|---|---|---|
| hbx_courtyard_v3 | 101 → habbux-gx-numeric-v4-floor-101 / 10053120 | 101 → habbux-gx-numeric-v4-wall-101 / 16763904 |
| hbx_terrace_v3 | 102 → habbux-gx-numeric-v4-floor-102 / 10527664 | 102 → habbux-gx-numeric-v4-wall-102 / 13412864 |
| hbx_alcove_v3 | 103 → habbux-gx-numeric-v4-floor-103 / 8561614 | 103 → habbux-gx-numeric-v4-wall-103 / 16514816 |

Todos esses planos referenciam material numérico floor_64_1/wall_64_1 na fonte.
Escolha dos pares é composição própria Habbux, não afirmação de aparência igual
no Gallaxys. `resolveConvertedMaterialsForModel` retorna undefined para todos os
outros modelos (inclusive nomes de propriedades Object); renderer então restaura
estilo inicial exatamente. A seleção automática recebe a configuração inicial
do renderer: só substitui IDs/cores, preservando walls, alturas, espessuras e
padrões originais do chamador. modelId integra assinatura de superfícies para que
mesmo footprint com par diferente reconstrua uma única vez. Alterações de posição
no mesmo modelo não reaplicam o material. Nenhum modelo preexistente foi alterado.
