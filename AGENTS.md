# Trabalho no Habbux

Leia README e docs/architecture/ARCHITECTURE-v1.md antes de mudar arquitetura.
Este repositório está na fase de fundação. Só implementar gameplay quando houver
pedido explícito para uma próxima etapa; não completar módulos por suposição.

- Código próprio; não copiar código, schema, protocolo ou assets de outros hotéis.
- Java 25 sem preview; Maven wrapper. TypeScript strict, PixiJS e uma codebase.
- IDs e limites do protocolo pertencem a packages/protocol/protocol.json.
- Não bloquear event loop, criar filas/caches ilimitados ou SQL em hot paths.
- Dependências precisam de finalidade e versões fixas. Mudanças de decisão:
  registrar ADR e consequências, sem promessas de capacidade não medida.
- Nunca versionar secrets, .env real, build outputs ou dados de usuários.
- Conferir conteúdo existente antes de substituir; preservar histórico Git.
- Builds em host compartilhado: nice -n 19, sequenciais, memória limitada.
- Não iniciar serviços, containers, benchmarks ou migrations em bancos de outro
  projeto. Configuração de desenvolvimento não é configuração de produção.
- Publicação deve servir apenas dist; seguir infrastructure/deployment/README.md.
- Registrar o que foi testado e o que é NOT RUN; não dizer PASS por falta de teste.

Checks: npm ci; npm run typecheck; npm run protocol:validate;
npm run protocol:test; npm run repository:check; npm run build;
./mvnw --batch-mode clean verify; Compose config conforme README.
Use nice -n 19 em instalações/compilações. Mudança só de documentação não exige
refazer todos os builds; verificar links e consistência é suficiente.
