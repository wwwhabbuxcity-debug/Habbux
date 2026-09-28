# Convenções de testes

Unitários e integração Java ficam junto ao módulo (`apps/emulator/src/test`);
codec e contrato TypeScript usam Node test runner em `tests/protocol/`. Java abre
listener WebSocket loopback/porta efêmera e verifica handshake, ping/pong,
desconexão, timeout e até 24 clientes concorrentes. Testes não dependem de
serviços de outros projetos.

- `integration`: futuros testes com serviços dedicados, migration/checksum e rede
  em portas efêmeras; liberar recursos em `finally` e nunca reutilizar banco,
  credencial ou porta de outro projeto.
- `e2e`: fluxo futuro navegador ↔ serviço com dados sintéticos; cobrir desktop,
  toque, falha de GPU, visibilidade da página e perda/restauração do contexto.
  Ferramenta de navegador só entra quando esses testes forem implementados.
- `protocol/`: vetores de bytes comuns em Java e TypeScript, framing inválido,
  limite, round-trip e entradas determinísticas fuzz-like.
- `load`: `npm run core:load-smoke` roda explicitamente 100 conexões loopback
  contra um processo local do Emulator, limitado a 100 e sem alcançar outros
  serviços; mede cleanup e erros, não capacidade máxima.

Somente `protocol/` fica versionado neste diretório. Benchmarks ficam separados
em [`../benchmarks`](../benchmarks/README.md); `mvn verify` executa apenas a
integração leve de 24 clientes e não roda o smoke separado de 100 conexões.

Room Engine futuro recebe relógio/scheduler controláveis e eventos em memória,
permitindo testes de ordenação/invariantes sem iniciar o hotel. Economia exige
concorrência, repetição de comando e idempotência com PostgreSQL real isolado.
Ausência de componente não é PASS de teste; relatar NOT RUN/NOT TESTED.
