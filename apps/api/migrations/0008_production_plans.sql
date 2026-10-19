do $$
begin
  create type production_plan_status as enum (
    'planned', 'in_progress', 'ready', 'completed', 'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type production_moment_status as enum (
    'pending', 'available', 'in_progress', 'waiting', 'completed', 'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type production_task_status as enum (
    'planned', 'available', 'in_progress', 'waiting', 'completed', 'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

alter table recipe_steps
  add constraint recipe_steps_tenant_id_id_unique unique (tenant_id, id);

create table if not exists production_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  order_item_id uuid not null,
  recipe_version_id uuid not null,
  product_name_snapshot text not null,
  scale_factor numeric(12,6) not null,
  production_mass_g numeric(14,3) not null,
  delivery_at timestamptz not null,
  recommended_start_at timestamptz not null,
  planned_finish_at timestamptz not null,
  buffer_minutes integer not null default 60 check (buffer_minutes >= 0),
  status production_plan_status not null default 'planned',
  planning_version integer not null default 1 check (planning_version > 0),
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_item_id),
  constraint production_plans_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint production_plans_item_tenant_fk
    foreign key (tenant_id, order_item_id) references order_items(tenant_id, id),
  constraint production_plans_version_tenant_fk
    foreign key (tenant_id, recipe_version_id)
    references recipe_versions(tenant_id, id)
);

create table if not exists production_moments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  production_plan_id uuid not null,
  source_recipe_moment_id uuid not null,
  name_snapshot text not null,
  position integer not null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  actual_started_at timestamptz,
  actual_completed_at timestamptz,
  status production_moment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, production_plan_id, position),
  constraint production_moments_plan_tenant_fk
    foreign key (tenant_id, production_plan_id)
    references production_plans(tenant_id, id),
  constraint production_moments_source_tenant_fk
    foreign key (tenant_id, source_recipe_moment_id)
    references recipe_moments(tenant_id, id)
);

create table if not exists production_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  production_plan_id uuid not null,
  production_moment_id uuid not null,
  source_recipe_step_id uuid not null,
  name_snapshot text not null,
  instructions_snapshot text not null,
  kind recipe_step_kind not null,
  duration_minutes integer not null check (duration_minutes > 0),
  parallelizable boolean not null default false,
  attention_required_at_end boolean not null default true,
  position integer not null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  actual_started_at timestamptz,
  actual_completed_at timestamptz,
  next_attention_at timestamptz,
  status production_task_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, production_moment_id, position),
  constraint production_tasks_plan_tenant_fk
    foreign key (tenant_id, production_plan_id)
    references production_plans(tenant_id, id),
  constraint production_tasks_moment_tenant_fk
    foreign key (tenant_id, production_moment_id)
    references production_moments(tenant_id, id),
  constraint production_tasks_source_tenant_fk
    foreign key (tenant_id, source_recipe_step_id)
    references recipe_steps(tenant_id, id)
);

create index if not exists production_plans_tenant_schedule_idx
  on production_plans (tenant_id, status, recommended_start_at, delivery_at);
create index if not exists production_tasks_tenant_attention_idx
  on production_tasks (tenant_id, status, next_attention_at, planned_start_at);

insert into production_plans (
  tenant_id, order_id, order_item_id, recipe_version_id,
  product_name_snapshot, scale_factor, production_mass_g, delivery_at,
  recommended_start_at, planned_finish_at, buffer_minutes, status,
  started_at, ready_at, completed_at, cancelled_at
)
select
  orders.tenant_id,
  orders.id,
  items.id,
  items.recipe_version_id,
  items.recipe_name_snapshot,
  items.scale_factor,
  items.production_mass_g,
  orders.delivery_at,
  orders.delivery_at - make_interval(
    mins => 60 + coalesce((
      select sum(steps.duration_minutes)::integer
      from recipe_steps steps
      where steps.recipe_version_id = items.recipe_version_id
    ), 0)
  ),
  orders.delivery_at - make_interval(mins => 60),
  60,
  case orders.status
    when 'in_production' then 'in_progress'::production_plan_status
    when 'ready' then 'ready'::production_plan_status
    when 'completed' then 'completed'::production_plan_status
    when 'cancelled' then 'cancelled'::production_plan_status
    else 'planned'::production_plan_status
  end,
  orders.started_at,
  orders.ready_at,
  orders.completed_at,
  orders.cancelled_at
