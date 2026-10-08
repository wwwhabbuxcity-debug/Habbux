# HABBUX — FOOT ALIGNMENT V7

Data: 2026-10-08. Base `fe6e652`. Destino `main` / Tyvo.

## Causa e coordenadas

`avatarAnchor` somava meio tile em Y, colocando o apoio no vértice inferior,
enquanto piso e hover usam o centro. `AvatarView` compensava pelo maior fundo
dos sprites STAND/WALK da direção. A referência X era a união de pernas e
sapatos; D2/D4 diferia em 0,5 px do apoio dos sapatos. O laboratório também
marcava o limite visual dos frames, sem mostrar um centro de tile real.

O fluxo corrigido é:

1. Posição autoritativa em coordenadas de sala; durante WALK, interpolação
   linear dos segmentos recebidos, preservada.
2. `roomToScreen(x,y,z,config)` calcula o centro usado por piso e hover:
   `X = originX + (x-y)×64×scale/2`;
   `Y = originY + (x+y)×32×scale/2 - z×16×scale`.
3. Esse ponto é a origem do Container. Não se adiciona meio tile nem se
   compensa altura nesse nível.
4. A composição usa pivot `A`, apoio dos sapatos STAND no espaço dos offsets.
   Um ponto local `P` aparece em `center + scale×diag(mirror,1)×(P-A)`.
   Para `P=A`, o erro em relação ao centro é matematicamente zero.

Z é aplicado uma vez. Escala negativa atua depois do pivot. A posição da
sombra é a origem do Container. Bbox não determina posicionamento. DPR altera
somente rasterização; resolução do canvas mantém o limite 2, inclusive em
device DPR 3. Coordenadas são fracionárias, sem snapping artificial.

## Referência de apoio

`tools/generate-avatar-foot-anchors.py` lê apenas os sapatos existentes no
Habbux. Em STAND frame 0, cada coluna com alpha ≥128 fornece o centro X do
pixel e a borda inferior do último pixel opaco. A média dos pontos, convertida
pelos offsets, registra apoio entre as solas. Não se usa o centro do corpo,
o pixel mais baixo ou bounding boxes de WALK. Todas as ações/frames reutilizam
esse ponto da direção; extensões e passada dos sapatos continuam visíveis.

São 16 referências (dois gêneros × oito direções), incluindo três reflexões.
O parser verifica número finito, região STAND correta, limites, amostras e
igualdade das referências espelhadas. Metadata opcional preserva compatibilidade
com manifestos anteriores; a entrega usa os pontos explícitos. PNGs/SVGs e
metadados dos frames originais não foram alterados. Nenhum asset externo novo.

## Validação

- Client: **146 PASS** (20 novos testes de apoio); protocolo: **18 PASS**, registry válido com 26 mensagens.
- Java 25/wrapper `clean verify`: **104 PASS, 4 SKIP**, zero failures/errors. Integrações PostgreSQL opcionais sem ambiente dedicado.
- Tipos e build client/web: exit 0, `nice -n 19`, Node 22 e heap 512 MB. Hygiene e `git diff --check`: PASS.
- O primeiro typecheck direcionado encontrou um acesso diagnóstico a `Container.roundPixels`, propriedade inexistente. Corrigido; typecheck completo posterior PASS.
- Gerador idempotente; hashes dos seis PNGs preservados. Nenhuma imagem ou frame alterado.
- Renderer real: **155 PNGs**; 304 poses de quarto verificadas e 160 poses nas matrizes. Oito direções STAND/WALK, quatro frames, dois gêneros, DPR 1/2/3, rotação parada e em caminhada, fim de um tile/caminho longo, curvas, Z=3, resize e hover/touch. Zero erros JS.
- Mesma posição lógica (6,6) conservada nas oito rotações paradas; origem do Container igual ao centro do tile. Dois avatares exercitam o caminho de renderização local/remoto.
- Erro geométrico anterior: **3.48–14.07 px CSS**, conforme viewport/direção; máximo físico **14.07 px**. Depois: **0 px CSS/físico nas amostras**. Limite exigido de 1 px físico atendido; sem snapping de posição.
- Geometria/materiais preservados: 63 modelos passam nos testes existentes; seis modelos de interface e cenas de piso/parede/oclusão/elevacão também capturados no renderer.
- `surfaceBuilds` inalterado durante caminhos longos/curvas; sprites e partes existentes reutilizados.

