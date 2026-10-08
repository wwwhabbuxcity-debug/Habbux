# HABBUX — ISOMETRIC WORLD ENGINE V2

Entrega técnica; aprovação visual da responsável permanece pendente.
Detalhes e evidências de origem: [auditoria](gallaxys-audit.md) e
[ADR 0018](../adr/0018-isometric-world-surfaces-and-movement.md).

## 1. Auditoria

Polaris, Octane e Octane-Renderer foram inspecionados somente para leitura.
O fluxo de caminho, cadência, projeção, composição, planos, materiais e sorting
foi comparado com a arquitetura própria do Habbux. A auditoria lista os arquivos
e as limitações. Licenças locais GPL-3.0 verificadas; código/texturas Gallaxys
não foram incorporados. Os seis PNGs de avatar existentes permanecem intactos,
mas não há comprovação individual de titularidade na árvore Habbux.

Baseline real: `main` em `7e8fd47`, árvore limpa, 23 testes client PASS.
O checkpoint solicitado `382383b` precede uma correção CMS/SSO preservada.
Checkout Tyvo anterior `a05ae4f` é ancestral e estava atrasado; nenhuma alteração
local pendente foi sobrescrita. As seis opções de quarto e dimensões foram mantidas,
bem como o registro completo de modelos válidos.

## 2. Movimento

- Causa horizontal: sprites de tela e delta do grid diferiam em um setor.
  `(1,-1)` projeta horizontal à direita e agora usa E/1; `(-1,1)` usa W/5.
  Todas as oito correspondências têm testes e frames reais.
- Rigidez temporal: o cliente descartava a sobra do frame ao trocar segmento,
  e o servidor somava 707 ms ao tick já arredondado, acumulando atraso.
  O cliente transfere a sobra e o servidor mantém o prazo acumulado.
- Tick 100 ms, cardinal 500 ms, diagonal 707 ms e WALK 82 ms preservados.
  Buffer inicial de 100 ms: uma cadência do servidor, sem alterar a velocidade.
- WALK continua durante segmentos, atualiza direção mesmo quando o frame não
  muda, e preserva fase. Frames demorados avançam pelo tempo real sem loop ilimitado.
- Curvas seguem segmentos legais; nenhuma curva atravessa parede/canto.
  Ambos os cantos ortogonais e ocupação são validados no caminho e no passo.
- Caminhos de 1, 5, 10 e 20 tiles, horizontal/vertical/diagonal, atraso em lote,
  FPS variável, troca de direção, correção e overflow têm testes.
- Fila circular de 256 passos; overflow aplica correção autoritativa e limpa a fila.
- Servidor: broadcast de posições a 2/5/10 participantes e limpeza ao sair PASS.
  Renderer: 2/5/10 avatares caminhando simultaneamente PASS em fixtures locais.
  Dez sessões humanas autenticadas pela Internet não foram ensaiadas.

## 3. Avatar

Compositor, sinal dos offsets, layers do manifesto, mirroring 4/5/6,
nearest-neighbor, foot anchor por metadados e snapping do conjunto preservados.
Direção correta e continuidade WALK corrigidas. Cache do foot offset por direção
reduz trabalho; sombra discreta dá contato com o piso. Nenhum sprite foi redesenhado
ou copiado. A matriz Avatar Lab mantém oito direções, quatro WALK, STAND,
bounding boxes e guia dos pés; ganhou cenas animadas pelo `RoomRenderer`/`AvatarView` real.

## 4. Chão

Geometria 64×32 compartilhada com hover/projeção. Superfície contínua com padrão
wood/stone próprio, juntas discretas, espessura 8 px na escala 1, faces externas,
alturas e transições. Vazios não geram losangos pretos. Faces elevadas participam
da ordenação de entidades, assim como o destaque.

Hover/click compartilham o hit test existente; bloqueios e elevação preservados.
Toque mantém destaque por 450 ms: `pointerleave` do toque já não apaga imediatamente.
O mesmo teste foi executado com DPR 2. Geometria é reconstruída somente por mudança
de mapa/viewport, sem resize do canvas a cada pacote de posição.

## 5. Paredes

Faces esquerda/direita seguem o contorno real, incluindo recortes. Altura 8 Z
(128 px), espessura 0.16 tile, tampa, cantos conectados, términos externos,
rodapé e sombreamento próprio. Material/cor/altura/espessura configuráveis por
código, sem UI nova. Paredes de fundo ficam abertas na frente para visão do quarto.

Projeção, Z e encaixe usam os mesmos vértices do piso. A camada ordenada inclui
parede, piso elevado, hover e avatar. Captura de recorte mostra oclusão parcial
correta, sem apagar o avatar que aparece além da extremidade visível da parede.
Futuros mobis grandes exigirão extensão de sorting por footprint; não foram implementados.

## 6. Qualidade e evidências

