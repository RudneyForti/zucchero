# 0031 — Importação assistida de NFC-e

**Estado:** jornada implementada; adaptadores por origem aguardam amostras reais  
**Data:** 27 de agosto de 2026

## Contexto

A NFC-e pode reduzir digitação, mas páginas de consulta, conteúdo e mecanismos
de acesso variam por UF e estabelecimento. Associar silenciosamente uma linha a
um produto ou inventar validade criaria um risco maior que o ganho operacional.

## Decisão

- a câmera usa o leitor de QR Code disponível no navegador e sempre oferece a
  colagem da URL ou da chave como alternativa;
- a chave de 44 dígitos identifica o documento de forma única por tenant;
- a origem completa não é persistida: somente seu hash é guardado para
  correlação, enquanto a chave permanece protegida por RLS;
- quando a origem não entrega linhas de forma interoperável, a proprietária
  pode colar a transcrição apresentada pela nota em formato assistido;
- cada linha preserva descrição, GTIN, quantidade, unidade, valor e confiança;
- GTIN exato tem precedência; sem ele, uma semelhança de nome pode apenas
  sugerir uma apresentação comercial;
- a revisão exige uma escolha explícita por linha e permite informar validade e
  lote da embalagem;
- nenhuma captura altera estoque;
- a confirmação cria todos os lotes e movimentos numa única transação, associa
  o documento de origem, gera auditoria e aceita repetição sem duplicar entrada;
- a mesma chave confirmada não pode ser importada novamente pela empresa.

## Consequências

A jornada de captura, revisão e confirmação já pode ser usada e demonstrada sem
depender de um portal fiscal específico. O fluxo manual continua disponível e
inequívoco quando câmera ou extração não funcionarem.

O leitor automático de linhas por portal/UF não é declarado universal. Sua
calibração depende do conjunto anonimizado de documentos da empresa piloto. Os
adaptadores futuros entram antes da mesma revisão existente; não alteram o
domínio, a confirmação humana ou a criação transacional dos lotes.
