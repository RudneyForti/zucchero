alter type membership_role add value if not exists 'employee';

alter table tenants add column if not exists deleted_at timestamptz;
alter table app_users add column if not exists deleted_at timestamptz;
alter table memberships add column if not exists operational_access boolean not null default true;
alter table memberships add column if not exists financial_access boolean not null default true;
alter table memberships add column if not exists updated_at timestamptz not null default now();

update memberships
set operational_access = true, financial_access = true
where role = 'owner';

create unique index if not exists memberships_one_tenant_per_user_uidx
  on memberships (user_id);

create table if not exists tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  email text not null,
  operational_access boolean not null default false,
  financial_access boolean not null default false,
  token_hash text not null unique,
  invited_by_user_id uuid not null references app_users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_invitations_some_access check (operational_access or financial_access)
);

create index if not exists tenant_invitations_tenant_status_idx
  on tenant_invitations (tenant_id, accepted_at, revoked_at, expires_at);
create unique index if not exists tenant_invitations_pending_email_uidx
  on tenant_invitations (lower(email))
  where accepted_at is null and revoked_at is null;

create table if not exists account_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id),
  kind text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_notifications_user_created_idx
  on account_notifications (user_id, created_at desc);

alter table tenant_invitations enable row level security;
alter table tenant_invitations force row level security;
drop policy if exists tenant_invitations_isolation on tenant_invitations;
create policy tenant_invitations_isolation on tenant_invitations
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

alter table account_notifications enable row level security;
alter table account_notifications force row level security;

