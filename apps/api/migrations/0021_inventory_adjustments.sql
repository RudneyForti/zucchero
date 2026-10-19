alter table stock_movements
  add column if not exists idempotency_key text;

create unique index if not exists stock_movements_tenant_idempotency_uidx
  on stock_movements (tenant_id, idempotency_key)
  where idempotency_key is not null;
