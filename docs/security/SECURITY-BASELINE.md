# Baseline de segurança

Status: requisitos da fundação e das próximas implementações. Um item documentado
não significa controle implementado ou auditado em produção.

## Confiança e entrada

O servidor é autoritativo: nunca confiar no Client para preço, saldo, propriedade,
posição permitida, identidade ou permissão. Validar frame e tamanho antes de
alocação, depois campos, contexto, autenticação e autorização. Limitar fragmentação,
compressão, strings, listas, profundidade e complexidade das operações.

Handshake de protocolo não autentica usuário. Autenticação futura precisa de
credenciais protegidas, expiração, revogação e tratamento de tentativas repetidas.
Autorização ocorre por ação e recurso, inclusive mensagens válidas vindas de
usuário autenticado. Não colocar tokens em URL ou em logs.

## Transporte e abuso

Usar TLS para tráfego público. Upgrade WebSocket verifica origem segundo allowlist
explícita; Origin não substitui autenticação. API que usa cookies deve definir
proteção CSRF e atributos de cookie apropriados ao seu fluxo. Não habilitar CORS
amplo com credenciais por conveniência.

Aplicar limites globais, por origem e por identidade conforme custo: conexões,
handshakes, mensagens, bytes e operações caras. Definir políticas de timeout e
backpressure. Resposta a frame malformado não ecoa payload ou stack trace;
registrar código sanitizado com proteção contra tempestade de logs.

TLS não impede replay de ação legítima reenviada. Operações econômicas precisam
de chave de idempotência persistida e vinculada ao usuário/conteúdo. Sequências
locais de conexão não substituem isso após reconnect. Usar algoritmos e bibliotecas
criptográficas maduros, sem criptografia própria.

## Secrets e configuração

Nenhuma senha, token ou chave entra no Git. `.env.example` só contém nomes e
valores fictícios/seguros. Arquivos reais de ambiente, PEM/KEY, credentials e
secrets ficam ignorados e com permissões restritas. Configuração entregue ao
navegador é pública, mesmo que venha de uma variável de ambiente.

Secrets de CI ficam no mecanismo de secrets do provedor; não passam em comandos
que os imprimam. Produção deve receber valores por canal restrito e identidade
com menor privilégio. Se houver vazamento, revogar/rotacionar; apagar o arquivo
do último commit não remove o segredo do histórico.

## Persistência e auditoria

SQL é parametrizado. Conta de aplicação não precisa administrar outros bancos.
Usuários, serviços e dados de outros projetos permanecem isolados. Migrações e
backups têm privilégios próprios e plano de restauração verificado.

Ações administrativas registram ator, alvo, ação, resultado e correlação.
Economia registra operação idempotente e alteração durável de saldo/posse na mesma
unidade de consistência. Restringir acesso aos registros e definir retenção antes
de operar dados reais. Não registrar credenciais nem chat por padrão.

## Supply chain, assets e extensões

Dependências precisam de versão fixa/resolução reproduzível, origem, licença e
revisão de atualizações. Atualizações major exigem decisão explícita e validação;
alerta automatizado não aprova deploy. Registrar terceiros em `THIRD_PARTY.md`.

Importadores processam entradas não confiáveis offline, com limites de expansão,
tempo, memória e caminhos. Nunca executar scripts SWF. Não adicionar assets ou
código proprietário ao bootstrap. Hash de integridade detecta alteração, mas não
prova quem publicou o conteúdo.

Plugins não recebem internals irrestritos; código arbitrário no processo exige
confiança ou isolamento adicional. Ver [política futura](../architecture/PLUGINS.md).

## Validação futura

Cobrir frames truncados e superdimensionados, limites de taxa, autorização cruzada,
token expirado, replay econômico, concorrência e saída de erros sem dados internos.
Testar apenas ambientes próprios isolados. Não executar scans/carga contra sites
vizinhos nem usar ausência de incidente como evidência de segurança.
