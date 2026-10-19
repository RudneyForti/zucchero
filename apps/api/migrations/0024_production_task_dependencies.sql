create table if not exists production_task_dependencies (
  tenant_id uuid not null references tenants(id),
  production_plan_id uuid not null,
  predecessor_task_id uuid not null,
  successor_task_id uuid not null,
  primary key (tenant_id, predecessor_task_id, successor_task_id),
  constraint production_task_dependencies_not_self_check
    check (predecessor_task_id <> successor_task_id),
  constraint production_task_dependencies_plan_tenant_fk
    foreign key (tenant_id, production_plan_id)
    references production_plans (tenant_id, id),
  constraint production_task_dependencies_predecessor_tenant_fk
    foreign key (tenant_id, predecessor_task_id)
    references production_tasks (tenant_id, id),
  constraint production_task_dependencies_successor_tenant_fk
    foreign key (tenant_id, successor_task_id)
    references production_tasks (tenant_id, id)
);

create index if not exists production_task_dependencies_successor_idx
  on production_task_dependencies (tenant_id, successor_task_id);

alter table production_task_dependencies enable row level security;
alter table production_task_dependencies force row level security;

drop policy if exists production_task_dependencies_isolation
  on production_task_dependencies;
create policy production_task_dependencies_isolation
  on production_task_dependencies
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on production_task_dependencies
      to confeitaria_app;
  end if;
end $$;
