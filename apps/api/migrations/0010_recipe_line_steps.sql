alter table recipe_steps
  add constraint recipe_steps_tenant_id_version_id_unique
  unique (tenant_id, id, recipe_version_id);

alter table recipe_lines
  add column if not exists recipe_step_id uuid;

alter table recipe_lines
  add constraint recipe_lines_tenant_id_id_unique
  unique (tenant_id, id);

alter table recipe_lines
  add constraint recipe_lines_step_tenant_fk
  foreign key (tenant_id, recipe_step_id, recipe_version_id)
  references recipe_steps (tenant_id, id, recipe_version_id);

create index if not exists recipe_lines_step_idx
  on recipe_lines (tenant_id, recipe_step_id);

alter table order_requirements
  add column if not exists source_recipe_line_id uuid;

alter table order_requirements
  add constraint order_requirements_source_line_tenant_fk
  foreign key (tenant_id, source_recipe_line_id)
  references recipe_lines (tenant_id, id);

create index if not exists order_requirements_source_line_idx
  on order_requirements (tenant_id, source_recipe_line_id);

-- A receita piloto já possui uma etapa inequívoca para cada linha conhecida.
update recipe_lines
set recipe_step_id = case id
  when '84111111-1111-4111-8111-111111111111'::uuid
    then '85111111-1111-4111-8111-111111111111'::uuid
  when '84222222-2222-4222-8222-222222222222'::uuid
    then '85222222-2222-4222-8222-222222222222'::uuid
end
where tenant_id = '11111111-1111-4111-8111-111111111111'::uuid
  and id in (
    '84111111-1111-4111-8111-111111111111'::uuid,
    '84222222-2222-4222-8222-222222222222'::uuid
  );

-- Pedidos antigos passam a apontar para a linha preservada quando a origem é
-- determinística. Linhas ainda sem etapa continuam legadas e são mostradas
-- como pertencentes ao pedido completo.
update order_requirements requirement
set source_recipe_line_id = (
  select line.id
  from order_items item
  join recipe_lines line
    on line.tenant_id = item.tenant_id
   and line.recipe_version_id = item.recipe_version_id
   and line.ingredient_group_id = requirement.ingredient_group_id
  where item.tenant_id = requirement.tenant_id
    and item.id = requirement.order_item_id
    and line.recipe_step_id is not null
  order by line.position
  limit 1
)
where requirement.source_recipe_line_id is null;
