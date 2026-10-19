# ADR 0032 — Receitas compostas, conversões e precedências executáveis

**Estado:** aceito e implementado em 27 de agosto de 2026.

## Contexto

A receita-base precisa continuar sendo o produto repetível do caderno, sem receber o nome da cliente. Ao mesmo tempo, preparos reutilizáveis como ganache, recheio ou massa podem ser receitas publicadas independentes e participar de outra receita. Quantidades originalmente medidas em volume ou unidade também precisam chegar ao cálculo em gramas sem esconder a regra usada.

Uma lista visual de etapas não basta para planejar a cozinha: massa e ganache podem começar em paralelo, enquanto a montagem depende das duas. Essa relação deve sobreviver à confirmação do pedido e orientar quais tarefas realmente ficam disponíveis.

## Decisão

- Toda versão registra as quantidades normalizadas em gramas e preserva quantidade original, unidade, fator, fonte e confiança da conversão.
- `ml` e `unidade` exigem fator e fonte explícitos; `g`, `kg` e `mg` usam fatores padronizados.
- Uma receita composta referencia somente uma versão publicada e imutável de outra receita, informa o rendimento necessário e o momento em que o componente será utilizado.
- O editor impede autorreferência, duplicidades e ciclos nas precedências. A execução também verifica ciclos entre receitas como defesa adicional.
- Na confirmação, ingredientes de componentes são explodidos recursivamente e escalados pelo rendimento necessário antes do cálculo, reserva FEFO e lista de compras.
- O plano cria uma `preparation_instance` intermediária para cada ocorrência da receita componente, ligada ao produto final. As tarefas preservam a etapa e a versão de origem.
- Precedências da versão viram `production_task_dependencies`. Tarefas sem pré-requisito podem iniciar em paralelo; uma sucessora só é liberada quando todos os seus predecessores terminam.
- Versões legadas sem grafo explícito recebem uma cadeia sequencial compatível, também persistida no pedido.

## Consequências

O caderno permanece limpo — “Bolo de chocolate”, não “Bolo da Marina” — enquanto o pedido mantém a ocorrência destinada à cliente. O custo, o estoque e a ficha de preparo incluem componentes sem apresentá-los como pedidos independentes. O início recomendado passa a usar o caminho crítico do grafo, em vez da soma obrigatoriamente sequencial de todas as etapas.

A produção antecipada de um semielaborado para atender vários pedidos ainda exige lote interno e política de alocação próprios; este ADR cobre componentes dedicados ao pedido.
