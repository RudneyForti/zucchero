create table if not exists production_consumption_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  production_task_id uuid not null,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint production_consumption_corrections_task_tenant_fk
    foreign key (tenant_id, production_task_id)
    references production_tasks (tenant_id, id)
);

create table if not exists production_consumption_correction_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  correction_id uuid not null,
  consumption_id uuid not null,
  previous_actual_used_base numeric(14,3) not null
    check (previous_actual_used_base >= 0),
  previous_loss_base numeric(14,3) not null
    check (previous_loss_base >= 0),
  corrected_actual_used_base numeric(14,3) not null
    check (corrected_actual_used_base >= 0),
  corrected_loss_base numeric(14,3) not null
    check (corrected_loss_base >= 0),
  actual_used_delta_base numeric(14,3) not null,
  loss_delta_base numeric(14,3) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, correction_id, consumption_id),
  constraint production_consumption_correction_lines_correction_tenant_fk
    foreign key (tenant_id, correction_id)
    references production_consumption_corrections (tenant_id, id),
  constraint production_consumption_correction_lines_consumption_tenant_fk
    foreign key (tenant_id, consumption_id)
    references production_task_consumptions (tenant_id, id),
  constraint production_consumption_correction_lines_changed_check check (
    actual_used_delta_base <> 0 or loss_delta_base <> 0
  )
);

create index if not exists production_consumption_corrections_task_idx
  on production_consumption_corrections
  (tenant_id, production_task_id, corrected_at);

create index if not exists production_consumption_correction_lines_consumption_idx
  on production_consumption_correction_lines
  (tenant_id, consumption_id, created_at);

alter table production_consumption_corrections enable row level security;
alter table production_consumption_corrections force row level security;
alter table production_consumption_correction_lines enable row level security;
alter table production_consumption_correction_lines force row level security;

drop policy if exists production_consumption_corrections_isolation
  on production_consumption_corrections;
create policy production_consumption_corrections_isolation
  on production_consumption_corrections
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

drop policy if exists production_consumption_correction_lines_isolation
  on production_consumption_correction_lines;
create policy production_consumption_correction_lines_isolation
  on production_consumption_correction_lines
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert on production_consumption_corrections
      to confeitaria_app;
    grant select, insert on production_consumption_correction_lines
      to confeitaria_app;
  end if;
end $$;
