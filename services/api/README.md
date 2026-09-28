# API futura

Limite reservado para necessidades Web/API; sem runtime, servidor HTTP ou
framework adicionado nesta fundação. Não criar microserviço antes de existir um
caso de uso que exija essa separação.

A Web acessará contratos autenticados e versionados. Não compartilha diretamente
memória, objetos mutáveis ou internals do Emulator. Contratos de entrada/saída
ficarão em `packages/schemas` quando existirem; mensagens de gameplay continuam
pertencendo a `packages/protocol`.

Antes do primeiro endpoint, definir autorização por recurso, validação, códigos
de erro, limites, timeout, idempotência quando necessária e métricas. Decidir se
HTTP cabe como adaptador no mesmo processo ou se operação/carga justificam
runtime separado. Framework e porta de produção: **TBD**; configuração será
externa, com referência de variáveis centralizada na raiz.

Endpoints não devem alterar saldo ou inventário fora do domínio transacional.
Aplicar o [modelo de erros](../../docs/architecture/ERROR-MODEL.md) e a
[baseline de segurança](../../docs/security/SECURITY-BASELINE.md).
