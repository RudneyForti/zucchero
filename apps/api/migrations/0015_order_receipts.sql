do $$
begin
  create type order_receipt_entry_kind as enum ('receipt', 'reversal');
exception
  when duplicate_object then null;
end $$;

create table if not exists order_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  order_id uuid not null,
  idempotency_key uuid not null,
  kind order_receipt_entry_kind not null default 'receipt',
  amount numeric(14,2) not null check (amount > 0),
  fee_amount numeric(14,2) not null default 0
    check (fee_amount >= 0 and fee_amount <= amount),
  payment_method text not null,
  received_at timestamptz not null,
  note text,
  reverses_receipt_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint order_receipts_order_tenant_fk
    foreign key (tenant_id, order_id) references orders(tenant_id, id),
  constraint order_receipts_reversal_tenant_fk
    foreign key (tenant_id, reverses_receipt_id)
    references order_receipts(tenant_id, id),
  constraint order_receipts_kind_reference_check check (
    (kind = 'receipt' and reverses_receipt_id is null) or
    (kind = 'reversal' and reverses_receipt_id is not null)
  )
);

create index if not exists order_receipts_order_received_idx
  on order_receipts (tenant_id, order_id, received_at);

create unique index if not exists order_receipts_single_reversal_uidx
  on order_receipts (tenant_id, reverses_receipt_id)
  where kind = 'reversal';

alter table order_receipts enable row level security;
alter table order_receipts force row level security;

drop policy if exists order_receipts_isolation on order_receipts;
create policy order_receipts_isolation on order_receipts
  using (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert on order_receipts to confeitaria_app;
  end if;
end $$;