from orders
join order_items items
  on items.tenant_id = orders.tenant_id and items.order_id = orders.id
on conflict (tenant_id, order_item_id) do nothing;

insert into production_moments (
  tenant_id, production_plan_id, source_recipe_moment_id, name_snapshot,
  position, planned_start_at, planned_end_at, status
)
select
  plans.tenant_id,
  plans.id,
  moments.id,
  moments.name,
  moments.position,
  plans.recommended_start_at + make_interval(mins => coalesce((
    select sum(previous_steps.duration_minutes)::integer
    from recipe_moments previous_moments
    join recipe_steps previous_steps
      on previous_steps.tenant_id = previous_moments.tenant_id
      and previous_steps.recipe_moment_id = previous_moments.id
    where previous_moments.recipe_version_id = plans.recipe_version_id
      and previous_moments.position < moments.position
  ), 0)),
  plans.recommended_start_at + make_interval(mins => coalesce((
    select sum(elapsed_steps.duration_minutes)::integer
    from recipe_moments elapsed_moments
    join recipe_steps elapsed_steps
      on elapsed_steps.tenant_id = elapsed_moments.tenant_id
      and elapsed_steps.recipe_moment_id = elapsed_moments.id
    where elapsed_moments.recipe_version_id = plans.recipe_version_id
      and elapsed_moments.position <= moments.position
  ), 0)),
  case
    when plans.status = 'cancelled' then 'cancelled'::production_moment_status
    when plans.status in ('ready', 'completed') then 'completed'::production_moment_status
    when moments.position = min(moments.position) over (partition by plans.id)
      then 'available'::production_moment_status
    else 'pending'::production_moment_status
  end
from production_plans plans
join recipe_moments moments
  on moments.tenant_id = plans.tenant_id
  and moments.recipe_version_id = plans.recipe_version_id
on conflict (tenant_id, production_plan_id, position) do nothing;

insert into production_tasks (
  tenant_id, production_plan_id, production_moment_id, source_recipe_step_id,
  name_snapshot, instructions_snapshot, kind, duration_minutes,
  parallelizable, attention_required_at_end, position,
  planned_start_at, planned_end_at, status
)
select
  plans.tenant_id,
  plans.id,
  production_moments.id,
  steps.id,
  steps.name,
  steps.instructions,
  steps.kind,
  steps.duration_minutes,
  steps.parallelizable,
  steps.attention_required_at_end,
  steps.position,
  production_moments.planned_start_at + make_interval(mins => coalesce((
    select sum(previous_steps.duration_minutes)::integer
    from recipe_steps previous_steps
    where previous_steps.recipe_moment_id = steps.recipe_moment_id
      and previous_steps.position < steps.position
  ), 0)),
  production_moments.planned_start_at + make_interval(mins => coalesce((
    select sum(elapsed_steps.duration_minutes)::integer
    from recipe_steps elapsed_steps
    where elapsed_steps.recipe_moment_id = steps.recipe_moment_id
      and elapsed_steps.position <= steps.position
  ), 0)),
  case
    when plans.status = 'cancelled' then 'cancelled'::production_task_status
    when plans.status in ('ready', 'completed') then 'completed'::production_task_status
    when production_moments.status = 'available'
      and steps.position = min(steps.position) over (partition by production_moments.id)
      then 'available'::production_task_status
    else 'planned'::production_task_status
  end
from production_plans plans
join production_moments
  on production_moments.tenant_id = plans.tenant_id
  and production_moments.production_plan_id = plans.id
join recipe_steps steps
  on steps.tenant_id = plans.tenant_id
  and steps.recipe_moment_id = production_moments.source_recipe_moment_id
on conflict (tenant_id, production_moment_id, position) do nothing;

alter table production_plans enable row level security;
alter table production_plans force row level security;
alter table production_moments enable row level security;
alter table production_moments force row level security;
alter table production_tasks enable row level security;
alter table production_tasks force row level security;

drop policy if exists production_plans_isolation on production_plans;
create policy production_plans_isolation on production_plans
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
drop policy if exists production_moments_isolation on production_moments;
create policy production_moments_isolation on production_moments
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
drop policy if exists production_tasks_isolation on production_tasks;
create policy production_tasks_isolation on production_tasks
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on
      production_plans, production_moments, production_tasks
      to confeitaria_app;
  end if;
end $$;
