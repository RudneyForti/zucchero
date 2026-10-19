alter table tenant_settings
  add column if not exists delivery_cost_per_km numeric(10,2) not null default 0;

alter table tenant_settings
  drop constraint if exists tenant_settings_delivery_cost_per_km_check,
  add constraint tenant_settings_delivery_cost_per_km_check
    check (delivery_cost_per_km between 0 and 10000);

alter table orders
  add column if not exists delivery_cost numeric(14,2) not null default 0;

alter table orders
  drop constraint if exists orders_delivery_cost_check,
  add constraint orders_delivery_cost_check
    check (delivery_cost >= 0 and delivery_cost <= additional_cost);
