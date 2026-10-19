create extension if not exists pgcrypto;

do $$
begin
  create type membership_role as enum ('owner');
exception
  when duplicate_object then null;
end $$;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  constraint tenants_slug_unique unique (slug)
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  external_subject text not null unique,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references app_users(id),
  role membership_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists memberships_user_idx on memberships (user_id, tenant_id);

create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants(id),
  timezone text not null default 'America/Sao_Paulo',
  default_margin_basis_points integer not null default 3500,
  updated_at timestamptz not null default now(),
  constraint tenant_settings_margin_non_negative check (default_margin_basis_points >= 0)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  actor_user_id uuid references app_users(id),
  event_type text not null,
  correlation_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_occurred_idx
  on audit_events (tenant_id, occurred_at desc);

alter table tenants enable row level security;
alter table tenants force row level security;
alter table app_users enable row level security;
alter table app_users force row level security;
alter table memberships enable row level security;
alter table memberships force row level security;
alter table tenant_settings enable row level security;
alter table tenant_settings force row level security;
alter table audit_events enable row level security;
alter table audit_events force row level security;

drop policy if exists tenants_isolation on tenants;
create policy tenants_isolation on tenants
  using (id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists memberships_isolation on memberships;
create policy memberships_isolation on memberships
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists app_users_isolation on app_users;
create policy app_users_isolation on app_users
  using (
    exists (
      select 1
      from memberships
      where memberships.user_id = app_users.id
        and memberships.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

drop policy if exists tenant_settings_isolation on tenant_settings;
create policy tenant_settings_isolation on tenant_settings
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists audit_events_isolation on audit_events;
create policy audit_events_isolation on audit_events
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant usage on schema public to confeitaria_app;
    grant select, insert, update, delete on all tables in schema public to confeitaria_app;
    grant usage, select on all sequences in schema public to confeitaria_app;
    alter default privileges in schema public
      grant select, insert, update, delete on tables to confeitaria_app;
    alter default privileges in schema public
      grant usage, select on sequences to confeitaria_app;
  end if;
end $$;
