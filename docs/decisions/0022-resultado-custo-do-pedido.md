# 0022 — Resultado de custo do pedido

## Status

Aceita e implementada no primeiro corte do Marco 1F.

## Contexto

O pedido já preservava o custo estimado na confirmação. A produção também registrava uso, perda e correções por movimentos imutáveis, enquanto cada lote mantinha seu custo unitário. Persistir um segundo total realizado criaria risco de divergência entre o estoque e o financeiro.

## Decisão

`OrderCostResult` é uma projeção derivada, não uma nova entidade persistida.

O custo realizado dos ingredientes é a soma do valor dos movimentos `CONSUME` e `LOSS` ligados ao pedido, usando o custo unitário do lote efetivamente movimentado. `RETURN_IN` de correções compensatórias reduz esse valor. Reservas e liberações não têm efeito financeiro.

Os custos adicionais informados na confirmação permanecem no snapshot do pedido e entram tanto no total estimado quanto no total realizado quando o consumo estiver completo.

A projeção possui quatro estados:

- `not_started`: nenhum ingrediente foi apontado;
- `partial`: há custo conhecido, mas faltam ingredientes;
- `complete`: todos os requisitos foram conciliados;
- `cancelled`: custos incorridos são preservados, sem projetar lucro final.

Lucro, margem e diferença realizados somente são apresentados no estado completo. Antes disso, a interface mostra o custo parcial conhecido e mantém lucro e margem claramente rotulados como previstos.

## Consequências

- mudanças de custo aparecem pela história real dos lotes, sem regravar o pedido;
- perdas entram no custo do pedido, pois consumiram estoque adquirido;
- correções alteram o resultado pela mesma trilha compensatória do estoque;
- pedidos antigos concluídos por consumo consolidado continuam projetáveis;
- recebimentos, taxas de pagamento, despesas atribuídas e seus estornos permanecem como próximos incrementos do Marco 1F.