| Check | Resultado |
|---|---|
| Maven Java 25 `clean verify`, depois `verify` com novo teste remoto | 108 testes; 0 falhas/erros, 4 skips PostgreSQL |
| Client | 51/51 PASS (23 existentes + 28 novos) |
| Protocolo | 18/18 PASS; registry com 26 mensagens válido |
| Typecheck Client/Web | PASS |
| Build Client/Web | PASS, `nice -n 19`, heap Node 512 MiB, um thread de build |
| Repository check e diff check | PASS |
| Avatar assets | seis PNGs e manifesto sem alterações; checksums preservados |
| E2E visual local | Chromium instalado, renderer WebGL real, desktop 1280×900 e mobile 390×844/DPR 2 |
| Capturas | 13 cenas por resolução + 4 frames WALK por resolução + hover |
| Banco PostgreSQL integrado | NOT RUN: quatro testes pulados; sem operar tabelas do hotel |
| Comparação visual autenticada com Gallaxys | NOT RUN: não há sessão de referência |
| Draw calls / GPU física / aparelhos reais | NOT MEASURED |

Cenas: vazio, paredes, piso, elevação, parado, direita/esquerda horizontal,
vertical, diagonal, curva, percurso longo, perto da parede e recorte/oclusão.
Resultados completos, estado de direção/frame/posição e imagens:
`/root/backups/habbux-isometric-world-v2/visual/`.
Ferramenta reproduzível: `tools/isometric-world-visual.mjs`; não instala navegador,
não grava usuários e testa em HTTP loopback. Reprodução contra release publicada
exige definir `HABBUX_VISUAL_BASE_URL=https://tyvo.online`.

As primeiras execuções encontraram duas expectativas inadequadas do novo teste
client e uma expectativa antiga que permitia corte de canto. Foram corrigidas,
sem remover testes. A validação de toque encontrou uma falha real de feedback,
corrigida e repetida no browser. Uma execução visual falhou com conexão recusada
quando o servidor temporário de fixtures terminou; o runner foi executado novamente
com lifecycle conjunto do servidor e todos os cenários foram concluídos.

### Performance medida

Resultados em `visual/results.json`: custo de submissão de 100 frames com 2/5/10
avatares, heap JS, quantidade real de objetos Pixi, carregamento e 60 rAFs.
Medições usam SwiftShader/Chromium headless em host compartilhado; não representam
GPU de desktop ou celular e não são promessa de capacidade. O custo CPU por frame
ficou abaixo de 1 ms no ensaio anterior à última captura; valores finais são
registrados abaixo. Não há baseline comparável de FPS para declarar ganho ou
regressão, e não se declara desempenho de hardware mobile aprovado.

## 7. Entrega, rollback e limites

Checkpoint de rollback: `isometric-world-v2-baseline-7e8fd47` e bundle Git.
Release anterior Tyvo: `/var/www/tyvo.online/.deploy/releases/20261008T030918Z`.
JAR anterior e script conferido com `bash -n`:
`/root/backups/habbux-isometric-world-v2/previous-emulator.jar` e `rollback.sh`.
O rollback reconecta a release anterior e restaura o JAR; exige aviso antes,
pois reinicia apenas Habbux. Nenhum serviço Gallaxys é tocado.

Arquivos de implementação: `avatar-direction.ts`, `avatar-movement.ts` (novo),
`avatar-animation.ts`, `avatar-view.ts`, `isometric.ts`, `room-surfaces.ts` (novo),
`room-renderer.ts`, `avatar-lab.ts`, `world-lab.ts` (novo), CSS restrito ao laboratório;
Java `RoomGridDefinition.java` e `RoomRuntime.java`. Testes: `renderer.test.ts`,
`isometric-world-v2.test.ts` (novo), `RoomModelTest.java`, `RoomMovementTest.java`.
Ferramenta e documentação novas: runner visual, auditoria, ADR 0018 e este relatório.
CMS, autenticação, HUD, chat, SSO, home, protocolo e assets não tiveram mudança funcional.

Limitações reais: protocolo sem timestamps/início/fim de caminhada; jitter superior
a um tick pode causar espera e não se inventa movimento. Sorting de mobis grandes,
texturas bitmap novas e editor de materiais estão fora do escopo. Licença individual
dos sheets antigos precisa de comprovação. Comparação visual Gallaxys, dez jogadores
humanos pela Internet e GPU física permanecem não executados.

Publicação e conferência operacional serão registradas após trocar a release.
Após entregar o relatório final, parar e aguardar validação visual da responsável.

### Resultados finais do ensaio local

| Viewport | Avatares | CPU/submissão por frame | Heap JS | Objetos Pixi |
|---|---:|---:|---:|---:|
| 1280 px / DPR 1 | 2 | 0.274 ms | 19.2 MiB | 75 |
| 1280 px / DPR 1 | 5 | 0.787 ms | 11.6 MiB | 126 |
| 1280 px / DPR 1 | 10 | 0.912 ms | 17.6 MiB | 211 |
| 390 px / DPR 2 | 2 | 1.028 ms | 17.7 MiB | 75 |
| 390 px / DPR 2 | 5 | 0.302 ms | 15.5 MiB | 126 |
| 390 px / DPR 2 | 10 | 0.568 ms | 14.0 MiB | 211 |

1280 px: 20.0 FPS observados, frame médio 50.0 ms, máximo 233.3 ms; carregamento 2212 ms. Software rendering, não hardware mobile.

390 px: 35.1 FPS observados, frame médio 28.5 ms, máximo 66.7 ms; carregamento 2874 ms. Software rendering, não hardware mobile.
