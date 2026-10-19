do $$
begin
  create type equipment_usage_source as enum ('manual', 'production');
exception when duplicate_object then null;
end $$;

alter table recipe_steps
  add column if not exists required_equipment_kind equipment_kind;

alter table production_tasks
  add column if not exists required_equipment_kind equipment_kind,
  add column if not exists equipment_id uuid;

alter table equipment_usages
  add column if not exists production_task_id uuid,
  add column if not exists source equipment_usage_source not null default 'manual';

do $$
begin
  alter table production_tasks
    add constraint production_tasks_equipment_tenant_fk
    foreign key (tenant_id, equipment_id)
    references equipment_assets(tenant_id, id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table equipment_usages
    add constraint equipment_usages_task_tenant_fk
    foreign key (tenant_id, production_task_id)
    references production_tasks(tenant_id, id);
exception when duplicate_object then null;
end $$;

create index if not exists production_tasks_equipment_schedule_idx
  on production_tasks (tenant_id, equipment_id, planned_start_at, planned_end_at)
  where equipment_id is not null;

create unique index if not exists equipment_usages_task_unique_idx
  on equipment_usages (tenant_id, production_task_id)
  where production_task_id is not null;

update recipe_steps
set required_equipment_kind = case kind
  when 'oven' then 'oven'::equipment_kind
  when 'heating' then 'stove'::equipment_kind
  when 'cold' then 'refrigeration'::equipment_kind
  else null
end
where required_equipment_kind is null;

update production_tasks as task
set required_equipment_kind = step.required_equipment_kind
from recipe_steps as step
where task.tenant_id = step.tenant_id
  and task.source_recipe_step_id = step.id
  and task.required_equipment_kind is null;

update production_tasks as task
set equipment_id = (
  select asset.id
  from equipment_assets as asset
  where asset.tenant_id = task.tenant_id
    and asset.kind = task.required_equipment_kind
    and asset.status = 'active'
  order by asset.created_at, asset.id
  limit 1
)
where task.required_equipment_kind is not null
  and task.equipment_id is null;

