do $$
begin
  create type expense_payment_entry_kind as enum ('payment', 'reversal');
exception
  when duplicate_object then null;
end $$;

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, normalized_name)
);

create table if not exists expense_recurrences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  category_id uuid not null,
  description text not null,
  supplier text,
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 28),
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (
    end_month is null or
    (extract(day from end_month) = 1 and end_month >= start_month)
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint expense_recurrences_category_tenant_fk
    foreign key (tenant_id, category_id)
    references expense_categories(tenant_id, id)
);

create table if not exists operating_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  category_id uuid not null,
  recurrence_id uuid,
  idempotency_key uuid not null,
  description text not null,
  supplier text,
  competence date not null check (extract(day from competence) = 1),
  due_date date not null,
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint operating_expenses_category_tenant_fk
    foreign key (tenant_id, category_id)
    references expense_categories(tenant_id, id),
  constraint operating_expenses_recurrence_tenant_fk
    foreign key (tenant_id, recurrence_id)
    references expense_recurrences(tenant_id, id)
);

create unique index if not exists operating_expenses_recurrence_month_uidx
  on operating_expenses (tenant_id, recurrence_id, competence)
  where recurrence_id is not null;

create index if not exists operating_expenses_month_due_idx
  on operating_expenses (tenant_id, competence, due_date);

create table if not exists expense_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  expense_id uuid not null,
  idempotency_key uuid not null,
  kind expense_payment_entry_kind not null default 'payment',
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null,
  note text,
  reverses_payment_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint expense_payments_expense_tenant_fk
    foreign key (tenant_id, expense_id)
    references operating_expenses(tenant_id, id),
  constraint expense_payments_reversal_tenant_fk
    foreign key (tenant_id, reverses_payment_id)
    references expense_payments(tenant_id, id),
  constraint expense_payments_kind_reference_check check (
    (kind = 'payment' and reverses_payment_id is null) or
    (kind = 'reversal' and reverses_payment_id is not null)
  )
);

create index if not exists expense_payments_date_idx
  on expense_payments (tenant_id, paid_at);

create unique index if not exists expense_payments_single_reversal_uidx
  on expense_payments (tenant_id, reverses_payment_id)
  where kind = 'reversal';

insert into expense_categories (tenant_id, name, normalized_name)
select tenants.id, defaults.name, defaults.normalized_name
from tenants
cross join (
  values
    ('Aluguel e espaço', 'aluguel e espaco'),
    ('Gás e energia', 'gas e energia'),
    ('Internet e telefone', 'internet e telefone'),
    ('Contabilidade', 'contabilidade'),
    ('Transporte', 'transporte'),
    ('Manutenção', 'manutencao'),
    ('Marketing', 'marketing'),
    ('Outros', 'outros')
) as defaults(name, normalized_name)
on conflict (tenant_id, normalized_name) do nothing;

alter table expense_categories enable row level security;
alter table expense_categories force row level security;
alter table expense_recurrences enable row level security;
alter table expense_recurrences force row level security;
alter table operating_expenses enable row level security;
alter table operating_expenses force row level security;
alter table expense_payments enable row level security;
alter table expense_payments force row level security;

drop policy if exists expense_categories_isolation on expense_categories;
create policy expense_categories_isolation on expense_categories
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists expense_recurrences_isolation on expense_recurrences;
create policy expense_recurrences_isolation on expense_recurrences
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists operating_expenses_isolation on operating_expenses;
create policy operating_expenses_isolation on operating_expenses
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists expense_payments_isolation on expense_payments;
create policy expense_payments_isolation on expense_payments
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert on expense_categories to confeitaria_app;
    grant select, insert on expense_recurrences to confeitaria_app;
    grant select, insert on operating_expenses to confeitaria_app;
    grant select, insert on expense_payments to confeitaria_app;
  end if;
end $$;