O diagnóstico mede o apoio transformado por `composition.toGlobal` do Pixi
real. O erro anterior usa posições dos Containers efetivamente renderizados
na release anterior e sua transformação conhecida, aplicada à mesma referência
dos sapatos. A comparação não estima apoio pela extensão visual das roupas.

No laboratório: azul representa tile/centro; verde, apoio; rosa, origem;
amarelo, bbox. Essa geometria adicional é exclusiva do laboratório/diagnóstico.
No quarto normal, não há listener novo, debug ativo ou cálculo de bbox/pixels
no ticker. Rotação durante WALK é exercitada tanto por curvas da fixture quanto
por controle diagnóstico, sem alterar a trajetória recebida.

## Movimento e performance

500/707 ms por segmento, 82 ms/frame e apresentação/tick de 100 ms preservados.
Nenhuma alteração em pathfinding, protocolo ou servidor. A pausa de cerca de
210 ms em endpoints cardinal→diagonal tardios é independente do apoio e não foi
alterada neste hotfix. Posicionar o avatar não mascara essa pausa.

Benchmark sequencial no mesmo Chromium/SwiftShader, 30 frames de aquecimento e 90 frames espaçados por RAF:

| Viewport | Versão | Avatares | CPU submit/frame | FPS software | Objetos |
|---|---|---:|---:|---:|---:|
| 1280 | baseline | 2 | 0.873 ms | 19.29 | 43 |
| 1280 | baseline | 10 | 1.100 ms | 17.04 | 195 |
| 1280 | candidate | 2 | 0.800 ms | 20.23 | 43 |
| 1280 | candidate | 10 | 0.746 ms | 20.23 | 195 |
| 390 | baseline | 2 | 0.942 ms | 18.75 | 43 |
| 390 | baseline | 10 | 0.758 ms | 27.27 | 195 |
| 390 | candidate | 2 | 0.641 ms | 30.17 | 43 |
| 390 | candidate | 10 | 1.523 ms | 23.79 | 195 |

Objetos iguais antes/depois (43/195), reconstruções de superfície constantes. Rodada final desktop com dez avatares 17,04→20,23 FPS; mobile 27,27→23,79 FPS. A regressão mobile desta rodada foi registrada. O host compartilhado e a GPU por software não permitem declarar ganho universal ou resultado de GPU física. CPU final de submissão: 0,641–1,523 ms/frame. A submissão inclui o driver; não mede apenas a interpolação.

Medições, capturas, hashes e JSONs: `tmp/foot-alignment-v7/after` e cópia permanente em `/root/backups/habbux-foot-alignment-v7/visual/after`.

As referências são resolvidas uma vez por avatar (oito pontos). Foram removidos
o Map/reconstrução da união de caixas a cada atualização visual e a varredura
de todos os fundos dos frames por direção. Sprites, textura e geometria do
quarto continuam reaproveitados; `surfaceBuilds` não aumenta durante WALK.
Piso, paredes, mapas, hover, CMS, HUD e chat preservados.

## Publicação e rollback

Artefatos conferidos, publicação estática preparada. Resultado operacional
será registrado após commit/push e troca da release.

Backup: `/root/backups/habbux-foot-alignment-v7/`, incluindo bundle Git,
manifesto anterior, destino da release anterior, logs e evidências visuais.
Rollback troca apenas `.deploy/current`, sem reinício de Java/Nginx.

## Limites

O apoio registrado é uma referência estável derivada das solas da figura
existente. Não se afirma equivalência artística com outro hotel. Avatares
locais/remotos foram renderizados por fixtures do mesmo AvatarView; uma sessão
autenticada multiplayer não é substituída por essas fixtures. GPU física/mobile
físico não disponíveis. Aguardam-se validação visual da proprietária e solução
separada da sincronização dos endpoints tardios.
