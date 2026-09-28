# Emulator

## Estado atual

A fundação Java 25 comprova configuração, início, log estruturado e término
controlado. Rede de jogo, autenticação, quartos, inventário e economia não são
funcionalidades entregues por este bootstrap. O projeto usa Maven Wrapper 3.9.x;
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

## Ciclo de vida futuro

1. Ler configuração externa do ambiente e validar requisitos antes de aceitar
   trabalho. Falhar claramente se uma opção obrigatória estiver ausente.
2. Preparar recursos realmente habilitados. O bootstrap não depende de PostgreSQL
   nem de Redis para iniciar.
3. Tornar-se pronto somente depois dos recursos obrigatórios estarem disponíveis.
4. Ao terminar, retirar prontidão, parar admissões, drenar trabalho dentro de um
   prazo e liberar recursos. O estado persistente pendente precisa de política de
   retry/recuperação; encerrar não pode afirmar que gravou algo que falhou.

`development`, `test` e `production` são ambientes explícitos. Hostnames, portas,
senhas, endpoints e secrets não são embutidos no binário. A referência de
variáveis fica na configuração raiz; a aplicação valida tipos e faixas.

## Execução e dependências

Event loops de rede cuidam de I/O não bloqueante e trabalho curto. Processamento
de domínio e persistência possuem executores limitados separados quando forem
implementados. Usar Java 25 não implica uma thread virtual por evento ou quarto.
O modelo precisa ser medido antes de acrescentar concorrência.

Netty é a base de networking aprovada. Não adicionar Spring Boot, ORM, pool,
driver PostgreSQL ou cliente Redis sem uso concreto no incremento correspondente.
Executar Java e Maven com as versões fixadas; ver [ADR de build](../adr/0011-maven.md).

## Contratos de evolução

Erros são classificados no [modelo de erros](ERROR-MODEL.md). Logs não incluem
payloads, tokens ou dados pessoais por padrão. Os domínios devem ser testáveis com
relógio, fonte de IDs e persistência substituíveis, sem inicializar o servidor.
