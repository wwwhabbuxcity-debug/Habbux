# Habbux Asset Engine

Este diretório registra o pipeline futuro; ainda não há conversores, compiler,
schemas intermediários ou assets importados. As etapas permanecem conceitos no
documento central até surgir uma implementação que justifique módulos reais.

```text
SWF / Nitro → Importer → Normalizer → Validator → Atlas Builder → HBX Compiler → HBX
```

SWF/Nitro são entradas offline e HBX é o formato nativo de saída planejado; o
Client não interpreta os formatos de entrada em runtime. Contratos intermediários
serão versionados antes do primeiro importer. Não duplicar schemas por etapa.

Referências: [pipeline](../docs/architecture/ASSET-PIPELINE.md),
[especificação HBX](../docs/hbx/HBX-SPEC-v1.md),
[registro de terceiros](../THIRD_PARTY.md).
