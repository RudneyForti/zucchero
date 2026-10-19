# 0008 — Simulação de escala e fracionamento

**Estado:** implementada no Marco 1B  
**Data:** 25 de agosto de 2026

## Decisão

A ficha da receita oferece uma simulação local e reversível. A usuária informa o
rendimento desejado em gramas e recebe imediatamente:

- fator proporcional da receita;
- custo estimado para o novo rendimento;
- porções aproximadas, quando conhecidas;
- quantidade proporcional de cada ingrediente.

A simulação não altera a versão publicada nem arredonda silenciosamente as
quantidades. Ela será reutilizada pelo item da encomenda, que congelará fator,
versão e custos quando o pedido for confirmado.

## Limites deste incremento

Regras de lote mínimo, embalagens inteiras, conversões por densidade e
arredondamentos específicos permanecem explícitas no próximo aprofundamento do
Marco 1B. Até lá, a projeção é identificada como estimativa proporcional.
