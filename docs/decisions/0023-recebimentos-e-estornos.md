# ADR 0023 — Recebimentos e estornos do pedido

## Contexto

O valor combinado com a cliente, o dinheiro efetivamente recebido e o valor líquido que permanece na confeitaria são fatos diferentes. Cartões podem cobrar taxas, a cliente pode pagar em mais de uma entrada e um lançamento incorreto precisa ser corrigido sem apagar o histórico.

## Decisão

- Um pedido pode receber várias entradas por Pix, cartão ou dinheiro.
- O saldo da cliente considera o valor bruto recebido. A taxa não volta a compor esse saldo.
- A taxa reduz o resultado realizado do pedido e permanece visível separadamente.
- Entradas são imutáveis. Uma correção cria um estorno compensatório ligado ao lançamento original.
- Um mesmo recebimento só pode ser estornado uma vez.
- Pedidos cancelados não aceitam novas entradas, mas seus recebimentos existentes podem ser estornados.
- Pedidos concluídos continuam aceitando recebimentos e estornos, pois encerrar a produção não significa encerrar o acerto com a cliente.
- A idempotência impede duplicidade causada por duplo clique ou repetição de rede.
- Todos os fatos financeiros respeitam o tenant corrente por RLS e geram evento de auditoria.

## Projeção apresentada à usuária

O detalhe do pedido usa três números primários: **combinado**, **já recebido** e **ainda falta**. Taxas e líquido aparecem como explicação secundária, preservando uma conversa cotidiana em vez de introduzir linguagem contábil prematuramente.

## Consequências

- O lucro realizado passa a considerar as taxas ativas de recebimento.
- A trilha financeira pode ser reconstruída e auditada sem depender de registros apagados.
- Custos gerais e despesas recorrentes continuam fora deste corte e serão tratados no módulo financeiro seguinte.
