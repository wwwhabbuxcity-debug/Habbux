# Habbux Avatar Engine v1

## Contrato visual

O manifest normalizado descreve seis sheets, 11 partes (`bd`, `hd`, `lg`, `sh`,
`ch`, `ls`, `rs`, `hrb`, `hr`, `fc`, `ey`), ordem de layers, regiões, offsets,
ações `std`/`wlk`, oito direções e até quatro frames de caminhada. Cada região é
validada contra as dimensões do sheet antes de entrar no renderer.

As seis imagens publicadas são os PNGs mínimos preparados durante a auditoria:
body, face, leg, shirt, shoe e hair. Previews de pesquisa e arquivos de `/tmp`
não são dependências de produção.

## Direções

O Core v1 transmite apenas `(x, y, z=0)`, sem aparência ou direção. A direção é
derivada do delta do movimento e mantém a direção anterior quando não há delta:

```text
0 NE · 1 E · 2 SE · 3 S · 4 SW · 5 W · 6 NW · 7 N
```

O manifest registra que as direções 4, 5 e 6 usam os frames de 2, 1 e 0 com
espelhamento horizontal. Essa regra é consumida pelo provider, não duplicada no
compositor.

## Aparência e fallback

Como o protocolo não possui aparência, o gênero inicial é escolhido de maneira
determinística a partir do `userId`. Isso evita que o avatar troque de aparência
entre snapshots e deixa a escolha pronta para ser substituída por dados reais.

Quando um frame opcional não existe no atlas atual, o manifest normalizado aponta
para um frame fallback validado. A informação fica registrada em `sourceFallback`
para auditoria e não esconde falhas de regiões obrigatórias.

## Movimento e animação

Cada avatar separa posição lógica da posição renderizada. Um passo adjacente é
interpolado por 260 ms; saltos, teleporte implícito ou mudança não adjacente são
ajustados diretamente. `AvatarAnimationController` alterna `std`/`wlk` e avança
frames usando o `deltaMS` de um único ticker Pixi. Não há `setInterval`,
`setTimeout` ou loop próprio por avatar.

Offsets são aplicados a partir do ponto de registro do tile, com o sprite ancorado
na base e espelhamento no eixo X. A ordenação dos avatars usa profundidade
isométrica para permitir múltiplos ocupantes em movimento.

## Limites v1

- aparência real ainda não vem do protocolo;
- não há furniture, catálogo, pathfinding ou altura dinâmica;
- a camada DOM de chat é a fonte acessível e persistente; o bubble Pixi é uma
  representação visual temporária;
- testes de navegador e screenshot não foram executados nesta máquina: resultado
  `UNVERIFIED`, não `PASS`.
