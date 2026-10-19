# ADR 0016 — Consumo real por tarefa

**Status:** aceito e implementado no primeiro corte  
**Data:** 26 de agosto de 2026

## Contexto

A reserva feita na confirmação do pedido indica o lote e a quantidade planejada, mas não prova quanto entrou de fato no preparo. Concluir o pedido consumindo toda a reserva esconderia sobras e perdas, distorcendo estoque e custo realizado.

O vínculo entre linha de receita, requisito do pedido e tarefa já permite saber quais ingredientes pertencem à etapa atual. O apontamento precisa aproveitar essa origem sem criar uma segunda baixa quando o pedido for concluído.

## Decisão

Antes de concluir uma tarefa que possui ingredientes mapeados, a pessoa confirma, para cada requisito:

- quantidade planejada;
- quantidade realmente usada;
- perda ocorrida.

A soma de usado e perda não pode superar a quantidade reservada. A transação registra um `production_task_consumption`, libera integralmente as reservas ativas da etapa e cria movimentos imutáveis `CONSUME` e `LOSS` nos lotes selecionados por FEFO. A diferença não utilizada volta a ficar disponível porque a reserva foi liberada sem uma baixa correspondente.

O apontamento é idempotente e não pode ser alterado silenciosamente. A correção compensatória foi detalhada posteriormente no ADR 0019 e produz novo fato de ajuste, preservando o original. Na conclusão comercial, somente reservas ainda ativas são conciliadas, impedindo consumo duplicado.

Versões antigas sem mapeamento completo continuam no fluxo legado por pedido e não recebem precisão artificial por tarefa.

## Consequências

- a tela Hoje compara planejado, usado e perda sem exigir navegação para a Despensa;
- uma tarefa com ingredientes mapeados fica bloqueada até a confirmação completa;
- lote, tarefa, requisito e pedido permanecem rastreáveis;
- sobra reservada retorna à disponibilidade imediatamente;
- divergências passam a alimentar análise futura de rendimento e custo;
- correções posteriores seguem o fluxo compensatório do ADR 0019.
