-- A receita é o modelo reutilizável; cliente e ocasião pertencem ao pedido.
-- Corrige somente o registro demonstrativo conhecido do tenant piloto.
update recipes
set name = 'Bolo de chocolate',
    normalized_name = 'bolo de chocolate',
    updated_at = now()
where id = '81111111-1111-4111-8111-111111111111'
  and tenant_id = '11111111-1111-4111-8111-111111111111'
  and normalized_name = 'bolo de chocolate da marina';
