alter table recipe_lines
  add column if not exists notes text;

create temporary table recipe_ingredient_group_cleanup on commit drop as
select
  g.id as group_id,
  g.tenant_id,
  g.name as previous_name,
  case
    when g.normalized_name like '%creme de leite%' then 'Creme de leite fresco'
    when g.normalized_name like '%mascarpone%' then 'Queijo mascarpone'
    when g.normalized_name like '%acido tartarico%' then 'Ácido tartárico'
    when g.normalized_name like '%vinho marsala%' then 'Vinho marsala'
    when g.normalized_name like '%raspas%' and g.normalized_name like '%limao%' and g.normalized_name like '%laranja%' then 'Raspas cítricas'
    when g.normalized_name like '%raspas%' and g.normalized_name like '%limao%' then 'Raspas de limão'
    when g.normalized_name like '%raspas%' and g.normalized_name like '%laranja%' then 'Raspas de laranja'
  end as canonical_name,
  case
    when g.normalized_name like '%creme de leite%' or g.normalized_name like '%mascarpone%' then 'Cremes e laticínios'
    when g.normalized_name like '%acido tartarico%' then 'Aromas e extratos'
    when g.normalized_name like '%vinho marsala%' then 'Bebidas e licores'
    when g.normalized_name like '%raspas%' then 'Frutas'
  end as canonical_category,
  case
    when g.normalized_name like '%creme de leite%' or g.normalized_name like '%mascarpone%' or g.normalized_name like '%raspas%' then true
    else false
  end as canonical_perishable
from ingredient_groups g
where
  (
    g.normalized_name like '%creme de leite%'
    or g.normalized_name like '%mascarpone%'
    or g.normalized_name like '%acido tartarico%'
    or g.normalized_name like '%vinho marsala%'
    or g.normalized_name like '%raspas%'
  );

delete from recipe_ingredient_group_cleanup cleanup
where cleanup.canonical_name is null
   or exists (
     select 1
     from ingredient_groups target
     where target.tenant_id = cleanup.tenant_id
       and target.id <> cleanup.group_id
       and target.normalized_name = translate(
         lower(cleanup.canonical_name),
         'áàâãéèêíìîóòôõúùûç',
         'aaaaeeeiiioooouuuc'
       )
       and target.active
   );

update recipe_lines line
set notes = cleanup.previous_name
from recipe_ingredient_group_cleanup cleanup
where line.ingredient_group_id = cleanup.group_id
  and line.notes is null
  and translate(
    lower(cleanup.previous_name),
    'áàâãéèêíìîóòôõúùûç',
    'aaaaeeeiiioooouuuc'
  ) <> translate(
    lower(cleanup.canonical_name),
    'áàâãéèêíìîóòôõúùûç',
    'aaaaeeeiiioooouuuc'
  );

insert into ingredient_categories (
  tenant_id,
  name,
  normalized_name,
  kind,
  active
)
select distinct
  cleanup.tenant_id,
  cleanup.canonical_category,
  translate(
    lower(cleanup.canonical_category),
    'áàâãéèêíìîóòôõúùûç',
    'aaaaeeeiiioooouuuc'
  ),
  'ingredient'::ingredient_category_kind,
  true
from recipe_ingredient_group_cleanup cleanup
where not exists (
  select 1
  from ingredient_categories category
  where category.tenant_id = cleanup.tenant_id
    and category.normalized_name = translate(
      lower(cleanup.canonical_category),
      'áàâãéèêíìîóòôõúùûç',
      'aaaaeeeiiioooouuuc'
    )
    and category.active
);

update ingredient_groups target
set
  name = cleanup.canonical_name,
  normalized_name = translate(
    lower(cleanup.canonical_name),
    'áàâãéèêíìîóòôõúùûç',
    'aaaaeeeiiioooouuuc'
  ),
  category_id = category.id,
  category = category.name,
  perishable = cleanup.canonical_perishable,
  updated_at = now()
from recipe_ingredient_group_cleanup cleanup
join ingredient_categories category
  on category.tenant_id = cleanup.tenant_id
 and category.normalized_name = translate(
   lower(cleanup.canonical_category),
   'áàâãéèêíìîóòôõúùûç',
   'aaaaeeeiiioooouuuc'
 )
where target.id = cleanup.group_id;
