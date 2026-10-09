# HABBUX — GALLAXYS MASTER INTEGRATION V3

Data: 2026-10-08. Branch `main`; baseline atual
`e436cd92e0613b301bc9c1926df12e53981d24bd`. Implementação em `/var/www/tyvo.online`,
sem retornar ao checkpoint antigo e sem sobrescrever CMS/admin/home recentes.
Gallaxys consultado somente em leitura. Validação técnica concluída; publicação
operacional registrada abaixo após execução.

## Resultado técnico

- WALK: **PARTIAL**. Quatro frames, fase contínua, oito direções e movimentos
  locais/remotos nas fixtures passaram. Atraso arbitrário de rede, sessão pública
  autenticada e paridade visual de trajetórias Gallaxys não foram aprovados.
- Pausa: corrigida sua causa, com pré-anúncio do próximo passo autorizado e
  reservado pelo servidor. O relato anterior de ~210 ms media parte da lacuna;
  a reprodução completa mostra 200 ms entre fim/recepção mais startup de 100 ms,
  total **300 ms**. Candidato: **0 ms** na mesma curva e nos quatro ensaios Pixi
  desktop/mobile com atraso constante 0/50 ms. Amostragem de 10 ms.
- Direções: **PASS** nas oito orientações STAND/WALK, ambos os gêneros e quatro
  frames. Foot anchor: **PASS**, erro físico amostrado **0 px**, DPR 1/2/3.
- Modelos externos: **64 encontrados / 0 autorizados / 0 convertidos**.
  Habbux: **66 modelos** (63 anteriores intactos + 3 originais), capturados em
  dois viewports. Os três novos passam validação estrita de spawn/conectividade.
  A tolerância dos modelos antigos foi preservada, sem declarar regularização
  dos seus direitos ou conectividade universal.
- Piso/parede: sistema original configurável integrado ao mesmo renderer;
  cores, repetição, opacidade, iluminação, acabamento, altura e espessura.
  Superfícies contínuas, junctions, sorting e hover anteriores preservados.
  Materiais default preservam a apresentação anterior; V4 é configuração
  explícita. Padrões procedurais compartilhados, sem textura por tile.
- Performance: **PARTIAL**. Medições de SwiftShader abaixo; GPU física,
  memória GPU e aparelhos reais indisponíveis. Nenhuma equivalência presumida.

## Movimento, autoridade e compatibilidade

[WALK V8](walk.md) e [ADR 0023](../adr/0023-authoritative-next-step-announcement.md)
documentam a implementação e seus limites. Velocidades continuam **500/707 ms**,
tick **100 ms**, buffer inicial **100 ms**, frames **82 ms**. Elevação é aplicada
uma vez; nenhuma bbox variável determina apoio. Não houve ajuste artificial de
velocidade nem extrapolação para tile desconhecido.

O servidor reserva destino e duas células laterais de diagonal antes de anunciar.
Spawn/pathfinding respeitam reservas. Commit/saída/cancelamento liberam os
índices; arrays por sala/presença são limitados. Troca de destino mantém o passo
prometido e substitui a cauda. Reservas conservadoras reduzem travessias simultâneas
nos cantos; não se promete throughput de sala cheia não medido.

Protocolo canônico tem 28 mensagens. JOIN_MOVEMENT ID27 opta por STEP ID28 com
origem/destino/Z, sequência, duração e tempo restante. Endpoints ID20 continuam.
Client novo sonda suporte via JOIN legado do ID reservado Long.MAX_VALUE,
sem criar runtime; resposta categoria5 habilita o opt-in. Servidor antigo responde
categoria legada e recebe JOIN antigo. Client antigo não recebe IDs novos.
Logout/reconnect limpam negociação. Suporte custa uma ida/volta adicional na
primeira entrada, sem alterar autenticação, SSO ou funcionalidades de chat.

Tick mais jitter que exceder a folga do buffer pode produzir espera segura.
Os testes incluem atraso grande para assegurar parada/retomada; não o classificam
como movimento contínuo. A origem lógica muda somente no commit do servidor.

## Comparação reaproveitada da referência

