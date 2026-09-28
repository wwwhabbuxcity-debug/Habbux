# HBX — Habbux Asset Format, especificação inicial v1

Status: **DRAFT / TBD**. Este texto define o modelo conceitual, não um formato
binário congelado. Nenhum parser ou compilador HBX é entregue no bootstrap.
Decisões físicas dependem de protótipos, fixtures e medições antes da adoção.

HBX é o formato nativo futuro. SWF e Nitro são entradas offline; o Client não
precisa interpretar esses formatos em runtime. A fonte normativa desta proposta
é este documento; `asset-engine/hbx-spec` aponta para ele.

## Identidade e envelope

| Elemento | Definição conceitual | Situação |
|---|---|---|
| Magic | Assinatura que distingue o container HBX de outro arquivo | Bytes e posição: TBD |
| Version | Major/minor do formato e conjunto de recursos requerido | Codificação física: TBD |
| Manifest | Índice de assets, dependências, recursos e hashes | Schema e encoding: TBD |
| Asset ID | Identificador estável e namespaced independente do nome do arquivo | Gramática/tamanho: TBD |
| Asset type | Categoria explícita, como furniture, avatar ou effect | Registro de tipos: TBD |
| Metadata | Origem autorizada, ferramentas, versão e propriedades descritivas | Campos obrigatórios: TBD |

Asset ID identifica a entidade lógica; versão/hash identifica uma revisão de
conteúdo. IDs de outros formatos são metadados de origem, não autoridade para
criar IDs Habbux. Nomes e paths internos não podem escapar do pacote ou apontar
para arquivos arbitrários do dispositivo.

## Modelo visual

| Seção | Informação necessária |
|---|---|
| Geometry | Dimensões lógicas, origem, pontos de ancoragem, bounds e informação de ocupação quando aplicável |
| Layers | IDs locais, ordem, relação entre camadas, visibilidade e transformação suportada |
| Directions | Direções suportadas e associação explícita a representações/frames |
| States | Estados visuais nomeados e estado inicial permitido |
| Animations | Sequências de frames, duração, repetição e referências por estado/direção/camada |
| Texture references | Identificador da textura, região, tamanho original, trim e pivot |
| Atlas references | Identificador do atlas, dimensões, formato, recursos e hash |

Unidades de geometria/tempo, sistema de coordenadas, orientação de eixos, precisão,
enum de direções e regras de interpolação são **TBD**. Precisam ser definidos uma
única vez no schema intermediário e convertidos pelo normalizer. Não presumir que
dois formatos importados usem a mesma unidade ou convenção.

Animação descreve apresentação, nunca código executável nem regra econômica/de
gameplay. HBX não contém scripts SWF/JavaScript executáveis. Referências devem
existir, ter tipo compatível e respeitar limites; ciclos só serão permitidos onde
a semântica for explicitamente definida.

## Texturas e atlases

O atlas builder produz regiões com padding e tratamento de bordas definidos para
evitar vazamento visual. Rotação de sprites, trim e múltiplas resoluções precisam
de suporte explícito no contrato. Tamanho máximo e quantidade de atlases serão
determinados por dispositivos e medições, não pela capacidade da máquina de build.

Formatos de textura, uso de compressão de GPU, fallback e carregamento por faixas
de qualidade: **TBD**. A escolha deverá considerar decodificação, upload, memória,
qualidade e suporte dos dispositivos alvo. Não obrigar o dispositivo fraco a
carregar todas as variantes para escolher uma.

## Integridade e autenticidade

Proposta inicial: SHA-256 como hash maduro de integridade dos blobs de conteúdo.
O manifest referencia hashes; não inclui seu próprio hash dentro do conjunto de
bytes que o define. Hash do container/manifest, quando necessário, fica em índice
externo ou envelope com regra de exclusão/canonicalização explícita.

Algoritmo e escopo exatos do hash canônico serão confirmados no formato físico.
Validar bytes antes de decodificar recursos caros. Hash sem origem confiável não
garante autenticidade: publicação, TLS e eventual assinatura têm modelo separado.
Assinatura digital é **TBD**; nenhum algoritmo criptográfico próprio será criado.

## Compressão e limites

Usar tecnologias maduras. Codec de container, compressão por seção versus pacote
inteiro, nível e estratégia de transporte são **TBD**, com benchmark de tamanho,
CPU, acesso aleatório e tempo de carga. Evitar recomprimir automaticamente texturas
já comprimidas sem benefício medido.

O envelope deverá declarar tamanhos comprimidos e expandidos, e o leitor aplicará
limites antes e durante a expansão. Limitar bytes totais, recursos, dimensões,
frames, layers, referências, profundidade e custo. Valor declarado no arquivo não
autoriza alocação ilimitada. Limites concretos pertencem ao contrato futuro.

## Compatibilidade

Major incompatível é rejeitada claramente. Minor nova só é compatível quando os
campos adicionados forem opcionais e seus defaults/semântica estiverem definidos.
Campos desconhecidos não podem ser ignorados se mudam interpretação obrigatória.
Uma lista explícita de recursos requeridos permite rejeitar pacote não suportado.

Publicações são imutáveis por versão/hash. Alteração de conteúdo gera nova revisão;
não substituir arquivo mantendo referência que promete os mesmos bytes. O Client
terá política de cache e descarte por versão; migração de assets ocorre offline.

## Critérios para fechar v1

1. Aprovar schema mínimo com IDs, unidades, limites, defaults e validação.
2. Produzir fixtures sintéticas, sem assets proprietários, para caso mínimo,
   múltiplas direções/camadas, animação, referências inválidas e corrupção.
3. Implementar um leitor e um escritor pequenos e testar vetores canônicos.
4. Medir arquivo, parse, decode, upload GPU e memória em desktop/mobile reais.
5. Validar determinismo e documentar decisões restantes em ADR antes de congelar
   magic, offsets, encoding e compatibilidade binária.
