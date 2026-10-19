alter table tenants add column if not exists logo_data_url text;

drop function if exists register_local_tenant_owner(uuid, uuid, text, text, text, text, text, text);

create function register_local_tenant_owner(
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
  p_city text,
  p_state text,
  p_postal_code text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tenants (
    id, name, slug, email, logo_data_url, address_line, city, state, postal_code
  ) values (
    p_tenant_id,
    p_tenant_name,
    p_slug,
    lower(p_email),
    nullif(p_logo_data_url, ''),
    nullif(p_address_line, ''),
    nullif(p_city, ''),
    nullif(upper(p_state), ''),
    nullif(p_postal_code, '')
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
      'hasAddress', p_address_line is not null and p_address_line <> ''
    )
  );
end;
$$;

revoke all on function register_local_tenant_owner(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant execute on function register_local_tenant_owner(
      uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
    ) to confeitaria_app;
  end if;
end $$;