Reutilizadas auditorias anteriores: [Engine V2](../gallaxys-engine-parity-v2/report.md),
[Foot V7](../foot-alignment-v7/report.md) e
[geometria Gallaxys](../isometric-world-v2/gallaxys-audit.md).
Fontes reais identificadas ali: MovingObjectLogic, AvatarVisualization, AvatarImage,
RoomUnit, RoomCycleManager, PathfinderImpl, RoomLayout, RoomPlane e RoomVisualization.
Não se repetiu extração nem auditoria abrangente dos mesmos componentes.

| Medida | Gallaxys observado anteriormente | Habbux V3 |
|---|---|---|
| Interpolação normal | Linear, referência 500 ms | Linear por segmento 500/707 ms |
| Cadência WALK | Visual 41 ms × 2; APNG arredonda a 83 ms | 82 ms, quatro frames, sobra de tempo preservada |
| Direções | Oito setores e espelhamento composto | Oito setores, mesma transformação de todas as partes |
| Continuidade | Não há trajetória autenticada pareada disponível | Zero lacuna na curva controlada, sem reset de fase por tile |
| Composição | Partes/ações/offsets e camadas da referência | 13 partes existentes; nenhum novo pixel externo |
| Apoio | Referência artística, sem medição geométrica pareada de quarto | Centro do tile e pivot STAND fixo; erro transformado zero |
| Materiais | Planos com materiais/texturas e cache | Planos/contorno próprios, geometria retida e materiais procedurais |

As referências do imager têm roupa/paleta diferentes. Foram conferidas matrizes
existentes da referência e screenshots Habbux, mas não há filmagem simultânea de
quartos/traçados autenticados. **Não se declara paridade visual integral** nem
que escolher 82 ms reproduza sozinho a caminhada da referência.

## Modelos e proveniência

[Inventário](models-inventory.json), [conversor](models.md) e
[proveniência](models-license.md) registram os 61 modelos da tabela room_models
e 3 da room_models_custom. Consulta somente SELECT; nenhum dado de usuário lido.
Heightmaps externos ficam exclusivamente no backup operacional `reference/`,
modo 0600. Metadados/hashes estão no repositório, sem importar geometrias externas.
Pelas regras novas, 61 externos têm geometria/spawn local válidos, 3 são rejeitados
e 44 são conectados. Isto não equivale a autorização de uso.

Três modelos independentes: `hbx_courtyard_v3`, `hbx_terrace_v3`, `hbx_alcove_v3`;
IDs virtuais `9000000000000000064` a `9000000000000000066`. Há sala plana,
terraço com degrau de um nível e footprint recortado. Recurso separado mantém
índices/bytes dos 63 antigos. Converter valida autorização/evidência, limites,
retangularidade, alturas, porta/spawn, conexão e IDs próprios; saída `wx` impede
sobrescrita. TSV usa TAB real, compatível com o loader Java, conferido por bytes.

| Recurso | Origem/autoria/licença observada | Classificação/ação |
|---|---|---|
| Polaris/Octane/Renderer | Repositórios locais GPL-3.0, conforme auditoria precedente; autoria externa preservada | REFERENCE_ONLY; nenhum código incorporado |
| 64 modelos e bundles externos | Permissão individual não encontrada | UNKNOWN; importação BLOCKED |
| 63 modelos e seis PNGs históricos Habbux | Origem/direitos individuais não comprovados; bytes existentes preservados | UNKNOWN; sem novos imports nem licença livre atribuída |
| SVG de mãos existente | Habbux original, licença MIT específica | AUTHORIZED; preservado |
| Três modelos novos | Criação original Habbux, proveniência versionada | AUTHORIZED para uso próprio; três convertidos |
| Materiais/conversor novos | Código e padrões procedurais originais Habbux | AUTHORIZED para uso próprio |

O conversor exige evidência preenchida por operador responsável; não autentica
uma declaração falsa de autorização. Licença de código não comprova direitos
dos dados/assets. Hashes dos sete sheets e do arquivo legado continuam iguais.

## Piso e paredes

[Materiais V4](materials.md): cores principal/secundária, textura procedural
opcional (boards/slabs no piso, grain/panels na parede), escala/repetição em
coordenadas do mundo, opacidade, luz por face, acabamento plain/trimmed.
Altura/espessuras passam pela mesma projeção/enquadramento do piso, avatar e hover.
UNKNOWN, REFERENCE_ONLY e BLOCKED são recusados para texturas.

