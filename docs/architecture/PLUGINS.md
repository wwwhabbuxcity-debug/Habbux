# Plugins futuros

Status: requisitos; nenhum sistema de plugins implementado.

Plugins terão API pública estável e versionada, permissões explícitas, lifecycle
definido e limites de uso. Não recebem por padrão instâncias internas de quarto,
Netty channel, datasource, configuração completa, tokens ou acesso arbitrário a
objetos do Emulator. Ações atravessam os mesmos contratos de autorização e
invariantes usados pela aplicação.

Cada extensão declara versão de API, capabilities necessárias e identificação
para auditoria. Compatibilidade é validada antes de carregar; mudança incompatível
exige versão nova e política de migração. Não transformar pacote interno em API
pública porque uma extensão precisa chamar um método ocasionalmente.

Callbacks não podem bloquear o event loop ou o proprietário do quarto. Trabalho
tem limite de tempo/custo, filas limitadas, métricas e política de desativação em
falhas repetidas. Remoção exige cancelar tarefas e liberar listeners/recursos.
Hot reload não é requisito deste bootstrap.

Código Java arbitrário dentro do mesmo processo não é uma fronteira de segurança
forte. API restrita e classloader não tornam plugin não confiável seguro. A futura
política deverá restringir execução a extensões revisadas/confiáveis ou escolher
isolamento externo com permissões e custos explícitos. O mecanismo exato é **TBD**.

Plugins não podem alterar saldo ou inventário fora do fluxo transacional auditado,
nem contornar rate limits e autorização. Código e licença de cada extensão precisam
de origem conhecida; não reutilizar APIs ou internals legados de outros projetos.
