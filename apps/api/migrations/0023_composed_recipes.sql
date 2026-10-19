do $$
begin
  create type recipe_measurement_unit as enum ('g', 'kg', 'mg', 'ml', 'unit');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type recipe_conversion_confidence as enum (
    'provided', 'imported', 'inferred'
  );
exception
  when duplicate_object then null;
end $$;

alter table recipe_lines
  add column if not exists input_quantity numeric(14, 3),
  add column if not exists input_unit recipe_measurement_unit,
  add column if not exists conversion_factor_to_g numeric(14, 6),
  add column if not exists conversion_source text,
  add column if not exists conversion_confidence recipe_conversion_confidence;

update recipe_lines
set
  input_quantity = coalesce(input_quantity, quantity_g),
  input_unit = coalesce(input_unit, 'g'::recipe_measurement_unit),
  conversion_factor_to_g = coalesce(conversion_factor_to_g, 1),
  conversion_confidence = coalesce(
    conversion_confidence,
    'provided'::recipe_conversion_confidence
  );

alter table recipe_lines
  alter column input_quantity set not null,
  alter column input_unit set default 'g',
  alter column input_unit set not null,
  alter column conversion_factor_to_g set default 1,
  alter column conversion_factor_to_g set not null,
  alter column conversion_confidence set default 'provided',
  alter column conversion_confidence set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_lines_input_quantity_positive'
  ) then
    alter table recipe_lines
      add constraint recipe_lines_input_quantity_positive
      check (input_quantity > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipe_lines_conversion_factor_positive'
  ) then
    alter table recipe_lines
      add constraint recipe_lines_conversion_factor_positive
      check (conversion_factor_to_g > 0);
  end if;
end $$;

create table if not exists recipe_step_dependencies (
  tenant_id uuid not null references tenants(id),
  recipe_version_id uuid not null,
  predecessor_step_id uuid not null,
  successor_step_id uuid not null,
  primary key (tenant_id, predecessor_step_id, successor_step_id),
  constraint recipe_step_dependencies_not_self_check
    check (predecessor_step_id <> successor_step_id),
  constraint recipe_step_dependencies_predecessor_tenant_fk
    foreign key (tenant_id, predecessor_step_id, recipe_version_id)
    references recipe_steps (tenant_id, id, recipe_version_id),
  constraint recipe_step_dependencies_successor_tenant_fk
    foreign key (tenant_id, successor_step_id, recipe_version_id)
    references recipe_steps (tenant_id, id, recipe_version_id)
);

create index if not exists recipe_step_dependencies_successor_idx
  on recipe_step_dependencies (tenant_id, successor_step_id);

create table if not exists recipe_subrecipe_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recipe_version_id uuid not null,
  recipe_moment_id uuid not null,
  referenced_recipe_version_id uuid not null,
  required_yield_g numeric(14, 3) not null check (required_yield_g > 0),
  notes text,
  position integer not null check (position >= 0),
  constraint recipe_subrecipe_lines_tenant_id_id_unique
    unique (tenant_id, id),
  constraint recipe_subrecipe_lines_version_tenant_fk
    foreign key (tenant_id, recipe_version_id)
    references recipe_versions (tenant_id, id),
  constraint recipe_subrecipe_lines_moment_tenant_fk
    foreign key (tenant_id, recipe_moment_id, recipe_version_id)
    references recipe_moments (tenant_id, id, recipe_version_id),
  constraint recipe_subrecipe_lines_referenced_version_tenant_fk
    foreign key (tenant_id, referenced_recipe_version_id)
    references recipe_versions (tenant_id, id)
);

create index if not exists recipe_subrecipe_lines_version_position_idx
  on recipe_subrecipe_lines (tenant_id, recipe_version_id, position);

alter table recipe_step_dependencies enable row level security;
alter table recipe_step_dependencies force row level security;
alter table recipe_subrecipe_lines enable row level security;
alter table recipe_subrecipe_lines force row level security;

drop policy if exists recipe_step_dependencies_isolation
  on recipe_step_dependencies;
create policy recipe_step_dependencies_isolation on recipe_step_dependencies
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

drop policy if exists recipe_subrecipe_lines_isolation
  on recipe_subrecipe_lines;
create policy recipe_subrecipe_lines_isolation on recipe_subrecipe_lines
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on
      recipe_step_dependencies, recipe_subrecipe_lines
      to confeitaria_app;
  end if;
end $$;
