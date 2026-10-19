create or replace function bootstrap_tenant_owner(
  p_tenant_id uuid,
  p_external_subject text,
  p_email text,
  p_display_name text,
  p_tenant_name text,
  p_slug text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  created_user_id uuid;
begin
  if exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'tenant_already_exists';
  end if;

  insert into tenants (id, name, slug, email)
  values (p_tenant_id, p_tenant_name, p_slug, p_email);

  insert into app_users (external_subject, email, display_name)
  values (p_external_subject, lower(p_email), p_display_name)
  returning id into created_user_id;

  insert into memberships (tenant_id, user_id, role)
  values (p_tenant_id, created_user_id, 'owner');

  insert into tenant_settings (tenant_id)
  values (p_tenant_id);
end;
$$;

revoke all on function bootstrap_tenant_owner(uuid, text, text, text, text, text)
  from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant execute on function bootstrap_tenant_owner(uuid, text, text, text, text, text)
      to confeitaria_app;
  end if;
end $$;
