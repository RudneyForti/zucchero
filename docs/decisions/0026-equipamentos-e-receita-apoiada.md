# ADR 0026 — Equipamentos, manutenção e receita apoiada

## Contexto

Forno, batedeira e geladeira são companheiros duráveis da produção. A proprietária precisa lembrar aquisições, cuidados e participação nas encomendas, mas atribuir toda a receita a uma máquina produziria uma falsa leitura de faturamento: o mesmo pedido normalmente utiliza vários equipamentos.

## Decisão

- O equipamento possui identidade própria, tipo, marca/modelo opcionais, aquisição conhecida, estado e observações de rotina.
- Manutenções formam um histórico imutável com data, serviço, custo, responsável opcional e próximo cuidado.
- Um uso pode ser geral ou ligado a um pedido e registra data, duração aproximada e observação.
- A interface usa o termo **receita dos pedidos apoiados**. O valor é a soma dos pedidos distintos ligados aos usos daquele equipamento.
- O mesmo pedido pode apoiar a leitura individual de vários equipamentos; por isso, valores entre equipamentos não são aditivos e nunca voltam ao consolidado financeiro.
- Aquisição somada à manutenção é uma leitura gerencial de valor conhecido. Não representa lucro, retorno, imobilizado ou depreciação contábil.
- Colocar um equipamento em manutenção impede novos apontamentos manuais de uso; baixar preserva todo o histórico.
- Cadastros, manutenções e usos aceitam idempotência, geram auditoria e são isolados por tenant com RLS.

## Linguagem da interface

A tela trata máquinas como “companheiras das mãos” e usa uma grade fluida de cartões narrativos — três colunas no desktop, duas no tablet e uma no celular —, histórico progressivo expandido dentro do próprio cartão e diálogos curtos. O resumo começa pelo estado da cozinha; valores aparecem como contexto, sem grade contábil ou aparência de ERP.

## Consequências

- A proprietária enxerga quanto conhece do investimento e dos cuidados de cada recurso.
- A participação comercial fica útil sem prometer causalidade ou dupla contagem financeira.
- O vínculo automático por tarefa e o primeiro conflito operacional foram aprofundados no [ADR 0027](0027-alocacao-e-uso-automatico-de-equipamentos.md). Capacidade avançada, indisponibilidade programada, depreciação e retorno gerencial permanecem evoluções posteriores.
- O custo da manutenção ainda não cria uma despesa financeira automaticamente; a futura integração deverá pedir confirmação e preservar os dois históricos.
