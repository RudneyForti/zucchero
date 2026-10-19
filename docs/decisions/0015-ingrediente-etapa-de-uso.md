# ADR 0015 — Ingrediente ligado à etapa de uso

**Status:** aceito e implementado no primeiro corte  
**Data:** 26 de agosto de 2026

## Contexto

A receita já descrevia composição e sequência de preparo, mas esses dois conjuntos não se encontravam. Por isso, a ficha da bancada conseguia mostrar apenas os ingredientes do pedido completo e ainda não possuía base confiável para uma futura baixa por tarefa.

Vincular um ingrediente apenas ao momento seria insuficiente quando um momento contém várias tarefas. Também seria incorreto dividir uma quantidade automaticamente entre etapas sem conhecimento culinário.

## Decisão

Cada `recipe_line` aponta para a `recipe_step` em que aquela quantidade começa a ser utilizada. O editor traduz essa relação na pergunta “Em qual etapa este ingrediente entra?”, com uma lista pesquisável que combina momento e etapa.

Quando o mesmo grupo culinário entra em duas etapas, a pessoa cria duas linhas com suas respectivas quantidades. A soma continua formando a composição da receita, enquanto cada linha preserva uma origem operacional inequívoca.

Ao confirmar o pedido, `order_requirements.source_recipe_line_id` preserva a linha da versão imutável. A ficha da tarefa cruza essa origem com `production_task.source_recipe_step_id` e mostra apenas os requisitos ligados à tarefa atual.

Versões legadas podem manter `recipe_step_id` nulo. Se algum requisito do pedido não possuir uma associação completa, a ficha volta conscientemente para o escopo do pedido inteiro e comunica isso na interface, sem apresentar precisão artificial.

## Consequências

- composição, agenda e estoque passam a compartilhar a mesma origem versionada;
- o editor exige uma etapa de uso para novas receitas e versões;
- remover uma etapa reatribui, na interface, as linhas órfãs à primeira etapa restante para que a pessoa possa revisá-las;
- pedidos já confirmados não mudam quando uma nova versão da receita é publicada;
- a próxima evolução pode propor consumo por tarefa a partir das reservas do requisito, mantendo confirmação humana para quantidade usada e perda.
