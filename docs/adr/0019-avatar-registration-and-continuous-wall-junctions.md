# ADR 0019 — Registro contínuo do avatar e junções de paredes

Status: aceito. Data: 2026-10-08.

## Contexto

O ponto do avatar era arredondado em pixels CSS. No teste mobile, dez das
19 transições amostradas repetiam posição. O manifesto feminino usava uma
anatomia incompleta no STAND, e caps de paredes em recortes não compartilhavam
os dois extremos. A auditoria e evidências estão no
[relatório Gallaxys Parity V1](../gallaxys-parity-v1/report.md).

## Decisão

Manter projeção e cadência existentes, com posição fracionária do Container
comum e atlas nearest. Reutilizar somente anatomia/seleções completas já presentes
no Habbux, preservando o registro do frame realmente selecionado. Detalhes
opcionais de outro setor não devem aparecer em lugar da orientação ausente.

Construir junções das paredes uma vez por geometria, com vértice externo comum,
altura do topo `maxZ + wallHeight` e faces de término só em extremos abertos.
Manter painéis separados na ordenação de profundidade. Piso recebe juntas de
material espaçadas; detalhe vetorial reduzido no zoom pequeno. O piso plano usa
cache Pixi em textura na resolução DPR vigente, invalidado apenas em mudança de
geometria/resize. Piso elevado e hover continuam separados para profundidade e
interação; o cache é desativado na remoção da sala.

## Consequências

Nenhum novo asset, pacote, protocolo, serviço ou restart. A linha do topo das
paredes permanece coerente em modelos elevados. A posição é contínua, embora a
rasterização final continue limitada ao display e à escala. Aparência completa,
timestamps de movimento e paridade visual pareada são pendências distintas;
os resultados medidos em SwiftShader não garantem FPS em hardware real.
