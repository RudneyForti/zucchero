do $$
begin
  create type recipe_version_status as enum ('draft', 'published');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type recipe_selection_policy as enum ('generic', 'preferred', 'required');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type recipe_step_kind as enum (
    'active', 'heating', 'oven', 'rest', 'cooling', 'cold', 'assembly'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index if not exists recipes_tenant_normalized_active_uidx
  on recipes (tenant_id, normalized_name) where active;

alter table commercial_items
  drop constraint if exists commercial_items_tenant_id_group_id_unique;
alter table commercial_items
  add constraint commercial_items_tenant_id_group_id_unique
  unique (tenant_id, id, ingredient_group_id);

create table if not exists recipe_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recipe_id uuid not null,
  version_number integer not null default 1,
  status recipe_version_status not null default 'draft',
  yield_mass_g numeric(14,3) not null check (yield_mass_g > 0),
  yield_units integer check (yield_units is null or yield_units > 0),
  expected_loss_percentage numeric(6,3) not null default 0
    check (expected_loss_percentage between 0 and 100),
  minimum_batch_factor numeric(8,4) not null default 0.25
    check (minimum_batch_factor > 0),
  rounding_rule text not null default 'proportional',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, recipe_id, version_number),
  constraint recipe_versions_recipe_tenant_fk
    foreign key (tenant_id, recipe_id) references recipes(tenant_id, id)
);

create table if not exists recipe_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recipe_version_id uuid not null,
  ingredient_group_id uuid not null,
  quantity_g numeric(14,3) not null check (quantity_g > 0),
  selection_policy recipe_selection_policy not null default 'generic',
  preferred_commercial_item_id uuid,
  waste_percentage numeric(6,3) not null default 0
    check (waste_percentage between 0 and 100),
  position integer not null check (position >= 0),
  constraint recipe_lines_version_tenant_fk
    foreign key (tenant_id, recipe_version_id)
    references recipe_versions(tenant_id, id),
  constraint recipe_lines_group_tenant_fk
    foreign key (tenant_id, ingredient_group_id)
    references ingredient_groups(tenant_id, id),
  constraint recipe_lines_preferred_item_tenant_fk
    foreign key (tenant_id, preferred_commercial_item_id, ingredient_group_id)
    references commercial_items(tenant_id, id, ingredient_group_id)
);

create index if not exists recipe_lines_version_position_idx
  on recipe_lines (tenant_id, recipe_version_id, position);

create table if not exists recipe_moments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recipe_version_id uuid not null,
  name text not null,
  description text,
  position integer not null check (position >= 0),
  unique (tenant_id, id),
  unique (tenant_id, id, recipe_version_id),
  unique (tenant_id, recipe_version_id, name),
  constraint recipe_moments_version_tenant_fk
    foreign key (tenant_id, recipe_version_id)
    references recipe_versions(tenant_id, id)
);

create table if not exists recipe_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recipe_version_id uuid not null,
  recipe_moment_id uuid not null,
  name text not null,
  instructions text not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  kind recipe_step_kind not null default 'active',
  parallelizable boolean not null default false,
  attention_required_at_end boolean not null default true,
  position integer not null check (position >= 0),
  constraint recipe_steps_version_tenant_fk
    foreign key (tenant_id, recipe_version_id)
    references recipe_versions(tenant_id, id),
  constraint recipe_steps_moment_tenant_fk
    foreign key (tenant_id, recipe_moment_id, recipe_version_id)
    references recipe_moments(tenant_id, id, recipe_version_id)
);

create index if not exists recipe_steps_moment_position_idx
  on recipe_steps (tenant_id, recipe_moment_id, position);

alter table recipes enable row level security;
alter table recipes force row level security;
alter table recipe_versions enable row level security;
alter table recipe_versions force row level security;
alter table recipe_lines enable row level security;
alter table recipe_lines force row level security;
alter table recipe_moments enable row level security;
alter table recipe_moments force row level security;
alter table recipe_steps enable row level security;
alter table recipe_steps force row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'recipes', 'recipe_versions', 'recipe_lines', 'recipe_moments', 'recipe_steps'
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
      recipes, recipe_versions, recipe_lines, recipe_moments, recipe_steps
      to confeitaria_app;
  end if;
end $$;
