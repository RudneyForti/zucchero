# ADR 0014 — Ficha de preparo e observação operacional

**Status:** aceito e implementado no primeiro corte  
**Data:** 25 de agosto de 2026

## Contexto

A bancada persistida já permitia avançar a tarefa em foco, mas o comando “Ver preparo” não entregava contexto suficiente para a execução. A pessoa precisava consultar a instrução, entender as quantidades escaladas e registrar um lembrete sem abandonar o fluxo do dia.

Ao mesmo tempo, a versão atual da receita relaciona ingredientes ao produto completo, não a cada etapa. Exibir uma quantidade como se pertencesse exclusivamente à massa, ganache ou montagem criaria uma precisão inexistente no domínio.

## Decisão

A ficha da tarefa reúne três blocos:

- **como fazer**, com a instrução preservada na tarefa;
- **ingredientes do pedido**, com quantidade requerida, apresentação preferencial, reserva e falta conhecidas para o produto completo;
- **observação deste preparo**, persistida por tarefa e atualizável durante a execução.

A interface declara explicitamente que os insumos ainda representam o pedido inteiro. O estado de disponibilidade deriva dos requisitos e das reservas ativas do pedido, sem efetuar baixa de estoque ao abrir a ficha.

Cada tarefa pode manter uma observação operacional atual. A gravação é isolada por tenant, registrada em auditoria sem copiar o conteúdo da observação para o evento e limitada a 1.000 caracteres. A observação é interna e não substitui comunicação ou anotações de cliente.

## Consequências

- a ficha passa a apoiar a execução real sem exigir navegação para Receita ou Despensa;
- a disponibilidade permanece coerente com as reservas do pedido;
- recarregar a página não perde a observação da tarefa;
- a UI não afirma consumo por etapa antes de o modelo de receita suportar essa associação;
- o próximo aprofundamento deve ligar linhas de receita a momentos ou tarefas antes de habilitar confirmação e ajuste de consumo por tarefa.
