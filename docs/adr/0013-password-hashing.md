# ADR 0013: armazenamento de senha com Argon2id

**STATUS:** Aceita

## CONTEXTO

Auth precisa persistir um verificador de senha sem texto puro, hash rápido ou
criptografia reversível. O host compartilhado tem recursos limitados; o custo
precisa ser deliberado e o hashing precisa ficar fora do EventLoop.

## DECISÃO

Usar Argon2id v=19, memória 19.456 KiB, duas iterações e paralelismo 1, com salt
aleatório de 16 bytes e tag de 32 bytes em formato PHC. O custo atende ao mínimo
recomendado atual de memória/iterações com espaço controlado para dois workers.
Cadastro exige 12 caracteres e rejeita mais de 128 pontos de código ou 512 bytes
UTF-8. O parser limita parâmetros armazenados antes de executar o verificador.
Parâmetros mínimos seguem a recomendação publicada pela
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## CONSEQUÊNCIAS

Hash/verify consome CPU e cerca de 19 MiB de memória por operação com parâmetros
emitidos; a fila limitada impede crescimento sem limite. Verificação usa comparação
em tempo constante. Aumentar custo requer medir latência e memória sob carga e pode
exigir versionar política; login ainda não está ligado nesta decisão.
