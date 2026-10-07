# Habbux CMS v1 — Login + Register

Data: 2026-10-07. Commit final: `e0a5570`.

## Resultado

PASS para o escopo Login/Register.

- `https://tyvo.online/` agora mostra a CMS Habbux split-screen.
- Login e registro usam o Auth WebSocket existente; nenhum banco de usuários novo foi criado.
- Login e registro ficam na mesma tela, sem reload.
- Registro bem-sucedido encerra a sessão criada pelo cadastro e retorna ao login.
- Login aprovado abre `/client/` em nova aba e autentica o jogo por canal temporário em memória.
- A senha não vai para URL, `localStorage` ou `sessionStorage`.
- O Client/Room existente continua em `/client/` e o WSS continua em `/ws`.

## Evidências

Screenshots: `Asset-Archive/research/habbux-e2e/2026-10-07/`.

E2E Chromium público: CMS 200, troca de modo, cadastro real, login real, nova aba,
Auth do jogo `AUTHENTICATED`, CMS preservada e zero erros de console.

## Checks

- Client tests: 13/13.
- Protocol tests: 18/18.
- Typecheck Client/Web: PASS.
- Builds Client/Web com `nice -n 19`: PASS.
- Repository hygiene: PASS.
- HTTPS/WSS, Nginx, Emulator e PostgreSQL: ativos.
- Contas temporárias de teste: removidas do banco DEV.

## Fora desta fase

Home, notícias, perfil, ranking, loja, catálogo, comunidade, staff, Admin,
recuperação de senha, Furniture e demais páginas CMS.
