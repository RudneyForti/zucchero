alter table customers
  add column if not exists anonymized_at timestamptz;

create index if not exists customers_tenant_anonymized_idx
  on customers (tenant_id, anonymized_at)
  where anonymized_at is not null;
