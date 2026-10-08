# HABBUX — GALLAXYS ENGINE PARITY V2

Data: 2026-10-08. Base: `f815ec9`. Destino: Habbux `main` / `tyvo.online`.
Escopo: Avatar V6, WALK/Movement V6 e superfícies V3. Implementação original;
Gallaxys somente em leitura. Nenhuma alteração em CMS, login, SSO, HUD ou chat.

## Diferenças comprovadas e decisão

| Área | Referência inspecionada | Causa no Habbux | Tratamento |
|---|---|---|---|
| Olhos | `Octane-Renderer/packages/avatar/src/cache/AvatarImageCache.ts`; aliases dos assets de face | Seleção masculina D3 removida; feminina D1 sem alias válido | Reusar a região frontal feminina já existente para a cabeça masculina de mesmos limites; perfil masculino existente para feminina. Sem fallback para outro setor |
| Mãos/braços | `HabboAvatarPartSets.ts`, estrutura do bundle de corpo | Manifesto tinha 11 partes, nenhuma `lh`/`rh`; manga não contém toda a pele | Atlas original de membros, derivado do punho de cada pose no próprio Habbux; 13 partes |
| Camadas | `AvatarImage.ts`, cache/composição | Ordem fixa não representava membro distante/próximo | Uma função compartilhada pelo laboratório e AvatarView, aplicada em cada direção; espelhamento de todo o conjunto |
| WALK | `AvatarVisualization.ts`, constantes 41 ms × 2 | Anatomia incompleta reduzia a leitura do movimento; snapshots alocados a cada atualização | Partes completas seguem a manga de cada frame; clock sem alocação de snapshots no hot path, cadência preservada |
| Rede | Polaris `Emulator/.../rooms/RoomUnit.java`; Habbux `RoomRuntime.java` e controller | Intervalo até o próximo endpoint depende do próximo passo; apresentação do endpoint atual depende do passo recebido | Reproduzida lacuna numa curva cardinal→diagonal. Sem mudar velocidade/predizer destino; pendência de sincronização descrita abaixo |
| Materiais | `RoomPlane.ts`, `RoomVisualization.ts`, geometria/paredes | Material simples; Graphics separados para todas as paredes, bitmap adicional do piso | Sombras de contato, faixa de luz e acabamento originais; planos externos agrupados; recortes mantêm depth sort |
| Performance | Benchmark V1 | 100 renders síncronos antes da medida de RAF; fila GPU e host compartilhado influenciam o número | Aquecimento de 30 frames, 90 frames espaçados por RAF, mesma máquina/browser; A/B explícito do bitmap |

Polaris e Octane foram localizados em `/var/www/gallaxys.com/Polaris-Emulator-main`
e `/var/www/gallaxys.com/Octane`; renderer em `Octane-Renderer/packages`. Dados e
bundles em `gamedata`, incluindo FigureData/FigureMap, animações e seis bibliotecas
humanas. Não foram recompilados, substituídos ou publicados.

## Avatar: olhos, pele e registro

- Seleções de olhos frontais D1–D5 válidas para ambos os gêneros. D0/D6/D7 são
  costas: ausência dos olhos é perspectiva, não falha. Franja conserva sua
  sobreposição natural. Não se deslocaram olhos artificialmente sobre o cabelo.
- `lh`/`rh` têm STAND e quatro frames WALK, oito direções e ambos os gêneros.
  Os cinco setores originais geram 100 regiões; D4/D5/D6 refletem D2/D1/D0.
- O gerador lê somente o manifesto e as imagens Habbux. Mede o último trecho
  opaco de cada manga, cria pele conectada ao punho e acompanha a pose. Usa
  proporção da cabeça para a palma e a anatomia completa já existente para
  dimensionar o antebraço. Sem correção fixa por personagem.
