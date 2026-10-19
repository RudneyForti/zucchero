# ADR 0013 — Plano de produção e bancada persistida

**Status:** aceito e implementado no primeiro corte  
**Data:** 25 de agosto de 2026

## Contexto

O pedido confirmado já preservava receita, preço, disponibilidade e reservas, mas a tela Hoje ainda simulava uma tarefa culinária. Isso permitia demonstrar o visual, porém não oferecia continuidade operacional nem garantia que o estado da produção e o estado comercial do pedido permanecessem coerentes.

## Decisão

Ao confirmar cada item do pedido, o módulo Pedidos instancia um `production_plan` a partir da versão imutável da receita. Cada momento vira um `production_moment` e cada etapa vira uma `production_task`, preservando nomes, instruções, tipo, duração e horários planejados.

O primeiro planejador trabalha de trás para frente a partir da entrega, desconta um buffer de 60 minutos e agenda as etapas sequencialmente. A marcação `parallelizable` é preservada, mas ainda não é usada para otimização automática.

A tarefa em foco pode ser iniciada, colocada em espera, retomada e concluída. O início da primeira tarefa move o pedido para `in_production`; a conclusão de todas as tarefas move o plano e o pedido para `ready`. Cancelamento e conclusão comercial propagam seus estados ao plano sem apagar tarefas já concluídas.

A tela Hoje mostra uma única tarefa em foco e usa a trilha de momentos para o avanço do mesmo produto. A fila abaixo contém somente outros pedidos.

## Consequências

- o andamento sobrevive a recarregamentos e pode ser auditado;
- pedido, versão de receita e produção permanecem ligados pelo mesmo tenant;
- o fluxo fica simples para operação unipessoal e ainda permite evolução modular;
- sub-receitas, instâncias de preparações intermediárias, dependências explícitas, capacidade de equipamentos, consumo por tarefa e replanejamento ficam fora deste primeiro corte;
- o consumo de estoque continua consolidado ao concluir o pedido, evitando antecipar uma baixa fina sem interface de conferência.
