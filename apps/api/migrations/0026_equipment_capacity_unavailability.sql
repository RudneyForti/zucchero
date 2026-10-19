alter table equipment_assets
  add column if not exists capacity_units integer not null default 1;

alter table equipment_assets
  drop constraint if exists equipment_assets_capacity_units_check;
alter table equipment_assets
  add constraint equipment_assets_capacity_units_check
  check (capacity_units between 1 and 50);

create table if not exists equipment_unavailability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  equipment_id uuid not null,
  idempotency_key uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint equipment_unavailability_period_check check (ends_at > starts_at),
  constraint equipment_unavailability_tenant_id_unique unique (tenant_id, id),
  constraint equipment_unavailability_idempotency_unique unique (tenant_id, idempotency_key),
  constraint equipment_unavailability_asset_tenant_fk
    foreign key (tenant_id, equipment_id)
    references equipment_assets (tenant_id, id)
);

create index if not exists equipment_unavailability_schedule_idx
  on equipment_unavailability (tenant_id, equipment_id, starts_at, ends_at);

alter table equipment_unavailability enable row level security;
alter table equipment_unavailability force row level security;

drop policy if exists equipment_unavailability_isolation
  on equipment_unavailability;
create policy equipment_unavailability_isolation
  on equipment_unavailability
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on equipment_unavailability
      to confeitaria_app;
  end if;
end $$;
