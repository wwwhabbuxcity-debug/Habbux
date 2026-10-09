# Dependências e origens

O runtime, protocolo e persistência Habbux usam código próprio. A migração
seletiva V5 incorpora dados de modelos do banco distribuído com Polaris e
sequências STAND/WALK do Octane Renderer sob GPL-3.0, com fontes correspondentes
e conversores offline, além de três modelos custom `OWNER_DECLARED_OWNED` em
recurso separado, com declaração e hashes. A interpretação de escopo por conjunto está documentada
em [modelos](docs/gallaxys-migration-v5/models.md),
[avatar](docs/gallaxys-migration-v5/avatar.md) e
[ADR 0024](docs/adr/0024-selective-gallaxys-resource-migration.md).

As dependências são obtidas dos registries oficiais; build outputs e node_modules
não entram no Git. Os seis PNGs de avatar legados já existentes possuem origem
identificada e direitos individuais ainda não comprovados, conforme
[registro V2](docs/gallaxys-engine-parity-v2/report.md#origem-e-licença).
A GPL dos dados/codebases não concede licença a esses PNGs nem às imagens de
piso/parede, cuja autorização de migração própria foi confirmada pela titular.
Os 58 PNGs de piso/parede têm recibo específico OWNER_DECLARED_OWNED em
[materiais](docs/gallaxys-migration-v5/materials.md). O ornamento de corações
anterior permanece arquivado e não substitui esses materiais. A licença dos
demais arquivos de código próprio ainda será definida pela titular; este
documento não lhes concede uma licença pública.

| Componente | Uso | Licença upstream | Origem |
| --- | --- | --- | --- |
| Netty | Lifecycle do event loop Java | Apache-2.0 | https://netty.io/ |
| SLF4J | API de logging | MIT | https://www.slf4j.org/ |
| Logback | Logs estruturados JSON | EPL-2.0 OR LGPL-2.1-only | https://logback.qos.ch/ |
| JUnit | Testes Java | EPL-2.0 | https://junit.org/ |
| HikariCP | Pool limitado de conexões PostgreSQL | Apache-2.0 | https://github.com/brettwooldridge/HikariCP |
| PostgreSQL JDBC | Driver JDBC do PostgreSQL | BSD-2-Clause | https://jdbc.postgresql.org/ |
| Bouncy Castle | Argon2id para armazenamento de senha | Bouncy Castle License | https://www.bouncycastle.org/ |
| Flyway Community | Migrations SQL versionadas | Apache-2.0 | https://github.com/flyway/flyway |
| Maven e wrapper | Build Java reproduzível | Apache-2.0 | https://maven.apache.org/ |
| TypeScript | Typecheck | Apache-2.0 | https://www.typescriptlang.org/ |
| PixiJS | Renderer client | MIT | https://pixijs.com/ |
| Vite | Build/dev client e web | MIT | https://vite.dev/ |
| Definições de quartos Polaris selecionadas V5 | 58 modelos convertidos em TSV nativo | GPL-3.0; escopo documentado | [Fonte correspondente e avisos](tools/room-models/gpl-source/NOTICE.md) |
| Modelos custom Gallaxys próprios V5 | 3 modelos convertidos em TSV separado | LicenseRef-Habbux-Owner-Declared; migração autorizada, sem licença pública atribuída | [Declaração e fontes](tools/room-models/owned-source/NOTICE.md) |
| Default/Move Octane Renderer selecionados V5 | Perfil nativo de animação STAND/WALK | GPL-3.0 | [Fonte correspondente e avisos](tools/avatar-v5/gpl-source/NOTICE.md) |
| Metadata de materiais Octane V5 | 220 variantes/cores e vínculos de textura convertidos | GPL-3.0, separado dos pixels | [Metadata/fonte/conversor](apps/client/public/assets/materials/v5/classic/gpl-metadata-source/NOTICE.txt) |
| PNGs de pisos e paredes Gallaxys V5 | 6 pisos e 52 papéis nativos com pixels preservados | Proprietária declarou autoria/propriedade; uso autorizado, sem licença pública atribuída | [Declaração e hashes](apps/client/public/assets/materials/v5/classic/NOTICE.txt) |
| Conversores offline de modelos/avatar | Reprodução dos dados GPL V5 | GPL-3.0 | [Modelos](tools/room-models/converter.mjs), [reprodução V5](tools/room-models/reproduce-v5.mjs), [avatar](tools/avatar-v5/convert.mjs) |
| PostgreSQL (imagem opcional) | Persistência local de desenvolvimento | PostgreSQL License | https://www.postgresql.org/ |
| Redis 8 (imagem opcional) | Cache efêmero futuro | AGPLv3 / RSALv2 / SSPLv1, alternativas upstream | https://redis.io/legal/licenses/ |
| Flyway Community (imagem opcional) | Migrations locais em Compose | Apache-2.0; verificar distribuição/edição | https://github.com/flyway/flyway |
| GitHub Actions oficiais | CI | MIT | https://github.com/actions |

Fontes correspondentes, licenças e ferramentas acompanham os recursos públicos
nos caminhos `/client/assets/materials/v5/gpl-model-source/` e
`/client/assets/avatar/v5/gpl-source/`, além de
`/client/assets/materials/v5/classic/gpl-metadata-source/`. O primeiro inclui `README.txt` com a
reprodução independente dos modelos, sem banco ou acesso ao Gallaxys. Os
arquivos preparados para publicação ficam em `apps/client/public/assets/` e
são copiados para `dist` pelo build.

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
