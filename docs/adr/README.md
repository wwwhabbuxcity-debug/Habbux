# Architecture Decision Records

ADRs registram escolhas aceitas, contexto e consequências. Decisões substituídas
continuam no histórico com link para o ADR que as sucede; não editar decisão
para esconder uma mudança. Uma proposta ainda em aberto deve ser marcada como
proposta e não tratada como contrato.

## Índice

| ADR | Decisão | Estado |
| --- | --- | --- |
| [0001](0001-java-25.md) | Java 25 sem recursos preview | Aceita |
| [0002](0002-netty.md) | Netty para transporte assíncrono | Aceita |
| [0003](0003-postgresql.md) | PostgreSQL como fonte persistente | Aceita |
| [0004](0004-redis-role.md) | Redis opcional e efêmero | Aceita |
| [0005](0005-binary-protocol.md) | Protocolo binário versionado próprio | Aceita |
| [0006](0006-room-event-model.md) | Estado do quarto com proprietário lógico | Aceita |
| [0007](0007-typescript-pixijs.md) | Uma codebase TypeScript e PixiJS | Aceita |
| [0008](0008-hbx-native-assets.md) | HBX como formato nativo futuro | Aceita |
| [0009](0009-monorepo.md) | Monorepo por módulos de execução | Aceita |
| [0010](0010-multiplatform-client.md) | Um client adaptativo multiplataforma | Aceita |
| [0011](0011-maven.md) | Maven com wrapper e dependências fixas | Aceita |
| [0012](0012-user-identity.md) | Identidade de usuário e normalização | Aceita |
| [0013](0013-password-hashing.md) | Armazenamento de senha com Argon2id | Aceita |
| [0014](0014-persistence-auth-execution.md) | JDBC, pool e executor de Auth limitados | Aceita |
| [0015](0015-auth-session-policy.md) | Política de sessão e rate limit local de Auth | Aceita |
| [0016](0016-room-engine-execution.md) | Diretório, lifecycle e execução limitada do Room Engine | Aceita |
| [0017](0017-dom-ui-pixi-renderer.md) | DOM para interface convencional e PixiJS para o mundo | Aceita |
| [0020](0020-complete-avatar-parts-and-retained-room-background.md) | Partes completas do avatar e geometria estática do quarto | Aceita |
| [0021](0021-avatar-foot-support-pivot.md) | Apoio fixo dos pés como pivot da composição | Aceita |
| [0022](0022-owner-admin-http-controls.md) | Controles administrativos HTTP no Emulator | Aceita |
| [0023](0023-authoritative-next-step-announcement.md) | Próximo passo autoritativo reservado com compatibilidade legada | Aceita |

Aceito não significa implementação completa: veja os limites de cada decisão e
os READMEs dos módulos ainda planejados.
