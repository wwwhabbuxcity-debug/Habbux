# Room Renderer + Avatar Engine v1 — auditoria

Data: 2026-09-30. Auditoria feita antes da implementação, com a árvore limpa em
`2d4a539`.

## Estado encontrado

- `apps/client` já possui TypeScript estrito, PixiJS 8, bootstrap de conexão,
  Auth Core, Room Core, UI Core e separação DOM/Pixi.
- `RoomState` fornece dimensões, walkability e ocupantes com `userId`, username
  e coordenadas. O `CoreConnection` expõe `ROOM_SNAPSHOT`, `ROOM_USER_JOIN`,
  `ROOM_USER_LEAVE` e `ROOM_USER_POSITION` por snapshots imutáveis.
- O protocolo de movimento transmite destino e depois passos autoritativos
  (`x`, `y`, `z=0`); não transmite aparência nem direção visual. A direção será
  derivada do delta entre passos, sem criar um segundo pathfinder.
- O Pixi existente só desenha uma forma técnica no `preview.ts`; não há room
  renderer, câmera, adapter ou avatar view.

## Research validado

- Seis sheets foram conferidos como PNG RGBA: body 564×612, face 376×152, leg
  776×292, shirt 1895×422, shoe 650×292 e hair 3065×522.
- Há 32 previews (`male/female × stand/walk × 8 direções`), todos 180×260.
- O manifesto `habbux_avatar_engine_v1_manifest.json` declara 11 partes mínimas
  (`bd`, `hd`, `lg`, `sh`, `ch`, `ls`, `rs`, `hrb`, `hr`, `fc`, `ey`), ações
  `std`/`wlk`, 1/4 frames, offsets e fontes de atlas.
- As direções 4, 5 e 6 reutilizam regiões de 2, 1 e 0 com flip horizontal; o
  manifesto é a fonte dessa regra, não uma convenção inventada pelo renderer.
- As regiões reais foram conferidas nos metadados de spritesheet dos seis JSONs
  de origem e serão reduzidas a um manifesto Habbux normalizado versionado.

## Integração necessária

1. Adaptar `RoomState` para uma cena Pixi estática: floor, entity e debug layers.
2. Centralizar projeção isométrica, câmera e hit testing de tiles.
3. Carregar sheets uma vez por provider e criar texturas de região uma vez por
   asset; sprites de avatar serão reutilizados durante a animação.
4. Manter posição lógica autoritativa separada da posição visual interpolada.
5. Montar o mesmo `AvatarView` para usuário local e remotos, com aparência
   determinística enquanto o protocolo não possui appearance.

## Riscos e decisões

- Sem browser disponível no host, a composição final e a comparação com previews
  ficarão `UNVERIFIED` até validação visual real; nenhum PASS visual será
  declarado por teste estático.
- O material de pesquisa tem referências de origem Nitro, mas somente PNGs e
  metadados normalizados serão incorporados. Nenhum renderer ou código externo
  será copiado.
- O provider terá uma fronteira de dados (`AvatarAssetProvider`) para permitir
  trocar PNG + JSON por HBX no futuro sem reescrever `AvatarRenderer`.
- O renderer não iniciará Furniture, catálogo, CMS, Admin ou editor de avatar.
