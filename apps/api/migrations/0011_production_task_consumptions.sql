create table if not exists production_task_consumptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  production_task_id uuid not null,
  order_requirement_id uuid not null,
  planned_quantity_base numeric(14,3) not null
    check (planned_quantity_base > 0),
  reserved_quantity_base numeric(14,3) not null
    check (reserved_quantity_base >= 0),
  actual_used_base numeric(14,3) not null
    check (actual_used_base >= 0),
  loss_base numeric(14,3) not null
    check (loss_base >= 0),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, production_task_id, order_requirement_id),
  constraint production_task_consumptions_task_tenant_fk
    foreign key (tenant_id, production_task_id)
    references production_tasks (tenant_id, id),
  constraint production_task_consumptions_requirement_tenant_fk
    foreign key (tenant_id, order_requirement_id)
    references order_requirements (tenant_id, id),
  constraint production_task_consumptions_totals_check
    check (actual_used_base + loss_base <= reserved_quantity_base)
);

create index if not exists production_task_consumptions_task_idx
  on production_task_consumptions (tenant_id, production_task_id, confirmed_at);

alter table production_task_consumptions enable row level security;
alter table production_task_consumptions force row level security;

drop policy if exists production_task_consumptions_isolation
  on production_task_consumptions;
create policy production_task_consumptions_isolation
  on production_task_consumptions
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert on production_task_consumptions to confeitaria_app;
  end if;
end $$;
