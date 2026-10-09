# HABBUX — GALLAXYS DIRECT INTEGRATION V4

- WALK: quatro frames/82 ms, oito direções; cadência e fases preservadas.
- MOVIMENTO: pré-anúncio V3, reservas e autoridade preservados; sem alteração de protocolo ou servidor.
- AVATAR: preparação nativa compartilhada de frames e posições; 13 partes, 7 atlas, 364 regiões existentes. Nenhum novo sprite externo importado.
- MODELOS ENCONTRADOS: 64 Gallaxys, inventário V3 reaproveitado.
- MODELOS IMPORTADOS: 0 novos; falta identificar titularidade/licença dos conjuntos. Mantidos 66 modelos Habbux, incluindo 3 originais.
- PISOS IMPORTADOS: 3 presets de cor convertidos e aplicados aos modelos próprios; nenhum bitmap.
- PAREDES IMPORTADAS: 3 presets de cor convertidos e aplicados aos mesmos modelos; nenhum bitmap.
- TEXTURAS CONVERTIDAS: 0 externas; padrões procedurais originais Habbux reutilizados.
- RECURSOS BLOQUEADOS: mapas e pixels sem comprovação individual; detalhes abaixo.
- PERFORMANCE: ABBA/SwiftShader, dez avatares: desktop 27,86→30,00 FPS; mobile 47,74→54,39 FPS. Sem regressão nas duas cenas medidas.
- TESTES: typecheck/build/protocolo/modelos/Maven PASS; números e limitações abaixo.
- VISUAL: 42 novas capturas, oito direções e três modelos em desktop/mobile; seis comparações do padrão com pixels idênticos. Referências Gallaxys já existentes, sem equivalência autenticada.
- COMMIT: implementação e revisão final registrados após validação/publicação.
- DEPLOY: publicação estática em tyvo.online preparada; conclusão registrada após smoke público.
- PENDÊNCIAS: direitos dos recursos externos; sessão autenticada comparável e GPU física.

## Conversão e integração efetivas

Base `18b62565319a9d5b46edc91419b57685fb90e827`, posterior à implementação
V3 `566f386`. Gallaxys somente leitura. Nenhuma mudança em CMS, SSO, HUD, chat,
catálogo, administração, schema ou protocolo. Reaproveitadas auditorias e os
conversores existentes; sem downloads de referências, dependências ou Chromium.

Foram extraídos parâmetros numéricos de `room.nitro`: seis cores/IDs efetivamente
usados, sem copiar desenho, atlas, máscaras, algoritmos ou fontes de renderer.
Os 220 fatos disponíveis ficam no inventário operacional offline, não no runtime.
Três pisos e três paredes são selecionados automaticamente pelo `modelId` dos
modelos originais `hbx_courtyard_v3`, `hbx_terrace_v3`, `hbx_alcove_v3`.
Os padrões de madeira/reboco, iluminação, repetição, espessuras, alturas e
geometria permanecem originais Habbux. Nenhum recurso externo foi tratado como
arte autorizada por estar no servidor. Fonte/hash/mapeamento/extrator e cores
estão em [materials.md](materials.md).

O provider de avatar agora converte o manifesto existente em tabelas nativas
imutáveis e prepara as posições dos sprites uma vez por gênero, compartilhadas
por todos os avatares do quarto. O lookup e a atualização das partes reutilizam
objetos, eliminando alocações de seleção/resolução/posição em cada troca de
frame. Preload concorrente compartilha promessas e sete fontes; regiões são
deduplicadas. Dispose durante download não recria regiões, falhas temporárias
permitem retry e as texturas de região são destruídas sem destruir fontes
compartilhadas. Limite de 64 frames por ação; asset loader somente nos pontos
existentes, sem leitura de Nitro no navegador. Frame counts e fallbacks são
preservados, inclusive quantidade diferente de quatro.

Não foram convertidos novos pixels de FigureData/FigureMap/ações/sheets Gallaxys:
não há comprovação específica dos recursos gráficos. As seis PNGs legadas e o
SVG original de mãos preservam bytes e SHA-256. Nenhuma expressão facial nova
foi inventada; permanecem composição/oclusões existentes. O pé usa a mesma
referência STAND central, refletida com a composição inteira. O clock WALK,
movimento contínuo por segmentos, mudanças de direção e interpolação não foram
alterados. A redução de pausa de 300 ms é da V3, não uma nova promessa desta V4.

## Proveniência e direitos

| Conjunto | Evidência/situação | Ação nesta V4 |
|---|---|---|
| Seis cores RGB/IDs selecionados | Parâmetros numéricos da fonte/hash identificados | Conversão para configuração própria; sem atlas/arte/código |
| Padrões procedurais Habbux | Autoria original, procedência explícita | Reutilizados nos seis presets |
| SVG de mãos Habbux | Original, licença MIT local | Preservado e usado |
| 64 modelos Gallaxys | Nenhuma titularidade/licença individual demonstrada | 0 novos; gate V3 preservado |
| `room.png` | UNKNOWN, sem prova individual | Não importado |
| FigureData/FigureMap/ações/novos sprites Gallaxys | Proveniência gráfica independente não comprovada | Nenhum conjunto gráfico novo importado |
| Seis PNGs/63 modelos legados Habbux | LEGACY_UNVERIFIED | Bytes preservados; não relicenciados |
| Código Polaris/Octane/Renderer | GPL-3.0 local, obrigações independentes de gráficos | Nenhum código copiado/importado; nenhuma alegação de MIT sobre esse código |

