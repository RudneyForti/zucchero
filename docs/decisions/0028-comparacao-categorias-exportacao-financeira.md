# ADR 0028 — Comparação, categorias e exportação financeira

## Contexto

A leitura de um único mês explica o caixa atual, mas não responde se a operação melhorou nem quais compromissos mais pesam. Uma grade contábil resolveria isso às custas da experiência acolhedora aprovada para a proprietária.

## Decisão

- O Financeiro compara o mês selecionado com o mês imediatamente anterior.
- A comparação usa movimento de caixa: recebimentos efetivos, taxas e pagamentos operacionais pelas respectivas datas.
- Diferenças são sempre apresentadas com valor atual, valor anterior e variação escrita; cor não carrega o significado sozinha.
- Contas da competência selecionada são agrupadas por categoria e ordenadas pelo valor previsto.
- Cada categoria preserva contagem de contas, previsto, pago, saldo em aberto e participação percentual.
- A barra horizontal é apenas um auxílio de proporção; rótulos e valores exatos permanecem visíveis.
- A exportação mensal usa CSV com separador `;`, valores em formato brasileiro, BOM UTF-8 e neutralização de fórmulas em conteúdo textual.
- O arquivo é produzido pela API dentro do contexto do tenant e entregue pela aplicação web sem expor a API ou o identificador demonstrativo ao navegador.

## Linguagem da interface

A página continua começando pela história do caixa. Comparação e categorias aparecem como duas leituras editoriais abaixo da previsão do mês, sem KPIs soltos, gráficos decorativos ou tabela densa. “Exportar mês” é uma ação secundária; registrar uma despesa continua sendo a ação principal.

## Consequências

- A proprietária percebe mudança entre meses sem precisar fazer contas mentalmente.
- A natureza dos gastos fica visível sem confundir categoria com fornecedor.
- O fechamento pode ser aberto no Excel ou enviado à contabilidade mantendo a origem reconstruível.
- Comparação com média móvel, orçamento por categoria, PDF e integração contábil permanecem evoluções posteriores.
