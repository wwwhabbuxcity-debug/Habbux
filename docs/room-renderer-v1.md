# Habbux Room Renderer v1

## Escopo

O renderer v1 transforma o `RoomState` já transmitido pelo Core em uma cena Pixi
isométrica. Ele não conhece catálogo, furniture, CMS ou regras de pathfinding. O
servidor continua sendo a autoridade de posição: o client apenas interpola a
transição entre posições recebidas.

## Camadas

`RoomRenderer` mantém uma única `Application` Pixi com três camadas explícitas:

- `floor-layer`: polígonos estáticos dos tiles e sua walkability;
- `entity-layer`: avatars ordenados por profundidade isométrica;
- `debug-layer`: linhas/diagnóstico da cena.

O piso só é reconstruído quando dimensões, walkability ou câmera mudam. Um evento
de posição apenas reconcilia os avatars existentes.

## Projeção e câmera

Para tile `(x, y)` e elevação `z`, a projeção usa:

```text
screen.x = origin.x + (x - y) * tileWidth * scale / 2
screen.y = origin.y + (x + y) * tileHeight * scale / 2 - z * elevationHeight * scale
```

Os valores v1 são tile 64×32 e elevação 16. `screenToRoom` é usado para entrada
de mouse, pointer e toque; o destino é arredondado para um tile e validado contra
a walkability recebida.

A câmera recalcula escala e origem em cada resize para manter o quarto visível em
viewport desktop ou estreito. A entrada é escopada ao canvas do renderer; os
controles DOM continuam fora dele. O grid DOM antigo permanece como fallback de
diagnóstico quando o canvas não pode ser montado.

## Assets e extensibilidade

O client carrega apenas `public/assets/avatar/v1/manifest/avatar-manifest-v1.json`
e os seis PNGs mínimos publicados no repositório. O provider carrega cada sheet
uma vez, cria texturas recortadas por região e mantém cache por região. Não existe
dependência de `/tmp` em runtime.

`AvatarAssetProvider` é a fronteira deliberada para uma futura fonte HBX. A cena
recebe frames e offsets normalizados, não nomes ou formatos específicos dos atlas
atuais.

## Entrada e chat

O callback de tile chama o `CoreConnection.moveRoom` existente. Falhas continuam
indo para o status de quarto já usado pela UI. Mensagens do Core permanecem no log
DOM; quando o `userId` existe na cena, a última mensagem também recebe um bubble
Pixi ancorado no avatar. A expiração usa o ticker compartilhado, sem um timer por
mensagem ou avatar.

## Verificação

Os testes puros cobrem projeção, inversa, geometria, manifest, direção, espelhamento,
interpolação e reconciliação de entidades. A validação visual em navegador fica
`UNVERIFIED` nesta máquina porque não há Chromium, Chrome, Firefox ou Playwright
instalado; portanto não há métrica visual inventada neste ciclo.
