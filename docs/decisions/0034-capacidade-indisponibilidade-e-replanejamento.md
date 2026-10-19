# ADR 0034 — Capacidade, indisponibilidade e replanejamento

**Estado:** aceito e implementado em 27 de agosto de 2026.

## Contexto

Um forno pode acomodar mais de um preparo e também pode ficar indisponível por manutenção ou uso pessoal. Tratar todo equipamento como exclusivamente livre ou ocupado criaria conflitos falsos; ignorar bloqueios futuros prometeria prazos inviáveis.

## Decisão

- Cada equipamento declara uma capacidade inteira de preparos simultâneos.
- Períodos de indisponibilidade possuem início, fim e motivo, são isolados por tenant e auditados.
- A alocação aceita sobreposição somente enquanto a capacidade não for excedida e exclui qualquer intervalo bloqueado.
- A bancada revalida estado, capacidade e indisponibilidade antes de iniciar uma tarefa.
- O replanejamento valida todas as tarefas afetadas e é recusado integralmente quando produzir conflito, preservando o plano anterior.
- A interface mostra capacidade e bloqueios futuros em linguagem operacional, sem tratar equipamentos como contabilidade patrimonial formal.

## Consequências

O prazo sugerido passa a refletir gargalos concretos com uma regra compreensível. Otimização global entre muitos pedidos, múltiplos recursos simultâneos na mesma etapa e simulação de cenários continuam como aprofundamentos, não como requisito do fluxo atual.
