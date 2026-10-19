do $$ begin
  create type ingredient_category_kind as enum ('ingredient', 'packaging', 'operational');
exception when duplicate_object then null;
end $$;

create table if not exists ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  kind ingredient_category_kind not null default 'ingredient',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index if not exists ingredient_categories_tenant_name_active_uidx
  on ingredient_categories (tenant_id, normalized_name) where active;

insert into ingredient_categories (tenant_id, name, normalized_name, kind)
select distinct tenant_id, category, lower(trim(category)), 'ingredient'::ingredient_category_kind
from ingredient_groups
on conflict (tenant_id, normalized_name) where active do nothing;

alter table ingredient_groups add column if not exists category_id uuid;
update ingredient_groups groups
set category_id = categories.id
from ingredient_categories categories
where categories.tenant_id = groups.tenant_id
  and categories.normalized_name = lower(trim(groups.category))
  and groups.category_id is null;
alter table ingredient_groups alter column category_id set not null;
alter table ingredient_groups
  add constraint ingredient_groups_category_tenant_fk
  foreign key (tenant_id, category_id)
  references ingredient_categories(tenant_id, id);

alter table ingredient_categories enable row level security;
alter table ingredient_categories force row level security;
drop policy if exists ingredient_categories_isolation on ingredient_categories;
create policy ingredient_categories_isolation on ingredient_categories
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on ingredient_categories to confeitaria_app;
  end if;
end $$;
