# Convenções de testes

Unitários Java ficam junto ao módulo (`apps/emulator/src/test`); registro do
protocolo usa Node test runner em `tests/protocol/`. Sem runtime adicional para
rodar os testes do registro. Testes determinísticos, sem sleeps arbitrários e
sem dependência de serviços de outros projetos.

- `integration`: futuros testes com serviços dedicados, migration/checksum e rede
  em portas efêmeras; liberar recursos em `finally` e nunca reutilizar banco,
  credencial ou porta de outro projeto.
- `e2e`: fluxo futuro navegador ↔ serviço com dados sintéticos; cobrir desktop,
  toque, falha de GPU, visibilidade da página e perda/restauração do contexto.
  Ferramenta de navegador só entra quando esses testes forem implementados.
- `protocol/`: hoje integridade do registro; futuros vetores binários iguais em
  Java e TypeScript e casos inválidos/fuzzing com limites.
- `load`: cenários em ambiente isolado, relatórios de recursos, seeds e versão;
  não executar no host compartilhado por padrão.

Somente `protocol/` existe hoje neste diretório. As categorias futuras serão
criadas junto com testes reais, sem pastas ou READMEs vazios. Benchmarks ficam
separados em [`../benchmarks`](../benchmarks/README.md); `mvn verify` não roda
carga.

Room Engine futuro recebe relógio/scheduler controláveis e eventos em memória,
permitindo testes de ordenação/invariantes sem iniciar o hotel. Economia exige
concorrência, repetição de comando e idempotência com PostgreSQL real isolado.
Ausência de componente não é PASS de teste; relatar NOT RUN/NOT TESTED.
