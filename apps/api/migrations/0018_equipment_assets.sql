do $$
begin
  create type equipment_kind as enum ('oven', 'mixer', 'refrigeration', 'stove', 'utensil', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type equipment_status as enum ('active', 'maintenance', 'retired');
exception when duplicate_object then null;
end $$;

create table if not exists equipment_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  idempotency_key uuid not null,
  name text not null,
  normalized_name text not null,
  kind equipment_kind not null,
  brand text,
  model text,
  purchase_date date,
  purchase_value numeric(14,2) not null default 0 check (purchase_value >= 0),
  status equipment_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, normalized_name)
);

create table if not exists equipment_maintenance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  equipment_id uuid not null,
  idempotency_key uuid not null,
  performed_at date not null,
  description text not null,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  provider text,
  next_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint equipment_maintenance_asset_tenant_fk
    foreign key (tenant_id, equipment_id)
    references equipment_assets(tenant_id, id)
);

create index if not exists equipment_maintenance_asset_date_idx
  on equipment_maintenance_events (tenant_id, equipment_id, performed_at);

create table if not exists equipment_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  equipment_id uuid not null,
  order_id uuid,
  idempotency_key uuid not null,
  used_at date not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint equipment_usages_asset_tenant_fk
    foreign key (tenant_id, equipment_id)
    references equipment_assets(tenant_id, id),
  constraint equipment_usages_order_tenant_fk
    foreign key (tenant_id, order_id)
    references orders(tenant_id, id)
);

create index if not exists equipment_usages_asset_date_idx
  on equipment_usages (tenant_id, equipment_id, used_at);

insert into equipment_assets (
  id, tenant_id, idempotency_key, name, normalized_name, kind,
  brand, model, purchase_date, purchase_value, notes
)
select values_to_seed.id, tenants.id, values_to_seed.idempotency_key,
  values_to_seed.name, values_to_seed.normalized_name,
  values_to_seed.kind::equipment_kind, values_to_seed.brand,
  values_to_seed.model, values_to_seed.purchase_date::date,
  values_to_seed.purchase_value, values_to_seed.notes
from tenants
join (
  values
    ('a1111111-1111-4111-8111-111111111111'::uuid, 'a8111111-1111-4111-8111-111111111111'::uuid, 'Forno elétrico', 'forno eletrico', 'oven', 'Venâncio', 'F50', '2024-02-15', 3200.00, 'Equipamento principal para massas e assados'),
    ('a2222222-2222-4222-8222-222222222222'::uuid, 'a8222222-2222-4222-8222-222222222222'::uuid, 'Batedeira planetária', 'batedeira planetaria', 'mixer', 'KitchenAid', 'Stand Mixer', '2023-08-10', 2790.00, 'Usada em massas, cremes e coberturas'),
    ('a3333333-3333-4333-8333-333333333333'::uuid, 'a8333333-3333-4333-8333-333333333333'::uuid, 'Geladeira vertical', 'geladeira vertical', 'refrigeration', null, null, '2022-01-20', 4500.00, 'Conservação de insumos e preparações')
) as values_to_seed(id, idempotency_key, name, normalized_name, kind, brand, model, purchase_date, purchase_value, notes)
  on tenants.id = '11111111-1111-4111-8111-111111111111'::uuid
on conflict (tenant_id, normalized_name) do nothing;

alter table equipment_assets enable row level security;
alter table equipment_assets force row level security;
alter table equipment_maintenance_events enable row level security;
alter table equipment_maintenance_events force row level security;
alter table equipment_usages enable row level security;
alter table equipment_usages force row level security;

drop policy if exists equipment_assets_isolation on equipment_assets;
create policy equipment_assets_isolation on equipment_assets
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists equipment_maintenance_events_isolation on equipment_maintenance_events;
create policy equipment_maintenance_events_isolation on equipment_maintenance_events
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists equipment_usages_isolation on equipment_usages;
create policy equipment_usages_isolation on equipment_usages
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update on equipment_assets to confeitaria_app;
    grant select, insert on equipment_maintenance_events to confeitaria_app;
    grant select, insert on equipment_usages to confeitaria_app;
  end if;
end $$;
