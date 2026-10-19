do $$
begin
  create type ingredient_base_dimension as enum ('mass', 'unit');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type purchase_lot_status as enum ('available', 'depleted');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type stock_movement_type as enum (
    'PURCHASE_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RESERVE', 'RELEASE',
    'CONSUME', 'LOSS', 'RETURN_IN', 'RETURN_OUT', 'REVERSAL'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists ingredient_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  category text not null,
  base_dimension ingredient_base_dimension not null,
  base_unit text not null,
  perishable boolean not null default false,
  default_density_g_ml numeric(12, 6),
  minimum_stock numeric(14, 3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredient_groups_tenant_id_id_unique unique (tenant_id, id),
  constraint ingredient_groups_minimum_stock_non_negative check (minimum_stock >= 0),
  constraint ingredient_groups_density_positive check (
    default_density_g_ml is null or default_density_g_ml > 0
  ),
  constraint ingredient_groups_base_unit_check check (
    (base_dimension = 'mass' and base_unit = 'g') or
    (base_dimension = 'unit' and base_unit = 'un')
  )
);

create unique index if not exists ingredient_groups_tenant_normalized_active_uidx
  on ingredient_groups (tenant_id, normalized_name)
  where active;

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  constraint brands_tenant_id_id_unique unique (tenant_id, id),
  constraint brands_tenant_normalized_unique unique (tenant_id, normalized_name)
);

create table if not exists commercial_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  ingredient_group_id uuid not null,
  brand_id uuid,
  manufacturer_name text,
  display_name text not null,
  normalized_name text not null,
  gtin text,
  package_quantity numeric(14, 3) not null default 1,
  package_unit text not null,
  net_content_base numeric(14, 3) not null,
  conversion_confidence text not null default 'provided',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_items_tenant_id_id_unique unique (tenant_id, id),
  constraint commercial_items_group_tenant_fk
    foreign key (tenant_id, ingredient_group_id)
    references ingredient_groups (tenant_id, id),
  constraint commercial_items_brand_tenant_fk
    foreign key (tenant_id, brand_id)
    references brands (tenant_id, id),
  constraint commercial_items_package_positive check (package_quantity > 0),
  constraint commercial_items_net_content_positive check (net_content_base > 0)
);

create index if not exists commercial_items_tenant_name_idx
  on commercial_items (tenant_id, normalized_name);
create unique index if not exists commercial_items_tenant_gtin_uidx
  on commercial_items (tenant_id, gtin)
  where gtin is not null and active;

create table if not exists purchase_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  commercial_item_id uuid not null,
  supplier_name text,
  source_document_id uuid,
  entry_date date not null,
  expiry_date date,
  quantity_initial_base numeric(14, 3) not null,
  total_cost numeric(14, 2) not null,
  unit_cost_base numeric(18, 8) not null,
  lot_code text,
  source text not null default 'manual',
  status purchase_lot_status not null default 'available',
  created_at timestamptz not null default now(),
  constraint purchase_lots_tenant_id_id_unique unique (tenant_id, id),
  constraint purchase_lots_item_tenant_fk
    foreign key (tenant_id, commercial_item_id)
    references commercial_items (tenant_id, id),
  constraint purchase_lots_quantity_positive check (quantity_initial_base > 0),
  constraint purchase_lots_cost_non_negative check (total_cost >= 0),
  constraint purchase_lots_unit_cost_non_negative check (unit_cost_base >= 0),
  constraint purchase_lots_expiry_after_entry check (
    expiry_date is null or expiry_date >= entry_date
  )
);

create index if not exists purchase_lots_tenant_expiry_idx
  on purchase_lots (tenant_id, expiry_date);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lot_id uuid not null,
  type stock_movement_type not null,
  quantity_base numeric(14, 3) not null,
  occurred_at timestamptz not null default now(),
  reference_type text not null,
  reference_id uuid,
  reason_code text,
  note text,
  actor_user_id uuid references app_users(id),
  reverses_movement_id uuid references stock_movements(id),
  constraint stock_movements_lot_tenant_fk
    foreign key (tenant_id, lot_id)
    references purchase_lots (tenant_id, id),
  constraint stock_movements_quantity_positive check (quantity_base > 0)
);

create index if not exists stock_movements_tenant_lot_occurred_idx
  on stock_movements (tenant_id, lot_id, occurred_at desc);

create or replace function prevent_stock_movement_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Movimentos de estoque são imutáveis; registre um estorno.';
end;
$$;

drop trigger if exists stock_movements_immutable on stock_movements;
create trigger stock_movements_immutable
before update or delete on stock_movements
for each row execute function prevent_stock_movement_mutation();

alter table ingredient_groups enable row level security;
alter table ingredient_groups force row level security;
alter table brands enable row level security;
alter table brands force row level security;
alter table commercial_items enable row level security;
alter table commercial_items force row level security;
alter table purchase_lots enable row level security;
alter table purchase_lots force row level security;
alter table stock_movements enable row level security;
alter table stock_movements force row level security;

drop policy if exists ingredient_groups_isolation on ingredient_groups;
create policy ingredient_groups_isolation on ingredient_groups
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists brands_isolation on brands;
create policy brands_isolation on brands
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists commercial_items_isolation on commercial_items;
create policy commercial_items_isolation on commercial_items
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists purchase_lots_isolation on purchase_lots;
create policy purchase_lots_isolation on purchase_lots
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists stock_movements_isolation on stock_movements;
create policy stock_movements_isolation on stock_movements
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on ingredient_groups, brands, commercial_items, purchase_lots to confeitaria_app;
    grant select, insert on stock_movements to confeitaria_app;
  end if;
end $$;
