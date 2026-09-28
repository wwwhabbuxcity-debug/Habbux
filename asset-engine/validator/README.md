# Validator

Responsabilidade futura: validar schema, limites, referências, integridade e
invariantes visuais da representação normalizada. Produzir erros/avisos com código,
caminho do campo e origem, sem depender de texto livre para automação.

Sem implementação. Validação não deve executar código importado nem aceitar dado
inconsistente para “consertar no Client”. Fixtures válidas e inválidas serão
compartilhadas com compiler e reader. Ver [pipeline](../README.md).
