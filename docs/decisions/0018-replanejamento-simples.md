# ADR 0018 — Replanejamento simples da produção

## Contexto

Depois da confirmação, a cliente pode antecipar ou adiar a entrega. Recriar o pedido apagaria a relação com estoque e execução; deslocar tudo sem critério reescreveria trabalho que já aconteceu.

## Decisão

O ajuste nasce no detalhe do pedido e altera o compromisso de entrega e os planos ativos na mesma transação. O planejador mantém tarefas `em andamento`, `aguardando` ou `concluídas` com seus horários planejados e reais. Somente tarefas `planejadas` ou `disponíveis` são recalculadas, em sequência e de trás para frente a partir da nova entrega e do buffer do plano.

Cada plano incrementa `planning_version`. Um evento `ORDER_PRODUCTION_REPLANNED` preserva prazo anterior, novo prazo, motivo opcional, versões afetadas e quantidade de tarefas movidas. Se o novo horário colidir com a fronteira do trabalho já executado ou em curso, toda a transação é recusada.

## Consequências

- consumo, perda, observações e horários reais nunca são reescritos;
- pedido, plano, momentos e tarefas futuras permanecem coerentes;
- a interface explica o impacto antes da confirmação e mantém o ajuste como ação secundária;
- o planejador continua sequencial e não resolve capacidade, paralelismo ou conflitos entre pedidos;
- revisões são rastreáveis pelo número da versão e pela auditoria imutável.
