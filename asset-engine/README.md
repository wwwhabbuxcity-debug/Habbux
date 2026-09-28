# Asset Engine

Módulos preparados por responsabilidade; não há conversores nem compiler
implementados. Nenhum asset externo foi adicionado.

```text
SWF / Nitro → Importer → Normalizer → Validator → Atlas Builder → HBX Compiler → HBX
```

SWF/Nitro são **INPUT**. HBX é **OUTPUT NATIVO**. Importação acontece offline;
o Client não interpreta SWF/Nitro em runtime.

Os módulos só recebem runtime/dependências quando um incremento demonstrar
necessidade. Contratos da representação intermediária serão versionados antes do
primeiro importer. Não duplicar schemas em cada etapa.

Referências: [pipeline](../docs/architecture/ASSET-PIPELINE.md),
[especificação HBX](../docs/hbx/HBX-SPEC-v1.md),
[registro de terceiros](../THIRD_PARTY.md).
