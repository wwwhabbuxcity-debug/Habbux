# ADR 0024 — Migração seletiva de recursos Gallaxys

## Decisão

Habbux continua usando código/protocolo próprios. A autorização V5 do proprietário
permite migrar recursos próprios e conjuntos de terceiros com licença compatível.
Dados de modelos correspondentes ao banco distribuído GPL do Polaris são
convertidos offline em TSV separado. Defaults e sequências Move GPL do renderer
são convertidos em JSON nativo separado, carregado uma vez; fontes/licenças são
servidas junto dos recursos. Nenhuma biblioteca/algoritmo Gallaxys é ligado ao
runtime Habbux, e a licença de dados não é atribuída aos PNGs externos.

Geometria desconectada é preservada quando tem spawn local: pathfinding continua
rejeitando destinos inacessíveis. Padding de linhas curtas acrescenta apenas
tiles bloqueados ausentes; símbolos inválidos e portas sem spawn são rejeitados.
O gate V3 continua estrito por padrão; a política de preservação é explícita V5.

Texturas nativas usam fontes compartilhadas, limite de duas superfícies,
proveniência/autorização/SHA-256, PNG limitado antes de decode, timeout/cancelamento,
matrizes do plano isométrico e geometria estática. A declaração específica da
proprietária inclui os três mapas custom e os PNGs de piso/parede: 6 pisos e
52 papéis são convertidos com pixels preservados. Metadata de 220 variantes
mantém GPL e fonte correspondente; os pixels têm autorização própria declarada.
O ornamento de coração anterior fica arquivado, sem aplicação automática.

Os modelos migrados conservam níveis lógicos e projetam cada nível em 32 px,
com altura de parede 3,6 e espessuras 0,25, conforme a referência. Piso, avatar,
hover e câmera recebem a mesma configuração. Os modelos anteriores mantêm
sua projeção; não há mudança no algoritmo de movimento ou no protocolo.

## Consequências

Sem SQL/importação Nitro no movimento. IDs anteriores e cache/foot anchor/pré-anúncio
permanecem. Arquivos de fonte GPL e ferramentas de reprodução acompanham os dados;
não são fonte da aplicação inteira nem assets carregados no ticker. Interpretação
de escopo documentada por conjunto, sem declarar que posse do servidor libera
gráficos de terceiros. Modelos/artes específicos sem prova ficam pendentes.
GPU física e comparação de quartos Gallaxys autenticados exigem validação própria.
