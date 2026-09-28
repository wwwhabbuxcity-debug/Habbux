# Emulator

## Estado atual

O processo Java 25 abre um listener WebSocket Netty para o Core v1, administra
sessões anônimas ou autenticadas e encerra canais/event loops no shutdown. Login,
cadastro e logout usam o Auth Core com PostgreSQL opcional. Quartos,
inventário e economia não estão implementados. O projeto usa Maven Wrapper 3.9.x;
versões efetivas de dependências e plugins ficam nos arquivos de build.

## Limites planejados

| Grupo | Áreas | Responsabilidade |
|---|---|---|
| Inicialização | `bootstrap`, `config` | Composição, configuração externa validada e ciclo de vida |
| Transporte | `network`, `protocol` | Netty, framing, limites e tradução de mensagens |
| Identidade | `auth`, `session`, `user`, `permission` | Identidade autenticada, sessão, perfil e autorização |
| Espaços | `room`, `navigator` | Estado de cada quarto e descoberta de espaços |
| Comércio | `catalog`, `inventory`, `economy` | Oferta, propriedade e operações transacionais |
| Mundo visual | `furniture`, `avatar` | Regras autoritativas; sem renderização no servidor |
| Social | `messenger`, `group` | Relações e comunicação autorizada |
| Automação | `pet`, `bot`, `wired`, `achievement` | Comportamentos e progressos, futuramente |
| Operação | `moderation`, `command`, `plugin` | Administração auditada e extensões por API |
| Adaptadores | `persistence`, `cache`, `metrics` | Acesso externo e observabilidade |
| Base | `common` | Tipos pequenos realmente compartilhados; sem depósito de lógica |

Esses nomes delimitam responsabilidade; não exigem classes vazias nem módulos de
build por domínio. Cada implementação futura precisa de caso de uso e teste.

## Ciclo de vida do processo

1. Ler configuração do ambiente e validar limites antes de abrir a porta.
2. Criar event loops boss/worker, pipeline HTTP/WebSocket e iniciar o listener.
   O listener não depende de PostgreSQL nem Redis; login/cadastro precisam do
   PostgreSQL opcional e retornam indisponível sem ele.
3. No shutdown, fechar a porta de entrada, fechar sessões, conferir contadores e
   desligar event loops dentro do prazo configurado.

`development`, `test` e `production` são ambientes explícitos. Hostnames, portas,
senhas, endpoints e secrets não são embutidos no binário. A referência de
variáveis fica na configuração raiz; a aplicação valida tipos e faixas. O bind
default é loopback e WSS exige proxy de borda configurado separadamente.

## Execução e dependências

Event loops de rede cuidam de I/O não bloqueante e trabalho curto. Auth usa
executor limitado separado para hash e JDBC; futuros domínios persistentes devem
seguir o mesmo limite. Usar Java 25 não implica uma thread virtual por evento ou quarto.
O modelo precisa ser medido antes de acrescentar concorrência.

Netty é a base de networking aprovada. Não adicionar Spring Boot, ORM, pool,
driver PostgreSQL ou cliente Redis sem uso concreto no incremento correspondente.
Executar Java e Maven com as versões fixadas; ver [ADR de build](../adr/0011-maven.md).

## Contratos de evolução

Erros são classificados no [modelo de erros](ERROR-MODEL.md). Logs não incluem
payloads, tokens ou dados pessoais por padrão. Os domínios devem ser testáveis com
relógio, fonte de IDs e persistência substituíveis, sem inicializar o servidor.
