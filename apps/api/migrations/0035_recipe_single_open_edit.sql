do $$
begin
  if exists (
    select 1
    from recipe_versions
    where status = 'draft'
    group by tenant_id, recipe_id
    having count(*) > 1
  ) then
    raise exception 'Existem receitas com mais de uma edição aberta; revise os dados antes de aplicar a restrição.';
  end if;
end
$$;

create unique index if not exists recipe_versions_one_open_edit_uidx
  on recipe_versions (tenant_id, recipe_id)
  where status = 'draft';
