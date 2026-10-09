# Avatar/WALK — migração V5

## Migração efetiva

Converter original `tools/avatar-v5/convert.mjs` lê a AST de
`Octane-Renderer/packages/avatar/src/data/HabboAvatarAnimations.ts`, sem executar
código externo. Converte **Default frame0 e Move frames0..3, oito partes por
ação**, para o JSON nativo `apps/client/public/assets/avatar/v5/animation-profile.json`. As partes são bd,
lg, sh, ch, lh, rh, ls e rs; somente STAND/WALK atualmente usados são emitidos.
O leitor próprio `avatar-animation-profile-v5.ts` valida esse JSON separado,
carregado uma vez com limite, timeout e fallback V4. A sequência controla o
clock e a preparação do cache de frames do provider,
preservando contagens próprias de outros manifestos e fallback estático.
Nenhum leitor Nitro roda no browser nem no ticker.

A fonte é do repositório Octane Renderer, pacote GPL-3.0. Dados convertidos
mantêm GPL-3.0; fonte correspondente integral, licença e ferramenta de conversão
estão em `tools/avatar-v5/gpl-source` e disponíveis no deploy como arquivos
estáticos `/client/assets/avatar/v5/gpl-source/`. O arquivo integral de fonte serve à
reprodução/licença, não importa suas outras animações no runtime. A ferramenta
original de conversão também é GPL-3.0. Autores individuais dos dados não são
identificados separadamente; NOTICE preserva crédito ao Octane/Nitro e origem.
Não se atribui licença do renderer às imagens de terceiros.

O gate exige status AUTHORIZED, licença GPL-3.0 e hash exato da fonte aprovada:
`fb10beff5d0b4aef97301bf1dca9ed1c9ddb695ed13cd7ad1873f4caab8c45a4`.
O comando CLI usa esse recibo fixo, rejeitando uma fonte modificada; não aceita
qualquer arquivo arbitrário como autorizado apenas por calcular seu hash.

## Diferenças verificadas e limite específico

A V4 já tinha os quatro frames WALK, oito direções e offsets de STAND/WALK
corretos. Comparação dirigida dos offsets das regiões existentes contra as seis
bibliotecas correspondentes encontrou **zero divergências**. A migração torna
essas sequências dados de fonte rastreável efetivamente consumidos, sem
inventar correção visual onde não foi encontrada diferença.

A tabela Move inclui peito `ch`, mas não existem assets
`h_wlk_ch_1_2_*` em `hh_human_shirt.nitro`: o fallback ao peito STAND é preservado.
Não se cria oscilação artificial nem se desloca o apoio para simular um frame.
Os geradores próprios Gallaxys em `ferramentas-animacao` tratam FX900..904;
essas interações não são usadas por STAND/WALK Habbux e não foram adicionadas.

Diferença restante: piscar/expressões utilizam ações como `eyb` que não constam
nas regiões do manifesto Habbux. `hh_human_face.nitro` contém dados/imagens de
terceiros sem comprovação individual de direitos; `HabboAvatarActions.json`,
FigureData/FigureMap e seis `hh_human_*.nitro` no gamedata não recebem GPL por
proximidade com o repositório de código. Nenhum pixel novo, olho fechado,
expressão ou offset de nova região UNKNOWN foi extraído. A autorização do dono
foi aplicada aos próprios arquivos e ao acesso; essa pendência se refere a
recursos específicos de terceiros, não a uma segunda autorização de acesso.

## Validação e preservação

**33 PASS** nos testes direcionados: dois novos testes de conversão/gate/clock,
quatro testes do provider V4, vinte testes de apoio e sete testes WALK V8.
Cobrem fontes compartilhadas, cache imutável, preload/retry/dispose, contagens
de manifestos, oito direções/reflexão, Z/zoom/DPR, erro de apoio zero nos ensaios,
pré-anúncio, fase contínua e cadência82 ms. Fonte/hash conferidos e gate rejeita
UNKNOWN, licença inválida e alteração da fonte. Reexecução do conversor reproduz
o perfil (comparação estrutural no teste).

PNG/SVG/manifesto de sprites existentes intocados. Room Engine, modelos,
protocolo e materiais intocados por este subtrabalho. Seleção da sequência ocorre
na preparação dos frames; lookup durante render continua usando os objetos do
cache V4, sem loader nem alocação adicional por frame. Não se declara ganho de
FPS ou fidelidade artística integral. Typecheck/build completo e suíte de 188 testes do client: PASS na integração
principal. Comparação visual, performance e publicação constam do relatório. Nenhum commit/deploy/restart realizado aqui; Gallaxys permaneceu somente
em leitura.

Cinco testes adicionais exercitam loader→perfil→provider, HTTP503, UNKNOWN,
timeout da busca e do corpo em streaming, retry, cache e manifesto com três
frames. Corrigido import dinâmico avatar-manifest.ts sem extensão no Node;
o browser Vite já resolvia o caminho. Frames/sprites existentes não mudaram.
