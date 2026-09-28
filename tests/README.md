# Convenções de testes

Unitários Java ficam junto ao módulo (`apps/emulator/src/test`); registro do
protocolo usa Node test runner em `tests/protocol/`. Sem runtime adicional para
rodar os testes do registro. Testes determinísticos, sem sleeps arbitrários e
sem dependência de serviços de outros projetos.

- `integration/`: futuros testes em PostgreSQL dedicado, migrations e rede em
  portas efêmeras; nunca usar banco real do servidor.
- `e2e/`: futuro fluxo navegador ↔ serviço, com dados sintéticos descartáveis.
- `protocol/`: hoje integridade do registro; futuros vetores binários iguais em
  Java e TypeScript e casos inválidos/fuzzing com limites.
- `load/`: cenários em ambiente isolado, relatórios de recursos, seeds e versão;
  não executar no host compartilhado por padrão.

Room Engine futuro recebe relógio/scheduler controláveis e eventos em memória,
permitindo testes de ordenação/invariantes sem iniciar o hotel. Economia exige
concorrência, repetição de comando e idempotência com PostgreSQL real isolado.
Ausência de componente não é PASS de teste; relatar NOT RUN/NOT TESTED.
