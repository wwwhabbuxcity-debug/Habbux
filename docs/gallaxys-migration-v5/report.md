# HABBUX — GALLAXYS MIGRATION V5

Data: 2026-10-09. Baseline `b18627814286053b00d4d7d011347fac8d90aef4`.
Implementação em `/var/www/tyvo.online`; Gallaxys consultado somente em leitura.

- MODELOS ENCONTRADOS: **64**.
- MODELOS CONVERTIDOS: **61**, sendo 58 GPL e 3 próprios declarados.
- MODELOS INTEGRADOS: **61 novos**; registro Java total **127**; catálogo do
  jogador com 62 opções, preservando os modelos e IDs anteriores.
- PISOS REAIS IMPORTADOS: **6 PNGs**, com **58 variantes** de material/cor.
- PAREDES REAIS IMPORTADAS: **52 PNGs**, com **162 variantes** de material/cor.
- TEXTURAS CONVERTIDAS: **58 clássicas**, **11.141 bytes**; pixels RGBA idênticos
  à origem. Ornamento próprio anterior arquivado, sem substituir materiais reais.
- AVATAR/WALK: perfil Default/Move GPL convertido e consumido; 8 partes,
  40 referências de frames; quatro frames WALK, oito direções, cadência82 ms,
  mirroring/cache/offsets/pé e pré-anúncio preservados. Nenhum pixel novo de avatar.
- DIFERENÇAS VISUAIS RESTANTES: máscaras/abertura de portas, contornos especiais
  de quartos públicos, acabamento de caps/bordas e composição do avatar.
  Não se declara fidelidade integral nem validação de sessão autenticada pareada.
- RECURSOS DE TERCEIROS PENDENTES: novos sprites faciais/expressões e outros
  conjuntos de avatar sem evidência específica; PNGs legados preservados.
  Mapas próprios e pisos/paredes confirmados pela dona não estão bloqueados.
- PERFORMANCE ANTES/DEPOIS: dez avatares, desktop **15,21→19,90 FPS** e mobile
  **32,73→35,29 FPS** na rodada final; dois draw calls e geometria estática
  preservados. Medição em SwiftShader, sem promessa para hardware físico.
- TESTES: client **188 PASS**, modelos **14 PASS**, protocolo **22 PASS**;
  Java **119 PASS / 4 SKIPPED**, zero falhas; typecheck/build PASS.
- COMMIT: **`35fc65029817f1240e25a42bf560f0a68aa21793`**, enviado para `main`.
- DEPLOY: **publicado em https://tyvo.online**, release `20261009T061343Z`;
  somente `habbux-tyvo` reiniciado, com autorização. HTTPS/WSS/game/client PASS.
- PENDÊNCIAS: três mapas inválidos; diferenças visuais descritas; GPU/celular
  físico e multiplayer autenticado não ensaiados.

## Conversão e integração

[Modelos](models.md), [mapeamento dos64](model-mapping.json) e
[fixtures dos61](model-fixtures.json) registram IDs, porta/spawn, dimensões,
heightmap, alturas, tiles bloqueados/caminháveis e alcance do pathfinding.
`custom_model` e `snowstorm_arena_1` não têm spawn adjacente válido; `the_den`
contém controles U+0001/U+0002 sem interpretação geométrica segura. Nenhum mapa
foi reparado inventando porta/altura. Padding acrescenta somente tiles bloqueados
ausentes; componentes desconectados são preservados. `custom_10` mantém somente
1 de133 tiles alcançável a partir do spawn; Java rejeita o interior inacessível.

58 modelos correspondem exatamente às definições distribuídas no CleanDB GPL;
os três custom próprios ficam em TSV separado. Conversores reproduzíveis,
fontes/avisos/licenças acompanham os dados. Nenhum banco completo, usuário,
schema/protocolo ou algoritmo de emulador foi copiado. Nenhuma consulta/escrita
nova no banco Gallaxys foi necessária; a referência V3 local foi reutilizada.

[Materiais](materials.md) registra PNGs, hashes, cores, offsets, vinculação de
220 variantes e a pergunta/resposta literal: **“ambos sao meu pode fazer total
acesso”**. Esta confirmação resolve a origem própria dos conjuntos perguntados.
Metadata GPL mantém sua licença e fonte, separadamente da declaração dos pixels.
Textures são nativas, verificadas por hash e carregadas sob demanda; até duas
fontes compartilhadas por sala, sem sprite por tile. Variações de cor reutilizam
Texture/ImageBitmap; downloads simultâneos compartilham promessas. Falha preserva
o material anterior; leitura/decode/timeout/dispose têm limites e cancelamento.
Piso/wallpaper reais são aplicados aos61 migrados e aos três modelos V3.