A autorização da proprietária para recursos próprios foi respeitada. O dado
faltante é quais recursos são próprios, ou qual licença cobre cada conjunto
de terceiros. Foi enviada uma pergunta opcional para identificar conjuntos;
nenhuma resposta foi presumida. Não houve nova solicitação de permissão para
etapas já autorizadas. [models.md](models.md) registra os três `custom`, pontos
de cópia de templates e as provas que faltam por ID. Não se criou mapeamento
de destino fictício para recursos não importados.

## Verificações e falhas reais

- Suíte completa client: 166 PASS; ajustes finais: quatro testes de avatar e
  cinco de conversão/material PASS, incluindo frame count variável e preservação
  das configurações do chamador (168 casos distintos).
- Modelos: 10 PASS. Registry/protocolo: 22 PASS e validação PASS.
- Typecheck geral PASS; typecheck client final PASS. Build completo e client
  final PASS, código 0, Node 22, nice19, heap512 MB, um worker de build.
- Maven/Java25 `clean verify`: 121 testes, 117 PASS, 4 SKIPPED de integração
  PostgreSQL opcional sem configuração. Sem usar bancos Gallaxys ou reiniciar
  emulador para tests.
- Visual real Pixi: 4 matrizes de 40 amostras, 16 ensaios de direção com quatro
  frames WALK e STAND, 6 ensaios de modelo/material, 14 cenas de movimento,
  hover e touch nos três modelos. Foot error físico <1e-8; sem rebuild estático
  durante os ensaios de movimento; nenhum erro JavaScript nas capturas.
- Seis pares de cenas padrão antes/depois, desktop/mobile: SHA-256 dos pixels
  RGBA idêntico. Comparação preserva padrão, não afirma paridade Gallaxys.
- A seleção de cores preserva paredes ocultas, alturas, espessuras e padrões
  originais configurados pelo chamador; não impõe geometria nova por um preset.
  Controle hide/show: seis checks PASS nos três modelos em desktop/mobile.
- Primeiro typecheck falhou com `modelId: string | null`: corrigida resolução
  de presets para aceitar null. Primeiro ensaio visual amostrou precisamente
  o limite do buffer de100 ms, antes de WALK começar: corrigida fixture para
  101 ms; nenhuma alteração de clock/servidor para contornar o ensaio.
- O primeiro check de hide/show esperava zero superfícies ao ocultar paredes,
  ignorando faces de pisos elevados: timeout da fixture. Corrigida a expectativa
  para preservar esses pisos; seis checks finais PASS, sem erro JavaScript.
- Duas tentativas ABBA abortaram com `ERR_CONNECTION_REFUSED` nos servidores
  temporários 3124/3125. Não há resultado completo dessas tentativas. Execução
  final manteve servidores e benchmark no mesmo processo supervisionado, com
  logs em arquivo, e encerrou os servidores ao concluir. Sites seguiram ativos.
- Comparação autenticada de quarto/trajetória Gallaxys: NOT RUN. Multiplayer
  autenticado público: NOT RUN; reservas/preanúncio/remotos cobertos por testes
  Java/Netty e fixtures, não por sessão real com usuários.

## Performance reproduzível

Chromium/WebGL/SwiftShader, viewport1280/DPR1 e390/DPR2; ordem ABBA
baseline→candidate→candidate→baseline, 30 frames de aquecimento e90 frames
medidos por cena. Baseline é a release pública anterior desta entrega, não os
números históricos V3 tomados em outro momento do host.

| Cena | FPS antes→depois | CPU de submissão ms antes→depois |
|---|---:|---:|
| Desktop vazio | 36,73→37,12 | 0,187→0,188 |
| Desktop dez avatares | 27,86→30,00 | 0,826→0,786 |
| Mobile vazio | 54,44→58,38 | 0,165→0,164 |
| Mobile dez avatares | 47,74→54,39 | 0,713→0,705 |

Dez avatares: 195 objetos, 130 sprites, sete fontes de textura e dois draw calls
por frame antes/depois. Vazio: cinco objetos e um draw call. Contador de builds
estáticos não mudou durante movimento. Heap/GC variam entre amostras; nenhum
ganho geral de memória é declarado. Resultados em software no servidor
compartilhado não representam FPS garantido em celular físico/GPU real.
Não foram repetidos benchmarks amplos após os casos medidos passarem.
Dados integrais: `visual/performance/performance-v3.json` no backup V4.
O nome do arquivo é legado do runner reaproveitado; as amostras são desta V4.

## Artefatos e operação

Backup operacional:
`/root/backups/habbux-gallaxys-direct-integration-v4-20261009T034607Z/`.
Contém bundle Git baseline, release anterior, JAR anterior, SHA dos assets,
serviços/PIDs, checks, inventário numérico, capturas e `rollback.sh` modo0700.
Rollback estático validado com `sh -n`: troca symlink atomicamente após aviso,
sem reiniciar serviços. Não executado porque não houve falha de publicação.

Galeria com comparação lado a lado do imager Gallaxys e Habbux:
`visual/after/index.html` dentro do backup. Os 16 arquivos de referência foram
reutilizados dos backups V2; não são assets publicados. Figuras/paletas e
contextos diferem; ausência de sessão Gallaxys autenticada impede declarar
equivalência visual. Capturas novas ficam fora do Git e do dist.

Deploy previsto somente estático pelo script oficial, preservando release
anterior. JAR em uso continua SHA-256
`78a2dcebd1328bc5dd159035a74b5f977c222e1b7c63f9acfaa4091393beff47`;
não há mudança Java, novos modelos de servidor ou motivo para restart.
