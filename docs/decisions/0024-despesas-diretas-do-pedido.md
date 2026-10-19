# ADR 0024 — Despesas diretas e reconciliação do orçamento

## Contexto

O pedido já preserva um valor estimado para embalagem, entrega e outros custos adicionais. Registrar posteriormente o gasto real como uma simples soma produziria dupla contagem quando ele já estivesse contemplado no orçamento.

## Decisão

- Cada despesa direta registra valor real, categoria, descrição, data e observação opcional.
- A usuária informa se o gasto já estava previsto e, nesse caso, qual parcela do orçamento ele reconcilia.
- O custo adicional reconhecido é `orçamento original + soma(valor real - parcela prevista)`.
- Um gasto não previsto usa parcela prevista igual a zero e aumenta integralmente o custo realizado.
- A soma das parcelas previstas ativas não pode ultrapassar o custo adicional preservado no pedido.
- Despesas são fatos imutáveis; uma correção cria um estorno compensatório ligado ao lançamento original.
- Idempotência, RLS por tenant e auditoria seguem as mesmas garantias dos recebimentos.

## Exemplo

Uma entrega custou R$ 15 e tinha R$ 12 reservados no orçamento. A projeção aumenta o custo em R$ 3. Se essa entrega não estivesse prevista, o ajuste seria de R$ 15.

## Consequências

- A margem realizada responde aos gastos conhecidos sem reescrever o orçamento confirmado.
- A parte ainda não reconciliada do orçamento continua preservada, evitando que uma conferência parcial reduza artificialmente o custo.
- Despesas recorrentes da empresa permanecem fora do pedido e serão tratadas no próximo corte financeiro.
