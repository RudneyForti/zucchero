# 0009 — Primeira fatia de Pedidos

**Status:** implementada; persistência aprofundada na decisão 0010  
**Data:** 25/08/2026

## Decisão

A primeira fatia navegável de Pedidos segue a jornada aprovada em quatro passos:

1. cliente e modalidade de entrega;
2. receita, versão, rendimento e compromisso;
3. disponibilidade e necessidade de compra;
4. custos, margem, preço, sinal e forma de pagamento.

O fluxo fica numa única bancada progressiva. Somente o passo atual exibe campos;
a trilha mantém orientação e permite voltar a uma etapa já visitada.

## Snapshot e escala

O item usa uma versão publicada e apresenta explicitamente o número que será
preservado. O peso solicitado é arredondado para cima em incrementos produtivos
de 50 g. O sistema mostra peso solicitado, peso planejado, fator da receita e
eventual sobra técnica, sem alterar a receita original.

## Disponibilidade

Cada necessidade considera a escala e a perda prevista do ingrediente. A
leitura respeita a política cadastrada na receita:

- genérica: usa a disponibilidade total do grupo culinário;
- preferencial: sinaliza substituição quando outra apresentação precisa
  completar a quantidade;
- obrigatória: usa somente a apresentação escolhida.

Faltas são convertidas em embalagens comerciais inteiras, sempre arredondadas
para cima. Nesta fatia, rótulos em `g`, `kg`, `ml` e `L` são reconhecidos; a
conversão demonstrativa de volume usa `1 ml = 1 g`. Densidades específicas e
unidades culinárias explícitas permanecem para o aprofundamento de conversões.

## Preço

O preço sugerido segue a regra aprovada:

`preço = custo total ÷ (1 − margem desejada)`

Margem permanece o conceito principal. Lucro estimado e markup são derivados e
aparecem como explicação, não como campos concorrentes.

## Evolução

A confirmação deixou de existir somente na sessão do navegador. Contratos,
migrations, idempotência e persistência transacional estão descritos em
[0010 — Pedidos transacionais](0010-pedidos-transacionais.md).
