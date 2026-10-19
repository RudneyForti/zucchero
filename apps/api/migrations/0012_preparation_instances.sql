do $$
begin
  create type recipe_preparation_role as enum ('intermediate', 'final');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type preparation_instance_kind as enum ('intermediate', 'final');
exception
  when duplicate_object then null;
end $$;

alter table recipe_moments
  add column if not exists preparation_role recipe_preparation_role
  not null default 'final';

-- A classificação é culinária e fica preservada na versão. Na receita piloto,
-- massa e ganache são componentes exclusivos do bolo; os demais momentos
-- avançam o próprio produto final.
update recipe_moments
set preparation_role = 'intermediate'
where id in (
  '83111111-1111-4111-8111-111111111111'::uuid,
  '83222222-2222-4222-8222-222222222222'::uuid
);

create table if not exists preparation_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  production_plan_id uuid not null,
  production_moment_id uuid,
  parent_preparation_instance_id uuid,
  source_recipe_version_id uuid not null,
  source_recipe_moment_id uuid,
  name_snapshot text not null,
  kind preparation_instance_kind not null,
  dedicated_to_order boolean not null default true,
  expected_output_base numeric(14,3)
    check (expected_output_base is null or expected_output_base > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, production_plan_id, production_moment_id),
  constraint preparation_instances_plan_tenant_fk
    foreign key (tenant_id, production_plan_id)
    references production_plans (tenant_id, id),
  constraint preparation_instances_moment_tenant_fk
    foreign key (tenant_id, production_moment_id)
    references production_moments (tenant_id, id),
  constraint preparation_instances_parent_tenant_fk
    foreign key (tenant_id, parent_preparation_instance_id)
    references preparation_instances (tenant_id, id),
  constraint preparation_instances_version_tenant_fk
    foreign key (tenant_id, source_recipe_version_id)
    references recipe_versions (tenant_id, id),
  constraint preparation_instances_source_moment_tenant_fk
    foreign key (tenant_id, source_recipe_moment_id)
    references recipe_moments (tenant_id, id),
  constraint preparation_instances_shape_check check (
    (kind = 'final' and parent_preparation_instance_id is null
      and production_moment_id is null and source_recipe_moment_id is null)
    or
    (kind = 'intermediate' and parent_preparation_instance_id is not null
      and production_moment_id is not null and source_recipe_moment_id is not null)
  )
);

create index if not exists preparation_instances_plan_idx
  on preparation_instances (tenant_id, production_plan_id, kind);

insert into preparation_instances (
  tenant_id, production_plan_id, source_recipe_version_id, name_snapshot,
  kind, dedicated_to_order, expected_output_base
)
select
  plans.tenant_id, plans.id, plans.recipe_version_id,
  plans.product_name_snapshot, 'final', true, plans.production_mass_g
from production_plans plans
where not exists (
  select 1 from preparation_instances instances
  where instances.tenant_id = plans.tenant_id
    and instances.production_plan_id = plans.id
    and instances.kind = 'final'
);

insert into preparation_instances (
  tenant_id, production_plan_id, production_moment_id,
  parent_preparation_instance_id, source_recipe_version_id,
  source_recipe_moment_id, name_snapshot, kind, dedicated_to_order
)
select
  moments.tenant_id,
  moments.production_plan_id,
  moments.id,
  roots.id,
  plans.recipe_version_id,
  moments.source_recipe_moment_id,
  moments.name_snapshot,
  'intermediate',
  true
from production_moments moments
join production_plans plans
  on plans.tenant_id = moments.tenant_id
 and plans.id = moments.production_plan_id
join recipe_moments source_moments
  on source_moments.tenant_id = moments.tenant_id
 and source_moments.id = moments.source_recipe_moment_id
join preparation_instances roots
  on roots.tenant_id = moments.tenant_id
 and roots.production_plan_id = moments.production_plan_id
 and roots.kind = 'final'
where source_moments.preparation_role = 'intermediate'
on conflict (tenant_id, production_plan_id, production_moment_id) do nothing;

alter table production_tasks
  add column if not exists preparation_instance_id uuid;

update production_tasks tasks
set preparation_instance_id = coalesce(intermediates.id, roots.id)
from production_moments moments
join preparation_instances roots
  on roots.tenant_id = moments.tenant_id
 and roots.production_plan_id = moments.production_plan_id
 and roots.kind = 'final'
left join preparation_instances intermediates
  on intermediates.tenant_id = moments.tenant_id
 and intermediates.production_moment_id = moments.id
where tasks.tenant_id = moments.tenant_id
  and tasks.production_moment_id = moments.id
  and tasks.preparation_instance_id is null;

alter table production_tasks
  alter column preparation_instance_id set not null;

alter table production_tasks
  add constraint production_tasks_preparation_tenant_fk
  foreign key (tenant_id, preparation_instance_id)
  references preparation_instances (tenant_id, id);

alter table preparation_instances enable row level security;
alter table preparation_instances force row level security;

drop policy if exists preparation_instances_isolation
  on preparation_instances;
create policy preparation_instances_isolation
  on preparation_instances
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on preparation_instances
      to confeitaria_app;
  end if;
end $$;
