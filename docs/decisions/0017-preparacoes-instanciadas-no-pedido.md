# ADR 0017 — Preparações instanciadas no pedido

**Status:** aceito e implementado no primeiro corte  
**Data:** 26 de agosto de 2026

## Contexto

Uma tarefa pode trabalhar diretamente no produto final ou produzir algo que será incorporado depois, como massa, ganache ou recheio. Representar ambos apenas pelo nome do momento deixa ambíguo o que existe durante a execução e pode fazer um componente exclusivo parecer um produto comercial ou um item disponível na despensa.

Inferir esse papel por palavras como “ganache” ou pelo tipo da tarefa seria frágil. A informação precisa nascer na versão da receita e permanecer congelada no pedido.

## Decisão

Cada `recipe_moment` declara seu `preparation_role`:

- `intermediate`: gera uma preparação intermediária exclusiva do pedido;
- `final`: continua trabalhando no produto final prometido à cliente.

Ao confirmar um pedido, o plano cria uma `preparation_instance` raiz para o produto final e uma instância filha para cada momento intermediário. Toda tarefa referencia exatamente uma dessas instâncias. A relação pai–filho preserva que “Ganache” pertence ao “Bolo de chocolate para Ana Paula”, sem transformar a ganache em item vendável independente.

As instâncias deste corte são sempre dedicadas ao pedido. Elas representam trabalho em processo e não criam lote, saldo ou disponibilidade na despensa. Produzir antecipadamente para vários pedidos exigirá um fluxo explícito de semielaborado com lote interno, validade, custo e reservas.

## Consequências

- a ficha da bancada comunica claramente o que está sendo produzido e para qual produto final;
- versões de receita preservam a classificação culinária sem inferência textual;
- tarefas, consumo e observações ficam rastreáveis até a preparação e o pedido;
- pedidos existentes são retrocompatíveis e recebem instâncias a partir de seus snapshots;
- sub-receitas, quantidade produzida e lotes internos continuam evoluções separadas.
