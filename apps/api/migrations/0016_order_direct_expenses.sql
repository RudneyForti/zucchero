do $$
begin
  create type order_direct_expense_entry_kind as enum ('expense', 'reversal');
exception
  when duplicate_object then null;
end $$;

create table if not exists order_direct_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  idempotency_key uuid not null,
  kind order_direct_expense_entry_kind not null default 'expense',
  category text not null,
  description text not null,
  actual_amount numeric(14,2) not null check (actual_amount > 0),
  estimated_amount numeric(14,2) not null default 0 check (estimated_amount >= 0),
  incurred_at date not null,
  note text,
  reverses_expense_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint order_direct_expenses_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint order_direct_expenses_reversal_tenant_fk
    foreign key (tenant_id, reverses_expense_id)
    references order_direct_expenses(tenant_id, id),
  constraint order_direct_expenses_kind_reference_check check (
    (kind = 'expense' and reverses_expense_id is null) or
    (kind = 'reversal' and reverses_expense_id is not null)
  )
);

create index if not exists order_direct_expenses_order_date_idx
  on order_direct_expenses (tenant_id, order_id, incurred_at);

create unique index if not exists order_direct_expenses_single_reversal_uidx
  on order_direct_expenses (tenant_id, reverses_expense_id)
  where kind = 'reversal';

alter table order_direct_expenses enable row level security;
alter table order_direct_expenses force row level security;

drop policy if exists order_direct_expenses_isolation on order_direct_expenses;
create policy order_direct_expenses_isolation on order_direct_expenses
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert on order_direct_expenses to confeitaria_app;
  end if;
end $$;
