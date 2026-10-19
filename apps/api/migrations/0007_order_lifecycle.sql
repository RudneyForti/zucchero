alter type order_status add value if not exists 'in_production' after 'confirmed';
alter type order_status add value if not exists 'ready' after 'in_production';

alter table orders add column if not exists started_at timestamptz;
alter table orders add column if not exists ready_at timestamptz;
alter table orders add column if not exists completed_at timestamptz;
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancellation_reason text;

alter table inventory_reservations
  add column if not exists released_at timestamptz;

create index if not exists orders_tenant_status_delivery_idx
  on orders (tenant_id, status, delivery_at);

create index if not exists inventory_reservations_active_order_idx
  on inventory_reservations (tenant_id, order_id)
  where released_at is null;
