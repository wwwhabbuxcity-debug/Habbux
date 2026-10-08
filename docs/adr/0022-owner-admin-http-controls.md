# ADR 0022 — Controles administrativos HTTP no Emulator

Status: aceito. Data: 2026-10-08.

O hotel precisa de controles rápidos de operação sem dar ao navegador acesso
direto ao banco nem criar um segundo processo. O painel estático em `/admin/`
usa uma rota HTTP versionada no Emulator: `GET /admin-api/v1/overview`, `GET`
e `PUT /admin-api/v1/settings`. O Nginx protege página e API com Basic Auth,
mantém o processo em loopback e não expõe o repositório nem as credenciais do
banco.

O contrato aceita somente uma representação completa e idempotente dos quatro
campos de configuração. A escrita exige origem da lista autorizada, formulário
com tamanho máximo de 1 KiB e validação de valores. Erros são JSON estável com
status HTTP: `400`, `403`, `404`, `405`, `413`, `415`, `500`, `503` ou `504`.
Cada escrita tem prazo de três segundos; uma resposta de prazo esgotado não
repete a operação. O operador pode reenviar a mesma representação.

O estado persistente é a linha única `hotel_settings` no PostgreSQL. O processo
carrega uma cópia validada e só a troca depois da atualização durar. Cadastro e
entrada em quarto fazem leitura local: desligar cadastros recusa novas contas e
manutenção bloqueia novas entradas, sem derrubar jogadores presentes. Leituras e
escritas administrativas passam por um executor de uma thread e fila de quatro
itens, separado de Auth, Room e event loop. Métricas de fila, pedidos, rejeições,
falhas e atualizações aparecem no overview.
