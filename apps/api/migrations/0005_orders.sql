do $$
begin
  create type order_status as enum ('confirmed', 'cancelled', 'completed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type delivery_mode as enum ('delivery', 'pickup');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type order_requirement_status as enum (
    'available', 'substitution', 'partial', 'unavailable'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type shopping_need_status as enum ('open', 'purchased', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  primary_phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index if not exists customers_tenant_name_idx
  on customers (tenant_id, normalized_name);

create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null,
  label text not null,
  recipient text not null,
  formatted_address text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint customer_addresses_customer_tenant_fk
    foreign key (tenant_id, customer_id) references customers(tenant_id, id)
);

create table if not exists tenant_order_sequences (
  tenant_id uuid primary key references tenants(id),
  next_number integer not null default 1 check (next_number > 0)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_number integer not null,
  idempotency_key uuid not null,
  status order_status not null default 'confirmed',
  customer_id uuid not null,
  customer_name_snapshot text not null,
  customer_phone_snapshot text not null,
  delivery_mode delivery_mode not null,
  address_snapshot jsonb,
  delivery_at timestamptz not null,
  notes text,
  ingredient_cost numeric(14,2) not null,
  additional_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null,
  target_margin_basis_points integer not null,
  price numeric(14,2) not null,
  deposit_basis_points integer not null default 0,
  payment_method text not null,
  availability order_requirement_status not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_number),
  unique (tenant_id, idempotency_key),
  constraint orders_customer_tenant_fk
    foreign key (tenant_id, customer_id) references customers(tenant_id, id),
  constraint orders_margin_valid check (
    target_margin_basis_points >= 0 and target_margin_basis_points < 10000
  ),
  constraint orders_deposit_valid check (
    deposit_basis_points >= 0 and deposit_basis_points <= 10000
  )
);

create index if not exists orders_tenant_delivery_idx
  on orders (tenant_id, delivery_at);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  recipe_id uuid not null,
  recipe_version_id uuid not null,
  recipe_name_snapshot text not null,
  recipe_version_number integer not null,
  requested_mass_g numeric(14,3) not null,
  production_mass_g numeric(14,3) not null,
  scale_factor numeric(12,6) not null,
  ingredient_cost numeric(14,2) not null,
  price numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint order_items_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint order_items_recipe_tenant_fk
    foreign key (tenant_id, recipe_id) references recipes(tenant_id, id),
  constraint order_items_version_tenant_fk
    foreign key (tenant_id, recipe_version_id)
    references recipe_versions(tenant_id, id)
);

create table if not exists order_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  order_item_id uuid not null,
  ingredient_group_id uuid not null,
  ingredient_name_snapshot text not null,
  preferred_commercial_item_id uuid,
  selection_policy recipe_selection_policy not null,
  required_base numeric(14,3) not null,
  available_at_confirmation_base numeric(14,3) not null,
  shortage_base numeric(14,3) not null,
  status order_requirement_status not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint order_requirements_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint order_requirements_item_tenant_fk
    foreign key (tenant_id, order_item_id) references order_items(tenant_id, id),
  constraint order_requirements_group_tenant_fk
    foreign key (tenant_id, ingredient_group_id)
    references ingredient_groups(tenant_id, id),
  constraint order_requirements_preferred_tenant_fk
    foreign key (tenant_id, preferred_commercial_item_id, ingredient_group_id)
    references commercial_items(tenant_id, id, ingredient_group_id)
);

create table if not exists shopping_needs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  requirement_id uuid not null,
  commercial_item_id uuid,
  item_name_snapshot text not null,
  shortage_base numeric(14,3) not null,
  package_content_base numeric(14,3),
  packages_to_buy integer not null check (packages_to_buy > 0),
  purchase_quantity_base numeric(14,3) not null,
  needed_by timestamptz not null,
  status shopping_need_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint shopping_needs_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint shopping_needs_requirement_tenant_fk
    foreign key (tenant_id, requirement_id)
    references order_requirements(tenant_id, id),
  constraint shopping_needs_item_tenant_fk
    foreign key (tenant_id, commercial_item_id)
    references commercial_items(tenant_id, id)
);

create table if not exists inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  requirement_id uuid not null,
  lot_id uuid not null,
  quantity_base numeric(14,3) not null check (quantity_base > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint inventory_reservations_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint inventory_reservations_requirement_tenant_fk
    foreign key (tenant_id, requirement_id)
    references order_requirements(tenant_id, id),
  constraint inventory_reservations_lot_tenant_fk
    foreign key (tenant_id, lot_id) references purchase_lots(tenant_id, id)
);

alter table customers enable row level security;
alter table customers force row level security;
alter table customer_addresses enable row level security;
alter table customer_addresses force row level security;
alter table tenant_order_sequences enable row level security;
alter table tenant_order_sequences force row level security;
alter table orders enable row level security;
alter table orders force row level security;
alter table order_items enable row level security;
alter table order_items force row level security;
alter table order_requirements enable row level security;
alter table order_requirements force row level security;
alter table shopping_needs enable row level security;
alter table shopping_needs force row level security;
alter table inventory_reservations enable row level security;
alter table inventory_reservations force row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'customer_addresses', 'tenant_order_sequences', 'orders',
    'order_items', 'order_requirements', 'shopping_needs',
    'inventory_reservations'
  ] loop
    execute format('drop policy if exists %I_isolation on %I', table_name, table_name);
    execute format(
      'create policy %I_isolation on %I using (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on
      customers, customer_addresses, tenant_order_sequences, orders,
      order_items, order_requirements, shopping_needs, inventory_reservations
      to confeitaria_app;
  end if;
end $$;
