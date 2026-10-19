# 0010 — Pedidos transacionais

**Status:** implementada  
**Data:** 25/08/2026

## Decisão

A confirmação de uma encomenda passa a ser um fato transacional do módulo
Pedidos. O navegador envia intenção e parâmetros; a API recalcula escala,
necessidades, custo e preço antes de persistir qualquer dado.

Uma confirmação grava, na mesma transação:

- pedido e snapshot de cliente, entrega, pagamento, custos, margem e preço;
- item com a versão publicada da receita, peso pedido e peso planejado;
- necessidades por grupo culinário e política de apresentação;
- reservas FEFO por lote disponível;
- movimentos imutáveis `RESERVE` para refletir a quantidade comprometida;
- faltas consolidadas em embalagens comerciais inteiras;
- evento de auditoria `ORDER_CONFIRMED`.

Se uma dessas gravações falhar, nenhuma delas é confirmada.

## Versão e cálculo

O pedido referencia a versão exata da receita e também preserva os valores
calculados. Publicar uma versão posterior não altera pedidos antigos. O preço é
sempre recalculado no servidor pela regra:

`preço = custo total ÷ (1 − margem desejada)`

## Reserva e compra

Os lotes elegíveis são consumidos virtualmente pela validade mais próxima e,
em caso de empate, pela entrada mais antiga. A reserva não representa consumo
físico: ela apenas impede que a mesma quantidade seja prometida a duas
encomendas. O consumo definitivo será lançado pelo módulo Produção.

Quando a quantidade reservável não cobre a receita, a diferença gera uma
necessidade de compra. A quantidade sugerida respeita o conteúdo líquido da
apresentação comercial e sempre arredonda para embalagens inteiras.

## Idempotência

Cada tentativa possui uma chave UUID única por empresa. Repetir a mesma
requisição devolve o pedido já confirmado, sem criar outro número, reserva,
movimento ou necessidade de compra.

## Isolamento

Clientes, endereços, sequência de numeração, pedidos, itens, necessidades,
compras e reservas usam `tenant_id`, chaves estrangeiras compostas e RLS
forçado. A numeração é sequencial dentro de cada empresa, não global.

## Limite deste corte

Cancelamento com estorno de reservas, mudança de status, baixa de produção e
consolidação de compras entre vários pedidos entram nas próximas fatias. Como
os movimentos são fatos imutáveis, essas operações serão compensatórias e não
excluirão o histórico.
