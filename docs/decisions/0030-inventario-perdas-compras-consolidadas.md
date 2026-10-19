# 0030 — Inventário, perdas e compras consolidadas

**Estado:** implementada no aprofundamento do Marco 1A  
**Data:** 27 de agosto de 2026

## Contexto

A quantidade reservável usada pelos pedidos não é suficiente para conferir a
prateleira. A proprietária precisa distinguir o que existe fisicamente, o que
já foi prometido e o que permanece livre, sem apagar a história quando uma
contagem divergir ou um produto for perdido.

As faltas também eram criadas por pedido. Sem uma projeção consolidada, a mesma
apresentação poderia aparecer várias vezes e exigir cálculo manual de
embalagens antes da compra.

## Decisão

- cada lote expõe `físico`, `reservado` e `livre`; somente `livre` atende um
  novo pedido;
- a contagem informa o total físico encontrado e gera apenas a diferença como
  `ADJUSTMENT_IN` ou `ADJUSTMENT_OUT`;
- uma contagem nunca pode reduzir o físico abaixo do que já está reservado;
- a perda gera `LOSS`, exige motivo e só alcança o saldo livre, preservando
  quantidades prometidas;
- comandos de contagem e perda carregam chave de idempotência por tenant;
- movimentos confirmados permanecem imutáveis e as ações geram auditoria;
- necessidades abertas são agrupadas por apresentação comercial, somadas por
  data e confrontadas com o estoque livre atual;
- a quantidade de embalagens é recalculada com arredondamento para cima e a
  ação da lista abre a entrada manual com produto e quantidade preenchidos;
- perda usa uma confirmação adicional, pois altera o saldo e não possui
  desfazer instantâneo na interface.

## Consequências

A Despensa passa a apoiar conferência real e compra cotidiana sem assumir que
marca e ingrediente são a mesma coisa. Reservas continuam protegidas mesmo
diante de perda ou divergência de inventário, e reenvios não duplicam baixas.

A lista é uma projeção viva de planejamento: uma compra suficiente reduz ou
remove a falta, mas ainda não remaneja automaticamente as reservas dos pedidos.
Essa alocação permanece explícita no ciclo do pedido para evitar uma associação
silenciosa com lote, validade ou marca inadequados.
