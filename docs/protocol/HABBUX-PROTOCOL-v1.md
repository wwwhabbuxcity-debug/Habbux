# Habbux Protocol v1 — Core de rede

Status: **operacional para handshake, ping/pong, autenticação e Room Engine v1**.
`packages/protocol/protocol.json` é a
fonte única dos IDs, direções, tamanhos de payload e limites; o arquivo de vetores
compartilhados fica em `packages/protocol/golden-vectors-v1.txt`.

## Transporte e framing

O transporte é WebSocket binário no caminho `/ws`. Cada mensagem WebSocket
completa contém exatamente um frame Habbux. Fragmentos WebSocket são agregados
antes do decode, com limite total; texto, compressão e bytes extras não fazem
parte do contrato.

| Campo | Tamanho | Formato |
|---|---:|---|
| `VERSION` | 1 byte | uint8; v1 = 1 |
| `MESSAGE_ID` | 2 bytes | uint16 sem sinal |
| `FLAGS` | 1 byte | uint8; todos os bits devem ser zero |
| `PAYLOAD_LENGTH` | 4 bytes | uint32 sem sinal, apenas payload |
| `PAYLOAD` | variável | formato definido por mensagem |

Todos os inteiros multibyte usam **big-endian**. O cabeçalho tem 8 bytes. O
payload máximo padrão é 65.536 bytes e a configuração pode reduzi-lo, nunca
ultrapassá-lo. O servidor compara tamanho declarado e recebido antes de alocar
payload. Cada frame precisa caber em uma única mensagem WebSocket; vários frames
concatenados numa mesma mensagem são rejeitados.

Versão diferente, ID desconhecido, flags não zero, frame truncado, tamanho
inconsistente, mensagem textual ou payload acima do limite encerra a conexão com
WebSocket close `1002`, sem tentar interpretar o conteúdo. Não há fallback para
protocolo textual. TLS ainda pertence a um proxy reverso futuro; o servidor nesta
etapa escuta em `127.0.0.1` por padrão e não altera vhosts.

## Mensagens Core

Os IDs e direções abaixo são conferidos contra o registro em CI:

| ID | Mensagem | Direção | Payload |
|---:|---|---|---|
| 1 | `CLIENT_HELLO` | Client → servidor | vazio; não contém versão duplicada nem credenciais |
| 2 | `SERVER_HELLO` | Servidor → Client | 16 bytes de UUID RFC 4122, codificados em ordem de rede |
| 3 | `PING` | Client → servidor | uint32 de sequência big-endian |
| 4 | `PONG` | Servidor → Client | eco dos 4 bytes de sequência recebidos |
| 5 | `CLIENT_DISCONNECT` | Client → servidor | vazio |
| 6 | `SERVER_ERROR` | Servidor → Client | código uint16 big-endian |
| 7 | `AUTH_LOGIN` | Client → servidor | uint16 + login UTF-8 (1–254 bytes) + uint16 + senha UTF-8 (1–512 bytes) |
| 8 | `AUTH_REGISTER` | Client → servidor | username UTF-8, email UTF-8 e senha UTF-8, cada um precedido por uint16 de bytes; limites no registro |
| 9 | `AUTH_SUCCESS` | Servidor → Client | uint64 positivo de user ID + uint16 + username UTF-8 (3–20 bytes) |
| 10 | `AUTH_FAILURE` | Servidor → Client | categoria uint8: inválido, rejeitado, limitado ou indisponível |
| 11 | `AUTH_LOGOUT` | Client → servidor | vazio |
| 12 | `AUTH_LOGOUT_SUCCESS` | Servidor → Client | vazio |
| 13 | `ROOM_JOIN` | Client → servidor | uint64 positivo room ID |
| 14 | `ROOM_JOIN_SUCCESS` | Servidor → Client | uint64 room ID + uint8 x + uint8 y |
| 15 | `ROOM_JOIN_FAILURE` | Servidor → Client | uint8 categoria: não existe, cheio, já está em quarto, indisponível |
| 16 | `ROOM_LEAVE` | Client → servidor | vazio |
| 17 | `ROOM_LEAVE_SUCCESS` | Servidor → Client | vazio |
| 18 | `ROOM_SNAPSHOT` | Servidor → Client | room ID, width/height/capacity uint8, walkability[width×height], occupant count uint8 e ocupantes `[userId:uint64,x:uint8,y:uint8,usernameBytes:uint16,username:utf8]` |
| 19 | `ROOM_MOVE` | Client → servidor | destino uint8 x + uint8 y; o servidor calcula caminho em quatro direções |
| 20 | `ROOM_USER_POSITION` | Servidor → Client | uint64 user ID + uint8 x/y/z; v1 usa z=0 |
| 21 | `ROOM_ACTION_FAILURE` | Servidor → Client | operação uint8 (1 movimento) + categoria uint8: 1 fora do quarto, 2 inválido/ocupado, 3 sem rota, 4 limite, 5 indisponível |

