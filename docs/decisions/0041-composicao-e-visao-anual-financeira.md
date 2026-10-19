# ADR 0041 — Composição do caixa e visão anual financeira

## Contexto

A leitura mensal já separa recebimentos, taxas, pagamentos e compromissos, mas não mostra com clareza quais origens formam as entradas nem como os gastos pagos se distribuem. Também falta uma leitura contínua dos doze meses.

## Decisão

- O período financeiro pode alternar entre mês e ano sem criar uma regra paralela de cálculo.
- A composição usa somente movimentos efetivos de caixa:
  - entradas são agrupadas pela forma de recebimento registrada no pedido;
  - gastos são agrupados pela categoria da conta paga;
  - taxas dos recebimentos aparecem como uma categoria própria de gasto.
- Previsto e em aberto permanecem separados da composição efetiva e continuam identificados como compromissos.
- A visão anual consolida os doze meses em uma única consulta dentro do tenant.
- Cada mês escreve os valores exatos de entrada e gasto e usa barras horizontais apenas como apoio visual.
- A composição escreve categoria, valor, percentual e quantidade de movimentos; cor nunca é o único portador de significado.
- Selecionar um mês na visão anual abre a leitura mensal correspondente.

## Linguagem da interface

O gráfico é apresentado como “De onde veio e para onde foi”, mantendo o tom editorial do Zucchero. A visão anual começa pela frase de caixa, percorre os doze meses e só então detalha a composição, sem grade genérica de indicadores.

## Consequências

- Os totais da composição reconciliam com a frase de caixa.
- A proprietária diferencia dinheiro movimentado de obrigações previstas.
- A visão anual permite perceber sazonalidade sem abandonar os valores exatos.
- Categorias próprias de receita, orçamento anual e exportação consolidada permanecem evoluções futuras.
