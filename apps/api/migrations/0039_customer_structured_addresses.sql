alter table customer_addresses
  add column if not exists postal_code text,
  add column if not exists street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text;

update customer_addresses
set street = formatted_address
where street is null
  and formatted_address is not null
  and formatted_address <> '';
