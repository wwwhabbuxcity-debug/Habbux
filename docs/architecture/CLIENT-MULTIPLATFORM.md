# Client multiplataforma

**ONE CLIENT CODEBASE: desktop + tablet + mobile.**

Layout, entrada e qualidade gráfica são adaptativos dentro de `apps/client`.
Não criar três projetos nem decidir recursos só por user-agent.

## Entrada

Mouse, teclado e touch produzem intenções de alto nível. Uma ação de jogo não
depende diretamente de `click` ou `touchstart`. Pointer events permitem compartilhar
o caminho de entrada, preservando tratamento de cancelamento, captura e múltiplos
ponteiros. Funcionalidade essencial não pode depender apenas de hover.

Pinch-to-zoom terá limites e âncora de câmera definidos, sem enviar zoom local
como alteração de estado do quarto. Gestos competem explicitamente com drag,
scroll e seleção. Foco de formulários, teclado virtual e atalhos precisam de
regras para evitar que digitar no chat acione o jogo.

## Viewport, orientação e acessibilidade

Reagir a resize, portrait/landscape, safe areas e mudanças no viewport causadas
pelo teclado virtual. A área lógica da cena é separada da resolução do canvas.
Conversão de coordenadas passa por câmera/viewport, evitando inconsistência entre
ponteiro, DPR e zoom. Não recarregar o jogo só para mudar orientação.

Layouts se adaptam ao espaço disponível. Elementos essenciais possuem alternativa
com teclado, foco visível e apresentação acessível quando forem implementados.
Redução de animação e limites de flashing devem ser considerados desde o design.

## DPR, GPU e memória

DPR do dispositivo é entrada para uma política de qualidade, não ordem para
alocar sempre a maior textura/canvas possível. Limitar resolução de renderização
e tamanho de assets por perfil configurável após medição. Respeitar limites de
textura, memória estimada, fill rate e número de efeitos simultâneos.

Prever redução de efeitos e frequência visual para dispositivos fracos, sem
alterar regras de gameplay. Mudanças de qualidade precisam de estabilidade e
histerese para evitar oscilações. Em aba oculta, suspender renderização inútil e
reconciliar estado ao retornar conforme contrato de sessão futuro.

## Matriz de validação futura

| Dimensão | Cobertura |
|---|---|
| Entrada | Mouse + teclado; touch; troca entre entradas |
| Orientação | Portrait, landscape e rotação durante interação |
| Viewport | Pequeno, médio, amplo; resize e teclado virtual |
| DPR | Baixo, alto, zoom do navegador e mudança de tela |
| Hardware | GPU integrada, mobile limitado e perda de contexto |
| Rede/ciclo de vida | Latência, perda, background, retomada e reconnect |
| Acessibilidade | Foco, navegação por teclado, textos ampliados e movimento reduzido |

Lista de navegadores/versões suportados e metas de memória/frame time: **TBD**
após testes em dispositivos reais. Não declarar compatibilidade total com base em
um build bem-sucedido ou numa única captura de tela desktop.
