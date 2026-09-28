# Integração — planejado

Nenhuma conexão Habbux com PostgreSQL/Redis existe. Próximos testes devem criar
serviços isolados, validar migrations/checksums e encerrar recursos em finally.
Não reutilizar banco, credencial ou porta de aplicações deste servidor.
