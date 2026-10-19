create table if not exists local_auth_credentials (
  user_id uuid primary key references app_users(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  mfa_secret text,
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table local_auth_credentials enable row level security;
alter table local_auth_credentials force row level security;

drop policy if exists local_auth_credentials_isolation on local_auth_credentials;
create policy local_auth_credentials_isolation on local_auth_credentials
  using (
    exists (
      select 1
      from memberships
      where memberships.user_id = local_auth_credentials.user_id
        and memberships.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

create or replace function register_local_tenant_owner(
  p_tenant_id uuid,
  p_user_id uuid,
  p_external_subject text,
  p_email text,
  p_display_name text,
  p_tenant_name text,
  p_slug text,
  p_password_hash text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'tenant_already_exists';
  end if;

  insert into tenants (id, name, slug, email)
  values (p_tenant_id, p_tenant_name, p_slug, lower(p_email));

  insert into app_users (id, external_subject, email, display_name)
  values (p_user_id, p_external_subject, lower(p_email), p_display_name);

  insert into memberships (tenant_id, user_id, role)
  values (p_tenant_id, p_user_id, 'owner');

  insert into tenant_settings (tenant_id)
  values (p_tenant_id);

  insert into local_auth_credentials (user_id, email, password_hash)
  values (p_user_id, lower(p_email), p_password_hash);

  insert into audit_events (
    tenant_id,
    actor_user_id,
    event_type,
    correlation_id,
    payload
  ) values (
    p_tenant_id,
    p_user_id,
    'IDENTITY_LOCAL_ACCOUNT_CREATED',
    gen_random_uuid()::text,
    jsonb_build_object('provider', 'local-pilot')
  );
end;
$$;

create or replace function find_local_auth_credential(p_email text)
returns table (
  user_id uuid,
  external_subject text,
  tenant_id uuid,
  email text,
  display_name text,
  password_hash text,
  mfa_enabled boolean,
  mfa_secret text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    users.id,
    users.external_subject,
    membership.tenant_id,
    credentials.email,
    users.display_name,
    credentials.password_hash,
    credentials.mfa_enabled,
    credentials.mfa_secret
  from local_auth_credentials credentials
  join app_users users on users.id = credentials.user_id
  join memberships membership on membership.user_id = users.id
  where credentials.email = lower(trim(p_email))
  limit 1
$$;

revoke all on function register_local_tenant_owner(uuid, uuid, text, text, text, text, text, text)
  from public;
revoke all on function find_local_auth_credential(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant execute on function register_local_tenant_owner(uuid, uuid, text, text, text, text, text, text)
      to confeitaria_app;
    grant execute on function find_local_auth_credential(text)
      to confeitaria_app;
  end if;
end $$;