- Manga fica sobre a junção da pele; membro distante fica atrás do tronco,
  próximo na frente. Cabeça cobre cabelo posterior; olhos ficam sobre a cabeça,
  abaixo do cabelo frontal. Paleta padrão original separa pele/roupas.
- Registro comum, coordenadas fracionárias e pés estáveis permanecem. O PNG
  não é espelhado sozinho; offsets e todas as partes recebem a mesma reflexão.
- Manifesto v1 continua sendo validado contra limites do atlas. Aceita as
  antigas 11 partes/6 sheets ou 13 partes/7 sheets. A ausência de mãos num
  manifesto antigo é opcional; layer apontando para parte ausente é rejeitado.

## Origem e licença

| Recurso | Origem/autoria | Situação |
|---|---|---|
| Código Polaris/Octane/Renderer | Repositórios Gallaxys; GPL-3.0 local | Apenas leitura de comportamento; nenhum código importado |
| Novas regiões/texturas Gallaxys | Bibliotecas com licença individual não comprovada | Bloqueadas para integração; nenhuma extraída neste ciclo |
| Seis `hh_human_*.png` anteriores | Legado Habbux; script histórico `/tmp/habbux-avatar-research/final_manifest.py` lê bundles Gallaxys | Origem identificada; direito de uso ainda sem comprovação. PNGs preservados, SHA-256 conferido. Não lhes foi atribuída licença MIT |
| Olhos | Regiões já usadas do atlas Habbux de face | Seleção de metadados corrigida; nenhum pixel novo copiado |
| `habbux_hands_original_v1.svg` | Criação original Habbux; gerador Python versionado | MIT específica, 320×480, 19.530 bytes, 100 regiões |
| Materiais de piso/parede | Vetores/procedimentos originais Habbux | Sem textura externa nem dependência runtime do Gallaxys |
| Capturas do imager | Endpoint público Gallaxys, somente referência | Backup operacional; não entram em dist nem no repositório |

A evidência histórica corrige uma ambiguidade dos relatos antigos: os assets
anteriores têm relação com bundles Gallaxys. Esta entrega não regulariza seus
direitos nem amplia a importação. A licença do novo SVG não cobre os seis PNGs.

## Movimento e limite reproduzido

Preservados 500 ms/cardinal, 707 ms/diagonal, 82 ms/frame, tick 100 ms, apresentação
100 ms e fila circular limitada a 256. A fase WALK atravessa tiles/curvas e
conserva a sobra do frame. Coordenadas continuam lineares, sem curvas artificiais.
Não houve mudança de emulador, SQL no hot path ou reinício para esta entrega.

Reprodução controlada: após receber um endpoint cardinal, o seguinte diagonal
chega 800 ms depois (707 arredondado pelo tick). A apresentação do cardinal
termina em 600 ms (100 + 500). Foram observados cerca de 210 ms de STAND na
amostra de 10 ms, incluindo o limite do frame. Portanto **MOVIMENTO PARTIAL**
para pacotes mistos tardios. Corrigir universalmente exige eventos com tempo/
duração ou pré-anúncio autoritativo, ou mais latência de apresentação. Nenhuma
dessas mudanças foi disfarçada como ajuste de velocidade. Caminhos já enfileirados,
movimento horizontal e cardinal/diagonal homogêneo permanecem aprovados.

## Piso e paredes V3

A projeção 64×32×16, espessura 0,5, parede de altura 8 e espessura 0,16 permanecem
coerentes. Sombras de contato seguem as bordas posteriores reais, incluindo
recortes, dentro do topo dos tiles. Madeira tem juntas espaçadas e cor contínua
entre células. Faixa inferior, rodapé/cornija e grão vetorial dão acabamento às
paredes. Vértices e caps compartilhados da V1 foram preservados.