Username de snapshot usa comprimento `uint16` de **bytes UTF-8**, validado antes
de decodificar/copiar. Room ID e user ID são BIGINT positivo representado por
`uint64` big-endian. Nome de usuário autenticado é limitado a 20 bytes. O maior
snapshot permitido ocupa 7.308 bytes: 4.096 de grade, 100 ocupantes de até 32
bytes cada e 12 bytes fixos. Se Room Core estiver habilitado, o limite de frame
configurado precisa comportar esse snapshot; o Core v1 continua limitado a
65.536 bytes.

`ROOM_MOVE` aceita apenas um destino; usa BFS sem pesos, 4 direções na ordem
norte/oeste/leste/sul, até 4.096 nós e 128 passos por padrão. Um ticker global de
quartos avança no máximo 16 jogadores por quarto a cada 100 ms. A configuração
pode ajustar esses limites dentro dos intervalos do README do Emulator.

`SERVER_ERROR` códigos v1: `1 INVALID_STATE`, `2 HANDSHAKE_TIMEOUT`. Versão
incompatível ou frame que não possa ser interpretado recebe apenas close `1002`.
Estado inválido e timeout de handshake enviam o erro estável e fecham com `1008`.
O servidor não inclui detalhes internos, stack trace ou configuração na resposta.
Pings de protocolo não são WebSocket Ping/Pong de controle; o Netty trata os
frames de controle separadamente.

`AUTH_FAILURE` não distingue username/email inexistente, senha incorreta ou
cadastro duplicado. O Client envia credenciais somente por WebSocket; o payload,
as cópias temporárias e os buffers de entrada são limpos após parsing/envio. A
fronteira pública exige WSS na camada de proxy antes de aceitar tráfego externo.

## Handshake e sessão

Após o upgrade WebSocket, a sessão passa por:

```text
CONNECTED → HANDSHAKING → READY ⇄ AUTHENTICATING → AUTHENTICATED → READY → DISCONNECTED
```

O servidor cria uma sessão com UUID v4 aleatório ao aceitar a conexão. Esse UUID
é identificador de transporte, não credencial, usuário autenticado ou segredo de
login. Após o upgrade WebSocket, a sessão muda para `HANDSHAKING` e inicia o prazo
configurável (`HABBUX_HANDSHAKE_TIMEOUT_MS`, padrão 10 s). Só aceita
`CLIENT_HELLO` vazio nesse estado; responde `SERVER_HELLO` com o UUID da sessão e
conclui o handshake no estado `READY`. Login atribui identidade mínima; somente
`AUTHENTICATED` pode chamar `ROOM_JOIN`. Cada sessão ocupa no máximo um quarto.
Saída explícita, logout ou disconnect limpa a presença; entrada e saída são
ordenadas no mailbox daquele quarto.