Nos migrados, piso/avatar/hover/câmera compartilham projeção **32 px por nível**,
parede3,6 e espessuras0,25 da referência. O nível lógico/pathfinding não muda.
Paredes são filtradas pela região externa e pela entrada, conservando buracos
internos sem paredes inventadas. Iluminação usa os fatores da referência; papel
alto não é achatado ao mudar a projeção. Modelos anteriores mantêm sua configuração.
Geometria é preparada somente ao trocar sala/material/viewport, sem rebuild WALK.

[Avatar](avatar.md): o perfil nativo controla a preparação dos frames e o clock;
manifestos próprios com quantidade diferente e peito STAND continuam válidos.
Os sete PNG/SVG legados e manifesto existente foram preservados byte a byte.
Falha/timeout de perfil mantém fallback V4 e permite retry. Room Engine e
pré-anúncio autoritativo não foram reescritos.

## Visual e verificações

Renderer Pixi real: **122 ensaios de modelos** (61 desktop1280/DPR1 +61
mobile390/DPR2), hover/touch em piso visível, geometria estática e apoio físico
<1e-8 px; **4 matrizes /160 amostras** e **16 ensaios de direção**, quatro
frames WALK e STAND. **58 imagens distintas** renderizadas em desktop e
6 representativas em mobile, incluindo papéis altos. Cache, reload, falha de
hash e continuidade de recursos passaram; nenhum erro JavaScript.
Catálogo62 e IDs125–127 passaram em ambas as larguras. São fixtures, sem conta real.

Três cenas pareadas usam o **renderer Gallaxys compilado existente**, executado
somente em loopback, e Habbux com **mesmo heightmap e IDs de materiais**:
model_a12×16, cinema_a24×29 e custom_9 13×16. Foram geradas seis capturas e
uma imagem lado a lado; original RoomPlaneParser/RoomPlane, máscaras retangulares
e projeção de32 px usados como referência. Não é captura de sessão autenticada
de produção; contornos de cinema e abertura da porta ainda diferem.
As referências anteriores de avatar foram reutilizadas, sem baixar novamente.

Evidências:
`/root/backups/habbux-gallaxys-migration-v5-20261009T043548Z/visual/final/`
e `visual/comparison/comparison-side-by-side.png` no mesmo backup. Total final
**16 capturas Habbux +6 comparativas +1 composição**, além de4 referências
de avatar reutilizadas. Capturas/logs não entram no Git/dist.

Build completo admin/client/web e build final client: saída0, Node22, nice19,
heap512 MiB, um worker. Maven Java25/wrapper `clean verify`: saída0, 123 testes,
4 integrações PostgreSQL opcionais sem configuração. Sem apontar testes ao banco
Gallaxys. Validação de protocolo e higiene PASS, sem alteração no registro de IDs.
Dependências/lockfile não mudaram; npm ci não repetido. Compose config NOT RUN:
Docker não está instalado. Hardware mobile/GPU físico e comparação multiplayer
autenticada NOT RUN; não classificados como PASS.

Falhas reais corrigidas: import dinâmico sem extensão no loader de avatar;
catálogo rejeitava125–127; hover de tile alto buscava com alcance da escala16;
check de binários ainda não reconhecia os58 novos PNGs. Dois problemas do runner
(stream de log ainda fechado e fixture de build antigo) também foram corrigidos.
Typecheck recusou propriedade opcional explicitamente undefined; removida de
modo compatível com strict. Histórico em `checks/failures.md` no backup.

## Operação e rollback

### Performance reproduzível

Chromium/ANGLE/SwiftShader em host compartilhado, ordem ABBA, 30 frames de
aquecimento e90 medidos por cena; mesmos viewports1280/DPR1 e390/DPR2.
Baseline é a release V4 publicada, candidato é o build V5. As cenas de movimento
e salaV3 usam a mesma geometria antes/depois; na salaV3 foram aplicados PNGs reais.