create or replace function create_local_invitation(
  p_tenant_id uuid,
  p_actor_subject text,
  p_email text,
  p_operational_access boolean,
  p_financial_access boolean,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (result_code text, invitation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_existing_user_id uuid;
  v_invitation_id uuid;
begin
  if not (p_operational_access or p_financial_access) then
    raise exception 'access_required';
  end if;

  select users.id into v_actor_id
  from app_users users
  join memberships membership on membership.user_id = users.id
  join tenants tenant on tenant.id = membership.tenant_id
  where membership.tenant_id = p_tenant_id
    and membership.role = 'owner'
    and users.external_subject = p_actor_subject
    and users.deleted_at is null
    and tenant.deleted_at is null;

  if v_actor_id is null then
    raise exception 'owner_required';
  end if;

  select id into v_existing_user_id
  from app_users
  where lower(email) = lower(trim(p_email)) and deleted_at is null
  limit 1;

  if v_existing_user_id is not null then
    if exists (
      select 1 from memberships
      where tenant_id = p_tenant_id and user_id = v_existing_user_id
    ) then
      return query select 'already_member'::text, null::uuid;
      return;
    end if;

    insert into account_notifications (user_id, kind, message)
    values (
      v_existing_user_id,
      'invitation-blocked-by-company',
      'Outra confeitaria tentou convidar este e-mail. Para aceitar um convite, primeiro exclua a confeitaria criada por engano em Meu perfil.'
    );
    return query select 'email_in_use'::text, null::uuid;
    return;
  end if;

  update tenant_invitations
  set revoked_at = now(), updated_at = now()
  where lower(email) = lower(trim(p_email))
    and accepted_at is null and revoked_at is null and expires_at <= now();

  if exists (
    select 1 from tenant_invitations
    where lower(email) = lower(trim(p_email))
      and accepted_at is null and revoked_at is null and expires_at > now()
  ) then
    return query select 'already_invited'::text, null::uuid;
    return;
  end if;

  insert into tenant_invitations (
    tenant_id, email, operational_access, financial_access,
    token_hash, invited_by_user_id, expires_at
  ) values (
    p_tenant_id, lower(trim(p_email)), p_operational_access, p_financial_access,
    p_token_hash, v_actor_id, p_expires_at
  ) returning id into v_invitation_id;

  insert into audit_events (
    tenant_id, actor_user_id, event_type, correlation_id, payload
  ) values (
    p_tenant_id, v_actor_id, 'TEAM_INVITATION_CREATED', gen_random_uuid()::text,
    jsonb_build_object(
      'email', lower(trim(p_email)),
      'operationalAccess', p_operational_access,
      'financialAccess', p_financial_access
    )
  );

  return query select 'created'::text, v_invitation_id;
end;
$$;

create or replace function find_local_invitation(p_token_hash text)
returns table (
  invitation_id uuid,
  tenant_name text,
  email text,
  operational_access boolean,
  financial_access boolean,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select invitation.id, tenant.name, invitation.email,
    invitation.operational_access, invitation.financial_access,
    invitation.expires_at
  from tenant_invitations invitation
  join tenants tenant on tenant.id = invitation.tenant_id
  where invitation.token_hash = p_token_hash
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
    and tenant.deleted_at is null
  limit 1
$$;

create or replace function accept_local_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_external_subject text,
  p_display_name text,
  p_password_hash text
) returns table (tenant_id uuid, tenant_name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation tenant_invitations%rowtype;
  v_tenant_name text;
begin
  select * into v_invitation
  from tenant_invitations
  where token_hash = p_token_hash
  for update;

  if v_invitation.id is null or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null or v_invitation.expires_at <= now() then
    raise exception 'invitation_invalid';
  end if;

  if exists (
    select 1 from app_users
    where lower(app_users.email) = lower(v_invitation.email)
      and app_users.deleted_at is null
  ) then
    raise exception 'email_in_use';
  end if;

  select name into v_tenant_name from tenants
  where id = v_invitation.tenant_id and deleted_at is null;
  if v_tenant_name is null then raise exception 'tenant_unavailable'; end if;

  insert into app_users (id, external_subject, email, display_name)
  values (p_user_id, p_external_subject, lower(v_invitation.email), p_display_name);

  insert into local_auth_credentials (user_id, email, password_hash)
  values (p_user_id, lower(v_invitation.email), p_password_hash);

  insert into memberships (
    tenant_id, user_id, role, operational_access, financial_access
  ) values (
    v_invitation.tenant_id, p_user_id, 'employee',
    v_invitation.operational_access, v_invitation.financial_access
  );

  update tenant_invitations
  set accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  insert into audit_events (
    tenant_id, actor_user_id, event_type, correlation_id, payload
  ) values (
    v_invitation.tenant_id, p_user_id, 'TEAM_INVITATION_ACCEPTED',
    gen_random_uuid()::text,
    jsonb_build_object('invitationId', v_invitation.id)
  );

  return query select v_invitation.tenant_id, v_tenant_name, lower(v_invitation.email);
end;
$$;

create or replace function list_account_notifications(p_subject text)
returns table (id uuid, kind text, message text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select notification.id, notification.kind, notification.message, notification.created_at
  from account_notifications notification
  join app_users users on users.id = notification.user_id
  where users.external_subject = p_subject
    and users.deleted_at is null
    and notification.read_at is null
  order by notification.created_at desc
  limit 10
$$;

create or replace function remove_local_account(
  p_tenant_id uuid,
  p_subject text,
  p_expected_tenant_name text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role membership_role;
  v_tenant_name text;
  v_member_count integer;
  v_mode text;
begin
  select users.id, membership.role, tenant.name
    into v_user_id, v_role, v_tenant_name
  from app_users users
  join memberships membership on membership.user_id = users.id
  join tenants tenant on tenant.id = membership.tenant_id
  where membership.tenant_id = p_tenant_id
    and users.external_subject = p_subject
    and users.deleted_at is null
    and tenant.deleted_at is null
  for update;

  if v_user_id is null then raise exception 'account_not_found'; end if;
  if v_tenant_name <> trim(p_expected_tenant_name) then
    raise exception 'tenant_name_mismatch';
  end if;

  select count(*) into v_member_count
  from memberships where tenant_id = p_tenant_id;

  if v_role = 'owner' and v_member_count > 1 then
    raise exception 'owner_has_team';
  end if;

  v_mode := case when v_role = 'owner' then 'company-deleted' else 'account-deleted' end;

  insert into audit_events (
    tenant_id, actor_user_id, event_type, correlation_id, payload
  ) values (
    p_tenant_id, v_user_id,
    case when v_role = 'owner' then 'TENANT_SELF_DELETED' else 'MEMBER_SELF_DELETED' end,
    gen_random_uuid()::text,
    jsonb_build_object('irreversibleInApplication', true)
  );

  if v_role = 'owner' then
    update tenants set deleted_at = now(), updated_at = now() where id = p_tenant_id;
    update tenant_invitations set revoked_at = coalesce(revoked_at, now()), updated_at = now()
      where tenant_id = p_tenant_id and accepted_at is null;
  end if;

  delete from local_auth_credentials where user_id = v_user_id;
  update app_users
  set email = 'deleted+' || v_user_id::text || '@zucchero.invalid',
      display_name = 'Conta removida',
      external_subject = 'deleted:' || v_user_id::text,
      deleted_at = now()
  where id = v_user_id;
  delete from memberships where tenant_id = p_tenant_id and user_id = v_user_id;

  return v_mode;
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
  select users.id, users.external_subject, membership.tenant_id,
    credentials.email, users.display_name, credentials.password_hash,
    credentials.mfa_enabled, credentials.mfa_secret
  from local_auth_credentials credentials
  join app_users users on users.id = credentials.user_id
  join memberships membership on membership.user_id = users.id
  join tenants tenant on tenant.id = membership.tenant_id
  where credentials.email = lower(trim(p_email))
    and users.deleted_at is null and tenant.deleted_at is null
  limit 1
$$;

revoke all on tenant_invitations from public;
revoke all on account_notifications from public;
revoke all on function create_local_invitation(uuid, text, text, boolean, boolean, text, timestamptz) from public;
revoke all on function find_local_invitation(text) from public;
revoke all on function accept_local_invitation(text, uuid, text, text, text) from public;
revoke all on function list_account_notifications(text) from public;
revoke all on function remove_local_account(uuid, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on tenant_invitations to confeitaria_app;
    grant execute on function create_local_invitation(uuid, text, text, boolean, boolean, text, timestamptz) to confeitaria_app;
    grant execute on function find_local_invitation(text) to confeitaria_app;
    grant execute on function accept_local_invitation(text, uuid, text, text, text) to confeitaria_app;
    grant execute on function list_account_notifications(text) to confeitaria_app;
    grant execute on function remove_local_account(uuid, text, text) to confeitaria_app;
  end if;
end $$;