Paredes nos planos x=0/y=0 posteriores são agrupadas com o piso; não podem ocultar
um ocupante dentro do quarto. Paredes de recortes e pisos elevados continuam
individuais para ordenação. Hover permanece separado, usa geometria real e não
vira textura. Mapas lógicos, walkability, clique/touch, DPR e zoom não mudaram.
`surfaceBuilds` verifica que a caminhada não reconstrói essas superfícies.

## Validação e evidência

- Client: **126 PASS**, zero falhas. Sete testes novos cobrem orientação/limites dos olhos, membros em todas as poses, camadas, legado e fase do clock.
- Protocolo: **18 PASS**, registry válido com 26 mensagens; nenhum payload alterado.
- Java 25 / wrapper / `clean verify`: **108 totais, 104 PASS, 4 SKIP**, zero falhas. Integrações PostgreSQL opcionais sem ambiente dedicado; banco ativo não usado como alvo de testes.
- Typecheck client/web e build client/web: exit 0, sempre `nice -n 19`; Node 22, heap 512 MB e Rayon 1. Client novamente conferido após a seleção do cache.
- Hygiene, `git diff --check`, JSON validado, gerador idempotente e seis hashes de PNG: PASS.
- Renderer Pixi real: **236 PNGs isolados**; matrizes completas de ambos os gêneros e 26 matrizes de partes, 16 combinações direção/viewport com dois avatares STAND/WALK, 13 cenas por viewport, quatro frames WALK, hover/touch, resize com Z e **63 modelos reais em ambos os viewports**.
- Nas 64 poses de avatar das oito direções, membros obrigatórios visíveis/alpha=1; olhos presentes somente nas direções frontais. Comparação de posição: zero amostras repetidas na caminhada horizontal em desktop/mobile.
- Evidência: `tmp/gallaxys-engine-parity-v2/after/index.html`, JSONs de resultados/performance e `reference/paired-stand-directions.png`; cópia permanente no backup operacional `visual/after` e `visual/reference`.
- Zero erros JS no conjunto isolado. Partes naturalmente ocultas pelo tronco/cabelo são distintas de ausência de região.
- Smoke público: **12 PNGs adicionais**, HTTPS 200, WebSocket real READY em desktop/mobile; WALK horizontal/frontal e STAND com dois avatares. Mãos, olhos frontais, SVG HTTP 200 e ausência de overflow/erros JS conferidos. Sessão autenticada de quarto continua NOT RUN.

Referências públicas: 16 APNGs, oito direções × STAND/WALK, HTTP 200. WALK tem
quatro frames de 83 ms no APNG; a animação STAND inclui ciclo de piscar. O
arredondamento de 83 ms do formato não motivou alterar o clock de 82 ms. A figura
de referência tem roupa/paleta diferentes; compara anatomia e direção. Não há
captura pareada de um quarto autenticado ou trajetória Gallaxys em rede. **Não
se declara paridade integral de caminhada, materiais ou renderização.**

## Performance

| Viewport | Versão | Avatares | FPS software | CPU submit/frame | Objetos |
|---|---|---:|---:|---:|---:|
| 1280 | baseline | 2 | 19.71 | 0.978 ms | 75 |
| 1280 | baseline | 5 | 16.82 | 1.413 ms | 126 |
| 1280 | baseline | 10 | 16.17 | 0.939 ms | 211 |
| 1280 | candidate | 2 | 21.01 | 0.566 ms | 43 |
| 1280 | candidate | 5 | 19.78 | 0.883 ms | 100 |
| 1280 | candidate | 10 | 14.92 | 0.808 ms | 195 |
| 390 | baseline | 2 | 37.24 | 0.877 ms | 75 |
| 390 | baseline | 5 | 27.55 | 1.159 ms | 126 |
| 390 | baseline | 10 | 29.03 | 0.964 ms | 211 |
| 390 | candidate | 2 | 26.73 | 0.778 ms | 43 |
| 390 | candidate | 5 | 40.91 | 0.574 ms | 100 |
| 390 | candidate | 10 | 31.04 | 1.000 ms | 195 |

