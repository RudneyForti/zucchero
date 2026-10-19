# 0012 — Ciclo de vida do pedido

**Status:** implementada  
**Data:** 25/08/2026

## Decisão

Depois da confirmação, a encomenda avança por uma sequência curta e legível:

`confirmado → na bancada → pronto → concluído`

O cancelamento é uma saída alternativa permitida enquanto o pedido estiver
ativo. Estados encerrados não voltam para etapas anteriores. A interface usa a
mesma linguagem em cartões, diálogo de detalhes e projeção da tela Hoje.

## Responsabilidade de cada estado

- **Confirmado:** compromisso comercial registrado, versão da receita
  preservada, estoque reservável comprometido e faltas enviadas para compras.
- **Na bancada:** a execução começou. O aprofundamento do módulo Produção
  detalhará tarefas, esperas e apontamentos sem criar novos estados comerciais.
- **Pronto:** produto acabado aguardando retirada ou entrega.
- **Concluído:** entrega encerrada. Reservas ativas são conciliadas por um
  movimento `RELEASE` seguido do movimento definitivo `CONSUME`.
- **Cancelado:** compromisso encerrado sem consumo. Reservas ativas recebem
  movimentos compensatórios `RELEASE` e faltas abertas são canceladas.

## Estoque e rastreabilidade

Movimentos anteriores nunca são apagados. Tanto a conclusão quanto o
cancelamento marcam as reservas como liberadas e criam fatos compensatórios. A
conclusão mantém a disponibilidade líquida já comprometida, pois a liberação é
imediatamente substituída pelo consumo. O cancelamento devolve a quantidade à
disponibilidade.

Cada transição grava data própria e evento de auditoria. O cancelamento exige
motivo, preservado com o pedido. Repetir o estado atual é idempotente; tentar
pular ou voltar etapas recebe conflito.

## Interface

O cartão inteiro abre o diálogo “Cuidar do pedido”. A visão mostra o combinado,
uma trilha curta de quatro momentos e uma única ação principal correspondente
ao próximo passo. O cancelamento permanece secundário e só apresenta o campo de
motivo após intenção explícita.

Pedidos concluídos e cancelados saem da fila ativa, mas continuam acessíveis no
histórico recente. A tela Hoje passa a projetar os pedidos ativos reais e suas
faltas conhecidas, mantendo o card demonstrativo da tarefa culinária até o
módulo Produção assumir essa origem de dados.

## Limite deste corte

Consumo ajustado por lote, registro de perdas, pagamento, prova de entrega e
plano de tarefas permanecem nas próximas fatias. Por enquanto, concluir o
pedido consolida como consumo as quantidades anteriormente reservadas.
