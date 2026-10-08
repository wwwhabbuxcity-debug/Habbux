# ADR 0018 — Superfícies isométricas e continuidade temporal

Status: implementado; validação estética final depende da responsável.

O atlas usa direções de tela, enquanto o servidor envia coordenadas de grid.
A projeção e o mapeamento de direções precisam concordar. Corrigimos um setor
de diferença sem trocar sprites, projeção ou velocidade.

Manter BFS autoritativo limitado, tick 100 ms, cardinal 500 ms e diagonal 707 ms.
Acumular prazos do servidor evita arredondar 707 para 800 a cada passo.
`AvatarMovementController` recebe somente passos autorizados, conserva sobra
de frame e utiliza fila circular de até 256 segmentos. Um tick inicial de
buffer absorve a quantização. Não aplicar curvas que saiam do caminho.
No overflow ou correção não adjacente, limpar a fila e aplicar a posição recebida.

Piso, parede, câmera, hover e avatar usam `isometric.ts`. `room-surfaces.ts`
produz faces estáticas e materiais procedurais próprios. Piso elevado e paredes
participam da mesma ordenação das entidades. Configuração de material fica fora
do protocolo e da UI; não existe editor de quarto nesta etapa.

Diagonais exigem ambos os cantos livres e altura compatível. A política antiga
que aceitava um canto bloqueado não combina com paredes sólidas. Validar também
ocupação no instante do passo; colisão dinâmica encerra o caminho, preservando
as mensagens de falha existentes.

Consequências: 100 ms adicionais de latência visual inicial, ausência de
predição, um objeto gráfico por segmento de parede/piso elevado, necessidade de
estender sorting para futuros mobis com footprint grande. Sem timestamp/início
ou término no protocolo, jitter maior que o buffer pode produzir uma parada;
não há mecanismo legítimo para inventar o próximo passo.

Nenhuma dependência, arquivo ou asset de Gallaxys foi incorporado. Assets de
avatar pré-existentes permanecem intactos e sua comprovação individual de licença
continua pendente, conforme a auditoria V2.
