# ADR 0019 — Correção compensatória do consumo

**Status:** aceito e implementado no primeiro corte  
**Data:** 26 de agosto de 2026

## Contexto

Uma pesagem pode ser conferida novamente depois da confirmação do consumo. Alterar `production_task_consumptions` ou apagar movimentos destruiria a evidência do que foi registrado na operação e poderia modificar estoque e custo sem explicação.

## Decisão

O apontamento original permanece imutável. Cada revisão cria um cabeçalho `production_consumption_correction`, com tarefa, motivo e instante, e uma linha por ingrediente alterado. A linha preserva valores anteriores, valores corrigidos e deltas separados de usado e perda.

A diferença líquida entre o total anterior e o corrigido é a única que altera o saldo físico:

- aumento cria `CONSUME` ou `LOSS` adicional em lotes disponíveis por FEFO;
- redução cria `RETURN_IN` nos lotes ligados ao histórico do apontamento;
- reclassificação entre usado e perda com total igual não cria movimento físico.

Cada correção é transacional, exige motivo e gera `PRODUCTION_CONSUMPTION_CORRECTED` na auditoria. Os valores atuais da ficha são derivados da revisão mais recente; o registro original nunca é sobrescrito.

## Consequências

- estoque, custo e histórico permanecem reconciliáveis;
- uma correção adicional que exceda o saldo conhecido é recusada e orienta a ajustar a despensa;
- a interface apresenta a correção como ação secundária e explica que o passado será preservado;
- análises futuras devem usar os valores efetivos da última revisão, mantendo acesso ao original e aos deltas;
- tarefas concluídas podem ser corrigidas pelo domínio, embora o primeiro acesso visual esteja na tarefa ainda aberta da tela Hoje.
