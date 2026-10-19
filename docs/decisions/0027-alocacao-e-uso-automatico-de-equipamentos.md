# ADR 0027 — Alocação e uso automático de equipamentos

## Contexto

A receita deve continuar reutilizável mesmo quando a confeitaria troca de forno, batedeira ou geladeira. Ao mesmo tempo, a agenda precisa saber qual máquina concreta ficará ocupada por uma tarefa e impedir que duas execuções disputem o mesmo recurso.

## Decisão

- Cada etapa da versão da receita pode declarar um **tipo de equipamento necessário**, nunca um ativo específico.
- A primeira fatia admite no máximo um tipo por etapa e considera que o equipamento fica ocupado durante toda a janela planejada da tarefa.
- Ao confirmar o pedido, o planejador procura um equipamento ativo daquele tipo e grava a alocação concreta na tarefa de produção.
- A alocação respeita o tenant, o estado do equipamento e a sobreposição das janelas das tarefas ainda abertas.
- Se não houver recurso livre, a necessidade permanece visível e sem equipamento atribuído. Iniciar ou retomar a tarefa tenta uma alocação tardia e bloqueia a ação quando o conflito continua.
- Uma sobreposição apenas planejada é apresentada como aviso; equipamento em manutenção, baixado ou já ocupado por tarefa em execução bloqueia o início.
- A conclusão da tarefa cria um `EquipmentUsage` imutável, ligado ao equipamento, à tarefa e ao pedido, com origem `production`.
- O identificador da tarefa também é a chave de idempotência do uso automático, evitando duplicidade em repetição de comando.
- O apontamento manual permanece disponível e é identificado pela origem `manual`.

## Linguagem e interação

A tela Hoje mostra uma faixa curta dentro do card da tarefa: nome do equipamento quando reservado, tipo necessário quando ainda não alocado e uma frase que explica a condição. Um bloqueio usa mensagem inline anunciável e oferece acesso direto a Equipamentos; nenhum conflito falha silenciosamente.

## Consequências

- A receita não fica presa ao patrimônio da empresa piloto.
- O plano passa a preservar o recurso concreto usado por aquela encomenda.
- O histórico do equipamento é alimentado pelo trabalho real sem exigir um segundo apontamento da proprietária.
- Capacidade maior que uma unidade, múltiplos equipamentos por etapa, indisponibilidade futura por intervalo e otimização paralela permanecem evoluções posteriores.
- “Receita dos pedidos apoiados” continua sendo um indicador não aditivo e não retorna ao consolidado financeiro.
