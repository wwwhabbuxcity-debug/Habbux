# Dependências e origens

Não há assets Habbo/SWF/Nitro, código de hotéis, sources vazadas ou componentes
proprietários incorporados. As dependências são obtidas dos registries oficiais;
artefatos binários e node_modules não entram no Git. A licença do código próprio
ainda será definida pela titular: este documento não concede uma licença pública.

| Componente | Uso | Licença upstream | Origem |
| --- | --- | --- | --- |
| Netty | Lifecycle do event loop Java | Apache-2.0 | https://netty.io/ |
| SLF4J | API de logging | MIT | https://www.slf4j.org/ |
| Logback | Logs estruturados JSON | EPL-2.0 OR LGPL-2.1-only | https://logback.qos.ch/ |
| JUnit | Testes Java | EPL-2.0 | https://junit.org/ |
| Maven e wrapper | Build Java reproduzível | Apache-2.0 | https://maven.apache.org/ |
| TypeScript | Typecheck | Apache-2.0 | https://www.typescriptlang.org/ |
| PixiJS | Renderer client | MIT | https://pixijs.com/ |
| Vite | Build/dev client e web | MIT | https://vite.dev/ |
| PostgreSQL (imagem opcional) | Persistência local futura | PostgreSQL License | https://www.postgresql.org/ |
| Redis 8 (imagem opcional) | Cache efêmero futuro | AGPLv3 / RSALv2 / SSPLv1, alternativas upstream | https://redis.io/legal/licenses/ |
| Flyway Community (imagem opcional) | Migrations locais futuras | Apache-2.0; verificar distribuição/edição | https://github.com/flyway/flyway |
| GitHub Actions oficiais | CI | MIT | https://github.com/actions |

Versões exatas estão no POM, package.json/package-lock, Compose e pins dos
workflows. O lock npm inclui transitivas; POM/BOM fixa a família Netty e plugins.
Maven não usa ranges ou SNAPSHOTs de dependências; wrapper valida o checksum da
distribuição. O SNAPSHOT do módulo próprio indica projeto ainda não lançado.

Dependabot abre PRs de updates compatíveis; major updates não são automáticos e
nenhum PR é mesclado automaticamente. Major exige ADR/revisão de migração quando
mudar contrato. Atualizações de imagens e wrapper são manuais, versionadas e
validadas. Rever changelog, vulnerabilidades, licença, custo e CI antes de aceitar.
Antes de distribuir binários, gerar inventário/SBOM e avisos transitivos da
versão efetivamente empacotada; esta tabela inicial não substitui esses avisos.

Referências técnicas consultadas para esta fundação: [Maven Wrapper](https://maven.apache.org/tools/wrapper/),
[Netty releases](https://netty.io/news/), [PixiJS Application](https://pixijs.com/8.x/guides/components/application),
[Certbot webroot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot) e
[Docker Compose](https://docs.docker.com/compose/).
