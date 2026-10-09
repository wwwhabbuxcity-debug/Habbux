# Modelos — integração direta V4

Reaproveitado o inventário V3: **64 encontrados, 0 com titularidade/licença
individual comprovada, 0 modelos Gallaxys novos importados**. Nenhum dado
externo foi copiado para runtime nesta entrega. Permanecem 63 modelos legados
inalterados e 3 modelos ORIGINAL Habbux (66 no registro). A autorização V4 cobre
recursos próprios da dona do servidor; não afirma que todos os modelos
hospedados foram criados por ela.

## Evidência local adicional, pesquisa dirigida

- `Polaris-Emulator-main/Database/Default Database/CleanDB.sql`, bloco
  `room_models_custom` nas linhas 54452–54465: modelos custom de IDs 50–56,
  diferentes dos IDs 9/10/13 do inventário operacional. Os sete hashes de mapas
  desse bloco também diferem dos três custom operacionais. Isso exclui esta
  correspondência direta, mas não comprova autoria independente.
- `Emulator/src/main/java/com/eu/habbo/networking/gameserver/auth/RegistrationSupport.java`,
  linhas 20–57: um modelo `custom_<roomId>` pode ser criado copiando um
  `room_templates.heightmap`. Nome custom não significa criação original.
- `Emulator/.../catalog/layouts/RoomBundleLayout.java`, linha 216: modelos
  custom também podem ser copiados de outros modelos custom.
- `Emulator/.../rooms/RoomRepository.java`, linha 19, e
  `Emulator/.../rooms/CustomRoomLayout.java`, linha 29: gravação/edição de
  heightmaps não registra neste recurso uma licença ou autoria individual.
- `Database/Dev Seeds/room_207_wiredlab.sql` descreve seed de desenvolvimento
  40×28, não comprovação de autoria dos três custom. Não é um dos recursos
  autorizados identificados no inventário V3 e não foi importado/executado.

Nenhuma declaração local dirigida aos mapas custom_9/custom_10/custom_13 ou
manifesto de titularidade/licença individual desses mapas foi encontrada nos
caminhos examinados. Não foi repetida a auditoria completa nem lidos dados de
usuários; investigação limitada ao SQL de seeds e pontos de criação de modelos.

| Modelo operacional | Geometria V3 | Evidência faltante | Decisão |
|---|---|---|---|
| custom_9, ID 9 | 13×16; 105 tiles conectados | Declaração identificando autora/titular e hash do mapa, ou licença individual de origem | UNKNOWN / bloqueado |
| custom_10, ID 10 | 22×16; 133 tiles, apenas 1 alcançável do spawn | Mesma prova de direitos; além disso mapa não passa conectividade | UNKNOWN / bloqueado e inválido para conversão |
| custom_13, ID 13 | 29×30; 485 tiles conectados | Declaração identificando autora/titular e hash do mapa, ou licença individual de origem | UNKNOWN / bloqueado |
| 61 modelos room_models | Inventário anterior por ID/hash | Prova individual/conjunto delimitado de autoria ou licença com obrigações | UNKNOWN / bloqueado |

A autorização geral para recursos próprios já foi recebida. O dado faltante é
**identificar quais mapas são próprios**, vinculando a declaração ao ID/hash,
ou apresentar licença dos terceiros. Nenhum pedido de permissão repetido foi
introduzido. Não há mapeamento origem→destino novo porque nenhum mapa externo
satisfez o requisito de titularidade; não foi inventado ID de destino.

## Gate e validação

O gate reutilizável V3 continua em `tools/room-models/converter.mjs`: exige
ORIGINAL/AUTHORIZED, author/license/source/evidence não vazios, IDs Habbux novos,
sem sobrescrita, porta/spawn local e conectividade/desnível válidos. A declaração
é entrada de operador responsável; o gate não é verificador jurídico automático.
UNKNOWN/REFERENCE_ONLY continuam rejeitados. Não foi necessário duplicar o gate.

Teste dirigido Node 22/nice 19: **10 PASS**, zero falhas. Inclui rejeição de
proveniência incompleta/UNKNOWN, conectividade, IDs duplicados, compatibilidade
com TAB real do loader/legado e recusa de sobrescrita. Nenhum build completo,
Maven, deploy, commit, SQL de escrita ou alteração no Gallaxys foi executado
neste subtrabalho. Inventário e heightmaps permanecem nos destinos V3:
`docs/gallaxys-master-integration-v3/models-inventory.json` e backup operacional
referenciado em cada entrada. Alternativa ORIGINAL Habbux preservada.
