create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  correlation_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  queued_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint outbox_events_status_check
    check (status in ('pending', 'queued', 'processed', 'failed')),
  constraint outbox_events_attempts_check check (attempts >= 0)
);

create index if not exists outbox_events_dispatch_idx
  on outbox_events (status, available_at, created_at);
create index if not exists outbox_events_tenant_created_idx
  on outbox_events (tenant_id, created_at desc);

alter table outbox_events enable row level security;
alter table outbox_events force row level security;

drop policy if exists outbox_events_isolation on outbox_events;
create policy outbox_events_isolation on outbox_events
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update on outbox_events to confeitaria_app;
  end if;
end $$;
