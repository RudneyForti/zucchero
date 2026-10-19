alter table tenants
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists is_commercial_point boolean not null default false;

drop function if exists register_local_tenant_owner(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function register_local_tenant_owner(
  p_tenant_id uuid,
  p_user_id uuid,
  p_external_subject text,
  p_email text,
  p_display_name text,
  p_tenant_name text,
  p_slug text,
  p_password_hash text,
  p_logo_data_url text,
  p_address_line text,
  p_address_number text,
  p_address_complement text,
  p_neighborhood text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_is_commercial_point boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tenants (
    id,
    name,
    slug,
    email,
    logo_data_url,
    address_line,
    address_number,
    address_complement,
    neighborhood,
    city,
    state,
    postal_code,
    is_commercial_point
  ) values (
    p_tenant_id,
    p_tenant_name,
    p_slug,
    lower(p_email),
    nullif(p_logo_data_url, ''),
    nullif(p_address_line, ''),
    nullif(p_address_number, ''),
    nullif(p_address_complement, ''),
    nullif(p_neighborhood, ''),
    nullif(p_city, ''),
    nullif(upper(p_state), ''),
    nullif(p_postal_code, ''),
    coalesce(p_is_commercial_point, false)
  );

  insert into app_users (id, external_subject, email, display_name)
  values (p_user_id, p_external_subject, lower(p_email), p_display_name);

  insert into memberships (tenant_id, user_id, role)
  values (p_tenant_id, p_user_id, 'owner');

  insert into tenant_settings (tenant_id)
  values (p_tenant_id);

  insert into local_auth_credentials (user_id, email, password_hash)
  values (p_user_id, lower(p_email), p_password_hash);

  insert into audit_events (
    tenant_id, actor_user_id, event_type, correlation_id, payload
  ) values (
    p_tenant_id,
    p_user_id,
    'IDENTITY_LOCAL_ACCOUNT_CREATED',
    gen_random_uuid()::text,
    jsonb_build_object(
      'provider', 'local-pilot',
      'hasLogo', p_logo_data_url is not null and p_logo_data_url <> '',
      'hasAddress', p_address_line is not null and p_address_line <> '',
      'isCommercialPoint', coalesce(p_is_commercial_point, false)
    )
  );
end;
$$;

revoke all on function register_local_tenant_owner(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant execute on function register_local_tenant_owner(
      uuid, uuid, text, text, text, text, text, text, text, text, text, text,
      text, text, text, text, boolean
    ) to confeitaria_app;
  end if;
end $$;
