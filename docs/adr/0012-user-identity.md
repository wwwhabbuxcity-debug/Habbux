# ADR 0012: identidade de usuário e normalização

**STATUS:** Aceita

## CONTEXTO

Usuários precisam de identidade estável em PostgreSQL e protocolo sem carregar
campos de domínio futuro. A unicidade de username/email precisa ser independente
da capitalização escolhida no cadastro.

## DECISÃO

Usar `BIGINT GENERATED ALWAYS AS IDENTITY` como chave. Guardar a grafia escolhida
e colunas normalizadas em minúsculas com `Locale.ROOT`; constraints `UNIQUE` no
banco protegem username e email em concorrência. Username é ASCII, inicia com
letra e aceita letras, números e `_`, de 3 a 20 caracteres. Email segue validação
ASCII básica até 254 caracteres; todo o endereço é normalizado para minúsculas.

## CONSEQUÊNCIAS

BIGINT reduz tamanho de PK/FK e é simples de indexar/transportar; não é segredo nem
token. A sequência é local ao banco e não promete alocação distribuída. Mudança
futura de particionamento deve avaliar blocos/intervalos antes de trocar o tipo.
O schema não inclui moedas, avatar, quarto ou rank.
