# ADR 0020 — Divergência entre planejado e realizado

## Contexto

O apontamento por tarefa já preserva quantidade planejada, uso real, perda e correções compensatórias. Exibir somente esses números obriga a proprietária a fazer a comparação mental durante a produção e dificulta perceber desvios recorrentes de rendimento.

## Decisão

A divergência será uma projeção derivada, não um novo fato persistido. Para cada ingrediente, tarefa e pedido:

- realizado = usado efetivo + perda efetiva;
- diferença = realizado − planejado;
- percentuais usam a quantidade planejada como base;
- a visão efetiva considera a linha da correção mais recente, sem alterar o apontamento original.

Uma tolerância operacional evita transformar variações normais de balança em alerta: diferenças absolutas de até 2% do planejado, com mínimo de 1 g, são classificadas como “dentro do esperado”. Acima disso, a projeção indica “acima” ou “abaixo” do previsto.

Na ficha da tarefa, a interface apresenta planejado, usado, perda, diferença e uma frase culinária curta. No detalhe do pedido, a mesma leitura é consolidada e informa quantos ingredientes já foram apontados. Um consolidado parcial é nomeado como parcial; ele não se passa por fechamento definitivo.

## Consequências

- correções aparecem automaticamente na análise sem regravar agregados;
- uso e perda permanecem separados, evitando tratar perda como ingrediente incorporado ao produto;
- o pedido passa a oferecer uma leitura operacional antes do fechamento financeiro;
- análises por receita e período poderão reutilizar a mesma regra;
- custos realizados ainda dependem da valoração dos lotes consumidos e pertencem ao próximo aprofundamento financeiro.
