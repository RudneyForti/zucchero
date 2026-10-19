update recipe_lines line
set notes = case
  when ingredient.name = 'Creme de leite fresco'
    and line.notes ilike '%bater chantilly%35%gordura%'
    then 'Para bater chantilly, com 35% de gordura'
  when ingredient.name = 'Queijo mascarpone'
    and line.notes ilike '%preparado de véspera%'
    then 'Preparado de véspera'
  when ingredient.name = 'Raspas cítricas'
    and line.notes ilike '%limão%laranja%opcional%'
    then 'Limão ou laranja, opcional'
  when ingredient.name = 'Raspas de limão'
    and line.notes ilike '%taiti%siciliano%'
    then 'Taiti ou siciliano'
  when ingredient.name in (
    'Raspas de laranja',
    'Vinho marsala',
    'Ácido tartárico'
  )
    then null
  else line.notes
end
from ingredient_groups ingredient
where line.ingredient_group_id = ingredient.id
  and line.notes is not null
  and ingredient.name in (
    'Creme de leite fresco',
    'Queijo mascarpone',
    'Raspas cítricas',
    'Raspas de limão',
    'Raspas de laranja',
    'Vinho marsala',
    'Ácido tartárico'
  );
