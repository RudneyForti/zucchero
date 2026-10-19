# ADR 0025 — Financeiro mensal por compromisso e movimento de caixa

## Contexto

Uma conta de aluguel de agosto e o pagamento feito em setembro respondem a perguntas diferentes. Se forem tratados como o mesmo registro, a aplicação distorce tanto o custo esperado do mês quanto o dinheiro efetivamente disponível.

## Decisão

- A despesa operacional representa o compromisso e possui categoria, competência, vencimento e valor previsto.
- O pagamento é um fato imutável, com valor e data próprios; uma conta aceita pagamentos parciais.
- Correções financeiras criam um estorno compensatório ligado ao pagamento original.
- Recorrência é uma regra de projeção. Ela sugere o compromisso do mês seguinte, mas nunca cria um pagamento automaticamente.
- A visão mensal separa:
  - recebimentos brutos de pedidos;
  - taxas desses recebimentos;
  - pagamentos operacionais efetivamente realizados no mês;
  - compromissos da competência e valores ainda em aberto.
- Categoria expressa a natureza do gasto, como aluguel, gás, internet ou contabilidade; fornecedor é um atributo separado.
- Criação de compromisso, instanciação de recorrência e pagamento usam idempotência; todos os dados permanecem isolados por tenant com RLS e ações críticas geram auditoria.

## Linguagem da interface

A tela começa por uma frase de caixa — “entraram, saíram, ficaram/faltaram” — e só depois abre os detalhes. O objetivo é apoiar a decisão cotidiana, sem reproduzir a aparência ou o vocabulário de um ERP contábil.

## Consequências

- A proprietária entende o caixa sem perder a leitura dos compromissos futuros.
- Pagamentos em parcelas e pagamentos fora da competência continuam corretos.
- A recorrência apoia memória e planejamento sem inventar fatos financeiros.
- Rateio contábil, conciliação bancária e competência formal avançada permanecem fora deste corte.
- Comparação mensal, consolidação por categoria e exportação foram aprofundadas no [ADR 0028](0028-comparacao-categorias-exportacao-financeira.md).
