alter table customers add column if not exists normalized_phone text;
alter table customers add column if not exists email text;
alter table customers add column if not exists notes text;
alter table customers add column if not exists preferred_delivery_mode delivery_mode;
alter table customers add column if not exists preferred_payment_method text;

update customers
set normalized_phone = regexp_replace(primary_phone, '[^0-9]+', '', 'g')
where normalized_phone is null;

alter table customers alter column normalized_phone set not null;

create unique index if not exists customers_tenant_phone_active_uidx
  on customers (tenant_id, normalized_phone)
  where active;

alter table customers drop constraint if exists customers_preferred_payment_method_check;
alter table customers
  add constraint customers_preferred_payment_method_check
  check (
    preferred_payment_method is null
    or preferred_payment_method in ('pix', 'card', 'cash')
  );

alter table customer_addresses add column if not exists delivery_instructions text;
alter table customer_addresses add column if not exists is_default boolean not null default false;
alter table customer_addresses add column if not exists updated_at timestamptz not null default now();

with ranked as (
  select id,
         row_number() over (
           partition by tenant_id, customer_id
           order by created_at, id
         ) as position
  from customer_addresses
  where active
)
update customer_addresses addresses
set is_default = ranked.position = 1
from ranked
where addresses.id = ranked.id;

create unique index if not exists customer_addresses_one_default_uidx
  on customer_addresses (tenant_id, customer_id)
  where active and is_default;