Rodada final: desktop com 10 avatares 16,17 → 14,92 FPS; mobile 29,03 → 31,04. A regressão desktop desta rodada foi registrada, não declarada resolvida. CPU de submissão final 0,566–1,000 ms. Contador de reconstrução constante durante cada caminhada.

A/B na mesma cena, antes da seleção do padrão (bitmap → geometria): desktop 2 avatares 24,33 → 28,13 FPS, 10 avatares 26,87 → 26,21; mobile 2 avatares 44,27 → 57,45, 10 avatares 47,37 → 51,93. Bitmap desativado por favorecer a geometria na maioria dos casos e evitar a textura intermediária de fundo. Não se infere ganho universal.

Reprodução do benchmark antigo no mesmo browser: após 100 submissões síncronas, desktop V1 16,17 → 7,75 FPS e V2 14,92 → 7,09, comparados à medição espaçada/aquecida. Isso comprova influência da fila GPU no método antigo; não identifica sozinho a causa histórica completa de 34 → 17. Entre rodadas a V1 variou de 16 a 25 FPS e a V2 de 15 a 28 no desktop, evidenciando a variabilidade do host. Performance PARTIAL: falta hardware físico e medição controlada fora do servidor compartilhado.

As medições usam Chromium/SwiftShader, fixture isolada, servidor compartilhado.
Não representam GPU física ou jogadores autenticados. Assets ficam em sete
fontes compartilhadas, regiões/Sprites são reaproveitados e destruídos sem
destruir as fontes compartilhadas. Piso e paredes só mudam em mapa/resize.

## Publicação e rollback

Implementação: `ef532e5` (`fix(renderer): complete avatar parts and retain room geometry`), push `main` concluído. Release publicada:
`/var/www/tyvo.online/.deploy/releases/20261008T055250Z`.

Checkout Tyvo atualizado por fast-forward. Dist conferidos copiados via rsync
com `--exclude gamedata`; script oficial trocou `.deploy/current` atomicamente.
Nenhum fonte/segredo foi colocado na raiz pública. Manifesto local/publicado
SHA-256 `9452cd557787c15a4cd327ee80a2c52eb6fdb1a9c239bdc85d4bcdea251d5ed2`.

- `/`, `/game/`, `/client/`: HTTP 200; READY real via WSS nos dois viewports.
- Fontes privadas: `/package.json`, `/AGENTS.md` 404; `/.git/config`, `/.env` 403.
- Browser com cache V1: antes `hands=false/frontalEyes=false`; após reload ambos
  `true`. PASS, sem limpeza manual de cache.
- Publicação manteve o JAR e PID Habbux `2442770`, ativo desde 00:53:43 -03;
  Polaris `1808934`, ativo desde 30/09. Sem restart/reload de serviços.
- `habbux-tyvo`, Polaris, imager, voice, nginx e MariaDB ativos; Gallaxys HTTP
  200 e seu gamedata presente. Checksum do JAR runtime anterior preservado.
- Evidências públicas, logs, JSONs e script de rollback no backup operacional.
- Esta atualização documental registra o resultado operacional, sem nova
  publicação estática ou mudança de artefato.

Rollback: backup `/root/backups/habbux-gallaxys-engine-parity-v2/`, bundle Git,
manifesto anterior, hashes e destino estático anterior. O script de rollback
troca somente o symlink da release, sem reiniciar Java/Nginx. Não houve alteração
do Gallaxys ou das prioridades de serviços.

## Pendências

- Validação visual da proprietária após entrega; parar até esse retorno.
- Sincronização de curvas com endpoints mistos tardios e sem timestamps.
- Direitos dos seis atlas legados; não há novos recursos Gallaxys incorporados.
- Quarto/traçado Gallaxys pareado e sessão Habbux autenticada real com remotos.
- Desempenho e memória GPU em desktop/mobile físicos.
