# Contratos versionados

Lugar de contratos de API, manifestos e configurações que realmente precisem ser
compartilhados. Não há pacote de runtime nesta etapa. Cada contrato futuro terá
versão, campos obrigatórios, limites, exemplos positivos/negativos e política de
compatibilidade. JSON Schema é opção para documentos JSON de baixa frequência;
não determina o codec binário de gameplay.

Schemas de payload do protocolo serão associados ao registro único em
`packages/protocol`; não manter aqui uma segunda lista de IDs. Mudanças passam
por revisão de compatibilidade e testes com a versão anterior suportada.
