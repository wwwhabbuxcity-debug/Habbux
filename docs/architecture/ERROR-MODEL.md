# Modelo de erros

Categorias são internas à arquitetura; códigos transmitidos e motivos de
desconexão pertencem ao [Habbux Protocol](../protocol/HABBUX-PROTOCOL-v1.md).
Não criar enums de wire independentes no Client e no Emulator.

| Categoria | Exemplo | Comportamento futuro |
|---|---|---|
| Protocol error | Frame truncado, versão incompatível, flags desconhecidas | Rejeitar conforme contrato; encerrar conexão quando sua integridade é inválida |
| Validation error | Campo fora da faixa permitida | Rejeitar comando sem alterar estado; contabilizar abuso |
| Authentication error | Identidade ausente, token expirado | Não admitir operação autenticada; informar falha sem revelar credencial |
| Authorization error | Identidade sem permissão para ação | Negar operação e auditar tentativas relevantes |
| Domain error | Fundos insuficientes ou item indisponível | Resposta de negócio estável; estado permanece consistente |
| Infrastructure error | Timeout de banco ou saturação do pool | Falhar de modo controlado; retry apenas se seguro e limitado |
| Internal error | Invariante violada ou falha inesperada | Código genérico externo, correlação e diagnóstico interno restrito |

## Contrato interno

Uma falha identificável contém categoria, código estável, mensagem interna
sanitizada e correlação opcional. Informações de retry são controladas pelo
servidor; não basta classificar toda falha de infraestrutura como repetível.
Timeout depois de uma compra pode significar commit concluído, exigindo consulta
idempotente do resultado.

O Client recebe apenas campos explicitamente definidos pelo contrato público.
Nunca recebe stack trace, SQL, nomes de tabelas privadas, caminhos do servidor,
credenciais ou texto de exceção arbitrário. Mensagens traduzidas da interface
não são identificadores de erro. Nesta etapa não existe envelope genérico de
erro de gameplay implementado; defini-lo no protocolo quando houver mensagem real.

## Responsabilidade e efeitos

O adaptador reconhece falhas externas, o domínio decide erros de negócio e o
limite de atendimento converte o resultado em resposta/encerramento. Evitar
registrar a mesma exceção em todas as camadas. Erro esperado de domínio não exige
stack trace em nível ERROR.

Falha em um comando não permite mutação parcial invisível. Transações fazem
rollback; ações em memória precisam validar antes de alterar ou definir recuperação.
Uma falha inesperada no proprietário de um quarto não deve permitir que outro
worker continue usando estado cuja integridade é desconhecida.

Contadores usam códigos conhecidos, sem cardinalidade por mensagem textual.
Falhas de validação e protocolo possuem rate limits de resposta/log para evitar
amplificação. Testes verificam tanto o código retornado quanto ausência de efeitos
indevidos e de vazamento de informação.