| Cena | FPS antes→depois | CPU submit ms antes→depois |
| --- | ---: | ---: |
| Desktop vazio | 17,38→20,06 | 0,357→0,335 |
| Desktop10 avatares | 15,21→19,90 | 1,486→1,238 |
| Desktop2 avatares/piso+parede | 24,56→39,13 | 0,338→0,254 |
| Mobile vazio | 34,40→43,21 | 0,273→0,310 |
| Mobile10 avatares | 32,73→35,29 | 1,074→0,975 |
| Mobile2 avatares/piso+parede | 32,43→32,93 | 0,238→0,262 |

Todos mantêm builds estáticos durante os90 frames; vazio tem1 draw call e
cenas com avatar2, antes/depois. Dez avatares195 objetos; cenaV3 com dois43.
O contador novo inclui a fonte WHITE dos Graphics, omitida no baseline:
7→8 no diagnóstico de dez avatares é correção de contagem, não textura nova.
Na sala com imagens reais, duas fontes adicionais são usadas; sem atlas por tile.
GPU/VRAM não foram medidos. CPU mobile vazio e material aumentaram0,037 e0,024 ms;
não se declara ganho uniforme. Uma rodada anterior deu desktop10
34,07→31,99 FPS; a variação de carga/FPS do host impede atribuição universal
ao código ou afirmar ausência de regressão em aparelhos físicos.
Dados finais: `visual/performance/performance-v3.json` no backup; nome legado
do runner reaproveitado. Refinamentos finais de caps/contorno dos modelos
migrados não afetam a geometria/configuração das três cenas medidas.

### Publicação e rollback

Backup principal:
`/root/backups/habbux-gallaxys-migration-v5-20261009T043548Z/`.
Inclui bundle Git baseline, release/JAR anteriores, hashes, snapshots de serviços,
logs e `rollback.sh` modo0700, sintaxe validada. Artefatos anteriores à inclusão
dos três próprios foram preservados também em
`/root/backups/habbux-v5-owned-models-20261009T052906Z/`.
Rollback preparado; não executado. Nenhum backup apagado.

JAR candidato SHA-256:
`ac6f840f6c753cd018801bc5397e8538319974ed3ebf3110e14f55e610664298`.
Release anterior: `.deploy/releases/20261009T040503Z`.
Antes da publicação, seis serviços ativos e mesmos PIDs da referência; Gallaxys
HTTPS200 e `public/gamedata` presente. Nenhum serviço Gallaxys, Nginx ou MariaDB
reiniciado, prioridade alterada ou arquivo de produção Gallaxys modificado.

Autorização final recebida: **“Aprovar publicação e reinício do Habbux”**.
Implementação commitada e enviada para `main`; dist publicados pelo script
oficial, trocando `.deploy/current` atomicamente e preservando a release V4.
JAR verificado instalado com dono `habbux`; SHA acima igual ao arquivo ativo.
Somente `habbux-tyvo` reiniciado; PID2549369→2581331, listener127.0.0.1:3100,
evento `emulator.ready`. Novo processo sem WARN/ERROR de aplicação no ensaio.
O systemd registrou status143 no encerramento por SIGTERM do processo anterior;
o novo processo está ativo, e a aplicação encerrou suas filas/pool normalmente.

Depois do deploy: `/`, `/game/` e `/client/` HTTPS200, HTML igual ao dist e
`Cache-Control: no-cache`; WSS READY em desktop1280/DPR1 e mobile390/DPR2.
Reload com cache PASS; caminhada local/remota em fixtures com jitter0/50 ms
mantém gap0 ms e erro físico do apoio0 px. Nenhum erro JavaScript, requisição
HTTP falha ou overflow. Sessão autenticada continua NOT RUN.

V5 pública: **67 arquivos** conferidos por SHA-256 contra o candidato, incluindo
todos os58 PNGs, catálogos, perfil de animação e fontes/licenças GPL selecionadas.
Catálogo de62 opções com último ID127 nos dois tamanhos. Duas salas migradas
representativas por viewport renderizam duas texturas reais, projeção32,
perfil WALK convertido e apoio0 px, sem rebuild durante avanço do clock.
Evidências: `visual/public/postdeploy.json`, `visual/public/public-v5.json` e
dez capturas públicas no backup principal; `checks/emulator-after-deploy.log`.

Os seis serviços conferidos seguem ativos. Polaris, imager, voice, Nginx e
MariaDB mantêm exatamente os PIDs anteriores; HTTPS Gallaxys200 e
`public/gamedata` presente. Nenhum serviço Gallaxys foi reiniciado.