RoomRenderer.setMaterials/setStyle invalidam uma vez as superfícies estáticas.
Sem novo cache global, atlas por tile ou renderer por modelo. Caminhada não
reconstrói piso/paredes; geometria Pixi é retida, fonte dos sprites compartilhada.
Cache bitmap continua opcional e desligado por padrão, como no ensaio anterior.
Não há loader de novas texturas raster, editor de materiais ou UI nova em HUD.

## Validação e falhas corrigidas

- Client: **159 PASS**, zero falhas; após ajuste final do default, reteste
  direcionado de materiais/geometria **34 PASS**.
- Conversor: **10 PASS**. Protocolo final: **22 PASS**, registry 28 válido.
- Java 25/wrapper: **121 totais, 117 PASS, 4 SKIP**, zero failures/errors,
  `clean verify` exit0. Integrações PostgreSQL opcionais não configuradas; banco
  ativo não foi usado como alvo de testes de persistência.
- `npm ci`, typecheck admin/client/web, builds admin/client/web exit0. Client
  revalidado após logout e ajuste do material padrão. Nice19, heap512 MB,
  Rayon1; compilações sequenciais. Nenhuma dependência nova.
- Hygiene, diff whitespace, formatos, hashes dos assets/modelos e rollback: PASS.
- Renderer Pixi real: **200 PNGs**, 24 conjuntos de direção (DPR1/2/3), 4 matrizes,
  132 capturas de modelos, 26 cenas, 8 materiais; curvas e local/remoto com atraso
  0/50 ms sem pausa, erro de apoio zero, sem JS errors. Hover/touch elevado após
  resize aprovado. Evidências em `visual/after/visual-v3.json` e galeria index.html.
- Após restaurar o default, **12 PNGs adicionais / 6 pares** têm SHA-256 RGBA
  idêntico à release anterior: piso/paredes planos, elevação e recorte,
  desktop/mobile. `visual/default-check/default-check.json` comprova igualdade
  de pixels, incluindo dimensões físicas; não é comparação estimada por bbox.

Falhas reais, preservadas nos logs:
1. Novo TSV inicialmente escrevia backslash+t; corrigido para TAB real e testes
   independentes acrescentados, incluindo colisão de ID existente pela CLI.
2. Primeiro build Java falhou por case MOVEMENT_SUPPORTED inserido no switch
   CHAT; removido, sem mudar semântica de chat. Import ausente do teste corrigido.
3. Segunda execução Java: parser do teste de registry dependia de espaços JSON;
   corrigido mantendo comparação de todos os IDs. Teste retarget supunha cinco
   passos, embora BFS pudesse garantir diagonal e concluir em quatro; passa a
   verificar endpoint prometido, adjacência e destino sem número arbitrário.
4. Primeira fixture de material pressupunha face interna inexistente; passou a
   conferir face externa elevada real. Nenhuma geometria alterada para acomodar teste.

## Performance e limites das medições

Chromium/ANGLE/SwiftShader em servidor compartilhado, mesmo browser; 30 frames
de aquecimento e 90 espaçados por RAF. Draw calls instrumentados no WebGL do
canvas real. CPU mede submissão/render e, na cena hover, evento/hit/realce. Não
é medida de tempo exclusivo GPU ou memória VRAM. Heap JS é amostra, sem inferir
uso de memória GPU. Sprites/fontes contabilizados pelo diagnóstico somente quando
solicitado, fora do ticker normal.

Primeira rodada A/B completa mostrou regressão; não foi omitida:

| Viewport | Dez avatares FPS antes/depois | CPU submit antes/depois |
|---|---|---|
| 1280 / DPR1 | 23,48 → 21,10 | 0,874 → 1,104 ms |
| 390 / DPR2 | 43,20 → 27,00 | 0,748 → 1,099 ms |

Objects permanecem 195, draw calls2, 130 sprites e 7 fontes no candidato; WALK
não aumenta surfaceBuilds. A cena sem avatares também variou fortemente. Revisão
do default encontrou apenas diferença involuntária na cor do grão e forma dos
fills, corrigida conservando caminho único. Isto não prova causa dos FPS.
Rodada alternada ABBA após correção, com duas medidas por versão/cena:

| Viewport | Dez avatares FPS médio antes/depois | CPU médio antes/depois |
|---|---|---|
| 1280 / DPR1 | 15,37 → 24,83 | 1,779 → 1,066 ms |
| 390 / DPR2 | 29,85 → 30,71 | 1,137 → 1,292 ms |

