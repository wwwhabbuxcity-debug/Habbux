# WALK Engine V8

Implementação original Habbux. Gallaxys não foi alterado nem usado como fonte de
código/assets. O diagnóstico anterior já localizou a diferença de sincronização;
não se repetiu uma auditoria externa completa.

## Causa e medida corrigida

O evento legado informa um endpoint depois do movimento autoritativo. Numa curva
cardinal→diagonal, o endpoint cardinal chega em t=500 e o diagonal em t=1300:
800 ms de intervalo pelo tick de 100 ms. A apresentação cardinal termina em
1100 (500 + buffer 100 + duração 500). Há 200 ms até o novo endpoint; como o
controller reinicia seu buffer quando fica sem segmento, somam-se outros 100 ms.
A reprodução determinística atual mede **300 ms** nessa janela, ou 310 ms se
incluído o frame de limite na amostragem de 10 ms. O relato anterior de ~210 ms
cobria a lacuna inicial, não todo o reinício. O candidato recebe anúncio em t=0
(cardinal) e t=500 (diagonal), mede **zero pausa entre esses segmentos**, termina
em t=1307 e conserva durações 500/707, interpolação linear e cadência WALK 82 ms.

## Autoridade e concorrência

O servidor anuncia somente o próximo passo validado. Reserva seu destino e,
para diagonal, os dois tiles laterais antes do anúncio; spawn e pathfinding
respeitam essas reservas. Commit, saída e cancelamento as liberam. A ocupação
lógica ainda muda no tick do commit, sem SQL no caminho quente. O prazo do
próximo passo continua acumulado para evitar arredondar todo diagonal a 800 ms.

Um novo destino preserva o passo anunciado e substitui a cauda calculada a
partir dele. Um tile futuro que ficou bloqueado é recusado antes de ser anunciado.
Terminal no endpoint já garantido deixa a apresentação desse passo terminar;
correção divergente limpa a fila. Nenhuma trajetória é prevista pelo client.
Células laterais reservadas são uma escolha conservadora: reduzem passagem
simultânea junto a um diagonal para impedir interseções/cancelamento visual.

STEP tem sequência por presença, origem/destino com Z, duração e tempo restante.
O observador que entra no meio de um passo recebe seu anúncio após o snapshot.
Sequências repetidas/antigas são ignoradas; saída destrói o controller, portanto
nova presença com mesmo userId pode reiniciar sequência. Endpoints de commit
não são reenfileirados no modo novo. O apoio dos pés continua no mesmo centro
projetado; animação e movimento usam seus clocks existentes sem mudar offsets.

## Compatibilidade

Payloads e IDs anteriores permanecem. ID27 `ROOM_JOIN_MOVEMENT` tem o mesmo
uint64 de ROOM_JOIN e opta por ID28 `ROOM_USER_STEP` (26 bytes). Sessões que usam
ROOM_JOIN legado recebem apenas endpoints ID20, porque clients antigos rejeitam
IDs desconhecidos.

Client novo sonda com ROOM_JOIN e o ID reservado **9223372036854775807**. Servidor
novo responde ROOM_JOIN_FAILURE categoria5 sem criar/entrar em sala. Categoria
legada1..4 de servidor antigo causa envio do ROOM_JOIN real; categoria5 causa
JOIN_MOVEMENT. Nenhuma senha é reenviada, estado AUTHENTICATED é preservado e
não se trata erro de autenticação/path como negociação. O ID reservado não é
aceito como sala pelo client novo. A sonda custa uma ida e volta na primeira
entrada por conexão; resultado é reaproveitado até logout/reconnect.

## Verificação

- Testes WALK V8: **7 PASS**; regressão cardinal→diagonal, 20 passos mistos/oito
  direções, fase dos quatro frames, terminal, duplicata, entrada durante passo,
  atraso longo e rejeição direta de dados adulterados.
- Testes legado isometric-world-v2: **28 PASS**.
- Protocolo: **22 PASS**, incluindo client novo com servidor legado e opt-in, timeout, erro Auth,
  categoria inválida e nova sondagem após logout;
  registry válido com 28 mensagens e vetores novos compartilhados.
- Primeira compilação Java falhou: uma edição acrescentou `MOVEMENT_SUPPORTED`
  ao switch de falhas de CHAT indevidamente. Corrigido, mantendo categoria5
  somente em JoinFailure; nenhuma mudança de semântica de chat. Nova execução
  Maven fica com root.
- Segunda execução Java: 121 testes, duas falhas de testes. Regex de registry
  exigia espaços específicos no JSON (24/28 IDs contados); agora aceita espaços
  variáveis e continua exigindo todos os IDs/enums. Teste de retarget assumia
  cinco commits, mas BFS podia escolher primeiro diagonal e terminar em quatro;
  agora captura o STEP garantido e exige seu commit exato, adjacência, destino
  final e fila vazia com limite de passos, sem mudar BFS/runtime. Reteste pendente.
- Java preparado: reserva/saída, diagonal/cantos/spawn, troca de destino,
  codec STEP/terminal e transporte parametrizado legado/novo. Execução Maven,
  typecheck/build e integração visual ficam com root, sequenciais.
- Nenhum commit, deploy, serviço ou reinício executado por este agente.

## Limites

Buffer de apresentação continua 100 ms. Tick e jitter adicionais juntos precisam
caber nessa folga para garantir continuidade. Uma rede que atrasar o próximo
anúncio além dela pode causar espera, nunca extrapolação de tile desconhecido;
o controller retoma sem repetir 100 ms de startup. Teste misto usa 20 ms de
latência constante, quantização 0..93 ms e jitter alternado 0/5 ms. Atraso maior
é testado para parada/retomada segura, não declarado livre de pausas. Não existe
garantia possível para atraso arbitrário com buffer finito e sem previsão.
Sessão autenticada/browser real, GPU física e performance completa são QA do
root; testes determinísticos não os substituem.