`PING` é aceito após handshake, inclusive enquanto a operação de autenticação
aguarda um worker. `PONG` ecoa a sequência e o Client estima RTT com
relógio monotônico local. O Client envia no máximo um ping a cada 15 s e fecha se
não recebe resposta em 10 s. O timeout de inatividade do servidor é configurável
(`HABBUX_IDLE_TIMEOUT_SECONDS`, padrão 120 s). Antes de `READY`, no máximo três
frames são processados por conexão; após handshake, um token bucket local permite 30
mensagens/s com burst de 60 por conexão, ajustáveis por configuração. Ao exceder o
limite, o servidor conta o evento e fecha o canal sem processar a mensagem. O
limite de conexões também é configurável e tem padrão 256. Uma sessão aceita uma
operação de autenticação por vez; cada conexão limita a cinco operações em 60 s.
O Auth Core usa workers fixos (padrão 2) e fila limitada (padrão 8). Login faz uma
verificação Argon2id fictícia quando a identidade não existe, e as falhas de
senha/identidade usam a mesma categoria pública. Um limitador local mantém no
máximo 4.096 identidades, aplica bloqueio temporário de 60 s após cinco falhas em
15 min e remove o estado após sucesso. Esses limites são por processo; múltiplas
conexões autenticadas para o mesmo usuário são permitidas. Logout remove o
principal da sessão, sem revogar outras conexões.

Disconnect explícito, fechamento remoto, timeout, frame inválido, exceção e
shutdown removem a sessão do registry e enfileiram o leave antes de descartar o
principal. O registry é concorrente, limitado pela admissão e não usa lock global
para cada frame. Presença, posição e caminhos não são persistidos.

## Limites e configuração

`HABBUX_BIND_HOST` e `HABBUX_PORT` escolhem interface e porta; padrão loopback e
3100. `HABBUX_MAX_PAYLOAD_BYTES` varia de 16 a 65.536 bytes para comportar o
`SERVER_HELLO` de 16 bytes. `HABBUX_ALLOWED_ORIGINS`
é lista explícita separada por vírgula; requests WebSocket sem `Origin` (clientes
nativos) são aceitos, enquanto uma origem enviada precisa estar na lista. Em
produção, a terminação WSS, origem externa e publicação só devem ser configuradas
junto com uma borda TLS revisada.

Não se executa I/O de aplicação, banco, arquivo, sleep nem espera de Future no
event loop. O Core não cria thread por conexão. SQL e hashing executam somente no
Auth Executor limitado; o EventLoop recebe apenas a conclusão. Controles atuais
limitam payload, conexões, handshake, inatividade, mensagens pré-handshake e taxa local por canal.
A fila de saída do canal tem high watermark de 64 KiB e uma conexão sem capacidade
de escrita é encerrada, evitando acúmulo ilimitado de PONGs. Não há rate limit
global por IP, autenticação, autorização ou filas de gameplay.

O `ByteBuf` recebido pertence ao pipeline e é liberado pelo
`SimpleChannelInboundHandler`; o decoder copia somente o payload depois de validar
seu tamanho. O buffer de saída é transferido ao `BinaryWebSocketFrame`, que o
libera após escrita ou fechamento do canal. Para diagnosticar leaks, rode Maven
com `-Dhabbux.nettyLeakDetection=paranoid`; essa configuração se aplica somente à
JVM de testes e não altera o processo de produção.

## Vetores e validação

`golden-vectors-v1.txt` é consumido pelos testes Java e TypeScript. Os vetores
cobrem mensagens de controle, Auth e Room. Os testes também
verificam round-trip, limite configurado, versões/IDs/flags inválidos, truncamento,
length divergente e entradas aleatórias determinísticas. O teste de integração
abre um WebSocket real, faz handshake, ping/pong, desconexão, timeout e 24 conexões
simultâneas; `npm run core:load-smoke` executa separadamente clientes locais.

Esses ensaios verificam o Core funcional e cleanup no ambiente observado. Não
representam capacidade máxima, jogadores ativos, desempenho de salas ou escala de
produção.
