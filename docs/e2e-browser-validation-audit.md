# Habbux — auditoria E2E de navegador e Tyvo

Data: 2026-10-07. Checkpoint de código: `e25a436`.

## Estado confirmado

- `main` do Habbux e do checkout Tyvo estão em `e25a436`, sem alterações pendentes.
- O Client tem Room Renderer Pixi, Avatar Engine v1, seletor DEV de modelos e fluxo
  de Auth/Room/Movement/Chat.
- O Emulator DEV usa PostgreSQL `habbux_phase2_test` e escuta internamente em
  `127.0.0.1:3100`; o Nginx expõe somente HTTPS e `/ws` como WSS.
- A release pública e o JAR em execução têm o mesmo SHA-256 dos builds atuais.

## Validação pública com Chromium

Executada contra `https://tyvo.online/client/?dev=1` com duas sessões reais:

- cadastro/login real: PASS;
- renderer Pixi/canvas, modelo pequeno e movimento por clique: PASS;
- seis modelos DEV, incluindo irregular e multi-height: PASS;
- dois jogadores no mesmo quarto: PASS;
- movimento autoritativo e chat broadcast: PASS;
- HTTPS, WSS, assets e ausência de erro de console: PASS no smoke público.

Evidências ficam em `Asset-Archive/research/habbux-e2e/2026-10-07/`.

## Limites ainda explícitos

- A distinção visual dos quatro frames de WALK e das oito direções não foi
  declarada como PASS neste ciclo; o Avatar Lab e os testes puros existem, mas a
  captura frame-a-frame ainda precisa de confirmação visual dedicada.
- `the_den` continua fora do registro por ser inválido, conforme `RoomModelTest`;
  não foi corrigido silenciosamente.
- Furniture, Catalog, Inventory, CMS/Admin e HBX Compiler continuam fora do escopo.

## Checks

- Protocol validate: 26 mensagens válidas.
- Protocol tests: 18/18.
- Typecheck Client/Web: PASS.
- Client/Web build com `nice -n 19`: PASS.
- Maven Java 25 `clean verify` com `nice -n 19`: BUILD SUCCESS, 100 testes,
  0 falhas, 0 erros, 4 skips de integração PostgreSQL sem credenciais de teste.
- Repository hygiene: PASS.
- Serviço `habbux-tyvo.service`: ativo; nenhum serviço compartilhado foi reiniciado.
