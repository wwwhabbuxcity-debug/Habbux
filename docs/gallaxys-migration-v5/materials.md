# Materiais/texturas — Migration V5

## Resultado real

**6 pisos e 52 papéis de parede** foram extraídos dos PNGs locais e convertidos
para PNG RGBA nativo, preservando integralmente os pixels. São **58 texturas**,
**58 variantes de piso** e **162 variantes de parede**, com IDs, cores, vínculo
material→textura, dimensões, offsets e hashes no catálogo. Os 58 PNGs nativos
ocupam **11.141 bytes**. Não são cores chapadas ou desenhos substitutos.

Fonte somente leitura:
`/var/www/gallaxys.com/Octane-Renderer/packages/assets/src/assets/room/`.
O diretório contém 154 PNGs; a seleção usa exclusivamente as 58 texturas de
piso/parede referidas em `room.asset.json`. Janelas/paisagens ficam fora desta
migração. Metadata SHA-256:
`974b57acccdddd2cc25545ac14791c897aca05613a75972321f316542add5d78`.

## Declaração específica da proprietária

Pergunta registrada:

> Para resolver as pendências específicas de origem: os mapas custom_9, custom_10 e custom_13 foram criados por você? E os PNGs de pisos/paredes do Gallaxys são arte própria sua ou vieram do pacote Habbo/Octane? A autorização de acesso e migração dos seus recursos já está registrada.

Resposta literal:

> ambos sao meu pode fazer total acesso

Esse conjunto passa a **OWNER_DECLARED_OWNED**, com autorização para a migração
Gallaxys→Habbux. A pergunta e a resposta acompanham o catálogo e NOTICE.
A classificação corresponde à declaração da dona, e não atribui autoria
independentemente comprovada nem licença de propriedade a conjuntos não citados.
A indicação GPL do pacote Octane não é usada como liberação genérica de arte.
O bloqueio inicial UNKNOWN de pisos/paredes foi resolvido por essa confirmação.

## Conversão reproduzível e formato nativo

Conversor: [convert-owned-room-materials-v5.py](../../tools/convert-owned-room-materials-v5.py).
Ele lê somente metadata e PNGs necessários, recusa PNG/metadata grandes,
valida referências, dimensões, células simples e cores, converte em memória e
confere igualdade de todos os pixels RGBA antes de escrever. Não altera origem,
baixa arquivos, usa Nitro em runtime ou sobrescreve destinos existentes.

```bash
nice -n 19 python3 -B tools/convert-owned-room-materials-v5.py \
  --output /tmp/habbux-room-materials-v5-reproduction \
  --typescript-output /tmp/habbux-room-materials-v5-reproduction.ts
```

Destino servido: `/client/assets/materials/v5/classic/`.
O [catálogo completo](../../apps/client/public/assets/materials/v5/classic/catalog.json)
inclui hashes do arquivo fonte, PNG nativo e pixels, dimensões, vínculo de materiais,
offsets, cores dos planos, autoria declarada e recibo. Catálogo SHA-256:
`477b10ac884de973a612081ea09e6154f84fa060af3841ef3178911cdb1857c5`.
O catálogo TypeScript compacto é gerado pelo mesmo conversor; os PNGs são
carregados apenas ao aplicar uma seleção, não no início de cada quadro.
O metadata original `room.asset.json`, COPYING GPLv3 e conversor de reprodução
acompanham o catálogo em `classic/gpl-metadata-source/`. A procedência/licença
do metadata numérico permanece separada da declaração de propriedade dos PNGs;
nenhum algoritmo Octane foi incorporado ao runtime Habbux.

## Aplicação real no renderer

Nos modelos migrados, o nível lógico usa 32 px, parede 3,6 níveis e espessuras
0,25 da referência. Texturas de parede compensam a escala vertical pelo fator
16/elevationHeight: um pixel do PNG continua com a proporção original, sem
dobrar o papel ao aumentar a projeção do nível. A origem vertical se alinha ao
teto compartilhado; piso, avatar e hover usam a mesma projeção. Modelos V1/V3
mantêm os parâmetros anteriores. Esta adaptação não replica o algoritmo de
máscaras/bordas do Octane; diferenças são registradas na comparação visual.
O contorno dos migrados identifica o vazio ligado à borda do mapa e a entrada;
buracos internos mantêm os pisos ausentes sem paredes altas inventadas. Fatores
de iluminação vêm da referência; variação procedural de cor não altera o bitmap.

`nativeTexturesForMaterialPlanes(floorId, wallId)` seleciona qualquer uma das
220 variantes reais, aplica a cor da fonte como tint e entrega os dois recursos.
`nativeTexturesForModel` mantém os IDs existentes: os três V3 usam planos
101/102/103 correspondentes aos presets V4; os migrados `hbx_gx_*_v5` usam piso
`floor_texture_64_0_floor_basic` e parede `wall_texture_64_0_wall_white` (planos
`default` e `218`). O coração próprio continua arquivado como recurso separado,
mas **não é mais aplicado automaticamente nem substitui piso/parede clássicos**.

`RoomRenderer.setSurfaceTextures` usa até duas fontes compartilhadas, nearest e
repetição. Textured fills de Graphics reaproveitam planos estáticos: fase XY/Z
contínua no piso e fase horizontal/vertical comum em cada plano de parede.
Escalas horizontal/vertical distintas preservam PNGs 32×16 e papéis 32×109;
a escala de pixels da parede é normalizada quando a projeção Z do quarto muda.
Tints também orientam caps/bordas; iluminação, espessura, contato e hover usam a
mesma geometria. Padrões vetoriais de juntas/grão são omitidos quando há bitmap.

Mesmo URL+SHA reaproveita Texture e ImageBitmap ao mudar só variante/cor ou a
outra superfície, sem novo fetch. Requisições idênticas em paralelo são
compartilhadas; falha conserva recursos anteriores; gerações antigas e decode
concluído após cancelamento não são aplicados. Dispose fecha bitmaps e fontes.
O cache mantém apenas fontes ativas e requisição corrente, sem crescimento livre.

Gate pré-fetch exige AUTHORIZED, proveniência/evidência, URL local válida,
hash, repetição/tint limitados e uma fonte por superfície. PNGs têm limite de
1 MiB, SHA-256 conferido e dimensões até 1024×1024 validadas antes do decode.
`diagnostics().nativeTextures` retorna cópias dos metadados; os contadores agora
consideram as fontes dos Graphics além de Sprite e reconhecem fill/stroke com
bitmap. A fonte branca compartilhada do Pixi conta como recurso GPU, enquanto
um fill de cor chapada não conta como instrução de imagem.

## Verificação e limites

**7/7 testes direcionados PASS**, Node22/nice19: gate/PNG/projeção, todos os 58
hashes/dimensões, vínculos e cores das 220 variantes, seleção V3/migrados,
proporções de piso retangular/papel alto, isolamento dos metadados e fontes
Graphics+Sprite compartilhadas sem duplicação. Verificação independente Pillow:
**58/58 arquivos nativos iguais pixel a pixel às fontes**; hashes fonte/destino
conferem. Nenhuma alteração, build ou restart Gallaxys.

Build/typecheck, testes browser reais de cada textura, comparação visual,
desempenho desktop/mobile e publicação são registrados no relatório consolidado.
Igualdade de pixels e testes unitários não declaram fidelidade integral de render.
