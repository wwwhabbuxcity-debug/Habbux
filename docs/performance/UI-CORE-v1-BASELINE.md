# Habbux UI Core v1 — baseline técnico

Data da medição: 2026-09-30. Os comandos foram executados na raiz do
repositório com Node 22 portátil, `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=512`
e `RAYON_NUM_THREADS=1`.

## Bundle do client

Os valores abaixo são a soma dos arquivos `.js` e `.css` em
`apps/client/dist/assets`, sem gzip. O antes é o commit `7cda24e`, antes da
fundação de UI; o depois é o build desta versão.

| Medição | Antes | Depois | Delta |
| --- | ---: | ---: | ---: |
| JavaScript | 549.709 B | 550.439 B | +730 B (+0,13%) |
| CSS | 5.590 B | 8.572 B | +2.982 B (+53,35%) |

O aumento de CSS é a folha do design system e do UI Lab. O JavaScript inicial
continua separado do código de demonstração: o UI Lab só é importado quando o
Vite está em desenvolvimento e a URL possui `?ui-lab`.

## Testes determinísticos

- `apps/client/tests/ui-core.test.ts`: 7 testes PASS.
- WindowManager: 1.000 ciclos de abrir/fechar e 1.000 mudanças de viewport PASS.
- NotificationQueue: burst de 10.000 notificações com fila limitada PASS.
- ChatHistory: 1.200 mensagens, histórico limitado a 50 e expiração PASS.
- `npm run client:typecheck`: PASS.
- `npm run protocol:validate`: PASS.
- `npm run protocol:test`: PASS (18 testes).
- `nice -n 19 ./mvnw --batch-mode clean verify`: PASS (96 testes Java; 4
  testes de integração PostgreSQL pulados por configuração ausente).

## Browser e vidro

Não há Chromium, Firefox, Chrome nem Playwright instalado neste host.
Consequentemente, screenshots, inspeção de DOM no browser, resize/orientation
visual e medição de FPS/heap não foram executados (`NOT RUN`). Não há resultado
honesto de baixo nível para comparar solid, translucent e glass neste ambiente.

O UI Lab contém as três superfícies para essa comparação quando aberto em um
browser. Glass é opt-in, tem fallback sólido via `@supports`, desliga blur em
pointer coarse e em qualidade reduzida, e usa uma única regra de
`backdrop-filter`.

## Limites e revisão

Não foram adicionadas dependências. Não há `innerHTML`, `eval`, timer por chat
bubble, fila ilimitada ou z-index fora dos tokens do design system na camada de
UI revisada. A validação de memória permanece uma tarefa de browser/devtools,
não uma afirmação de ausência de leak baseada apenas em testes Node.
