create table if not exists production_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  production_task_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, production_task_id),
  constraint production_notes_task_tenant_fk
    foreign key (tenant_id, production_task_id)
    references production_tasks(tenant_id, id)
);

create index if not exists production_notes_tenant_updated_idx
  on production_notes (tenant_id, updated_at desc);

alter table production_notes enable row level security;
alter table production_notes force row level security;

drop policy if exists production_notes_isolation on production_notes;
create policy production_notes_isolation on production_notes
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update, delete on production_notes to confeitaria_app;
  end if;
end $$;
