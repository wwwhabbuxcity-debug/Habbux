# Pipeline de assets

**SWF/Nitro são INPUT. HBX é o OUTPUT nativo futuro.** Nesta etapa não há
conversores, assets importados nem compilador completo.

```text
SWF / Nitro → Importer → Normalizer → Validator → Atlas Builder → HBX Compiler → HBX → Client
```

| Módulo | Entrada | Saída/responsabilidade futura |
|---|---|---|
| `importer-swf` | SWF autorizado | Extração offline para representação intermediária; não executar scripts |
| `importer-nitro` | Arquivo Nitro autorizado | Extração offline para a mesma representação intermediária |
| `normalizer` | Extração de qualquer importer | Coordenadas, nomes, direções, tempo e referências canônicos |
| `validator` | Representação normalizada | Diagnósticos reproduzíveis e rejeição de dados inválidos |
| `atlas-builder` | Texturas validadas | Atlases, retângulos, padding e referências estáveis |
| `compiler` | Modelo validado + atlases | Pacote HBX versionado e verificável |
| `hbx-spec` | Contrato HBX | Referência à especificação; não outra definição concorrente |

Os contratos da representação intermediária e o formato físico HBX ainda são
**TBD**. Antes de implementar importadores, versionar um schema pequeno, fixtures
sintéticas autorizadas e critérios de compatibilidade. A especificação canônica
fica em [HBX-SPEC-v1](../hbx/HBX-SPEC-v1.md).

## Reprodutibilidade

Mesma entrada, configuração e versão de ferramenta devem produzir a mesma saída
quando possível. Ordenar listas, normalizar tempos e evitar timestamp/paths locais
no conteúdo compilado. Cache de build é identificado por hash da entrada,
configuração e versão de todas as etapas relevantes.

O relatório de compilação inclui origem permitida, hashes, versão de ferramentas,
avisos e dependências. Não afirmar determinismo binário antes de testar codecs e
empacotamento; divergências precisam ser detectadas e explicadas.

## Limites e confiança

Importação é trabalho offline de entrada não confiável. Limitar bytes comprimidos
e expandidos, dimensões, frames, profundidade, tempo e memória. Rejeitar path
traversal, links simbólicos, referências externas arbitrárias e bombas de
descompressão. Nenhum arquivo importado pode executar código no build ou no Client.

O Client carrega apenas formatos HBX suportados e verifica contrato/limites antes
de reservar recursos gráficos. Assets publicados são imutáveis e endereçados por
versão/hash; manifest não deve apontar silenciosamente para conteúdo substituído.

Nenhum asset Habbo, SWF, Nitro ou código proprietário de terceiros faz parte do
bootstrap. Origem e licença precisam estar registradas antes de uma futura entrada.