Desktop candidato variou 24,55–25,12 FPS; mobile candidato 24,44–36,99.
Mobile vazio variou de média42,23 para25,31 FPS, mesmo com CPU0,288→0,289 ms,
um draw call e pixels finais idênticos ao baseline na conferência separada.
Não se atribui toda a variação a código nem se declara estabilidade comprovada.
No candidato dez avatares: 195 objetos, 130 sprites, sete fontes e dois draw calls;
surfaceBuilds inalterado, memória JS amostrada na rodada inicial 14,3–21,5 MiB.
Geometria default e apresentação não foram simplificadas para obter os números.
ABBA completo em `visual/abba/performance-v3.json`.
Resultados completos de piso, paredes, hover, 2/10 avatares e heap:
`visual/after/performance-v3.json`. Não se declara regressão universal resolvida,
GPU física aprovada ou desempenho estável de aparelhos reais.

## Publicação e rollback

Backup completo:
`/root/backups/habbux-gallaxys-master-integration-v3-20261009T021559Z/`.
Contém baseline.bundle, HEAD/status, release anterior, JAR anterior, hashes,
heightmaps de referência, logs, capturas e rollback.sh (bash -n validado).
Rollback restaura symlink/release e JAR, reiniciando somente Habbux após aviso.
Não há migration nova, mudança de prioridade ou reinício Gallaxys.

Implementação: **566f386**; push para `main` concluído e verificado.
Release: `/var/www/tyvo.online/.deploy/releases/20261009T024604Z`.
Script oficial publicou somente dist e trocou symlink atomicamente, preservando
releases anteriores. JAR instalado por troca de arquivo e somente `habbux-tyvo`
reiniciado após aviso. Sem restart/reload de Gallaxys, Nginx ou MariaDB.

- SHA-256 build/JAR ativo: `78a2dcebd1328bc5dd159035a74b5f977c222e1b7c63f9acfaa4091393beff47`.
- Log `emulator.ready`, listener loopback3100, sem ERROR/Exception na inicialização.
- `/`, `/game/`, `/client/`: HTTPS200. HTML web/client por SHA-256 igual ao dist.
  Cache-Control no-cache; páginas privadas package/AGENTS404, .git/.env403.
- Browser real público: **10 PNGs adicionais**, WSS READY em desktop1280/mobile390,
  reload com cache PASS, zero JS errors/requisições HTTP falhadas e sem overflow.
  Dois avatares STAND/WALK nas fixtures públicas, apoio físico0. Nenhum cadastro,
  conta real ou sessão pública autenticada usada; esta última permanece NOT RUN.
- `habbux-tyvo`, `gallaxys-polaris`, `gallaxys-imager`, `gallaxys-voice`, Nginx e
  MariaDB ativos. Polaris mantém **PID1808934**; Gallaxys HTTPS200 e gamedata presente.
  Habbux passou de PID2511249 para2549369. Prioridades dos serviços intactas.
- Evidências operacionais: `visual/public/postdeploy.json`, `services-after.txt`,
  `habbux-postdeploy.log`, `published-release.txt`, `implementation-head.txt` no backup.
- Galeria consolidada: `/root/backups/habbux-gallaxys-master-integration-v3-20261009T021559Z/index.html`.
  Total **222 PNGs novos**: 200 de integração +12 de comparação default +10 públicos.
- Preview público: `https://tyvo.online/client/?avatar-lab=1`. Sessão `/game/`
  continua com sua proteção de login anterior; não houve mudança de HUD/CMS.

Documentação operacional consolidada em commit posterior; não muda artefatos
validados nem requer republicação/reinício. Checkout Habbux sincronizado por
fast-forward, preservando os commits anteriores. Servidores temporários de
fixtures em loopback encerrados ao concluir as verificações.

## Pendências que impedem PASS integral

- Comprovação de direitos dos atlas/modelos legados e dos externos.
- Comparação de trajetória/quarto Gallaxys autenticado e julgamento visual da dona.
- Sessão pública autenticada multiplayer e atraso/jitter real além das fixtures.
- GPU física, mobile real, memória GPU e validação controlada das regressões.
- Continuidade sob atraso arbitrário não é prometida com buffer limitado.

Sem mudanças funcionais em CMS, autenticação/SSO, HUD, chat, catálogo ou administração.
O pequeno estado de negociação no Core pertence ao transporte da caminhada.
