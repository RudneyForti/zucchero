alter table orders
  add column if not exists delivery_arrangement text,
  add column if not exists delivery_provider text;

update orders
set delivery_arrangement = 'own'
where delivery_mode = 'delivery'
  and delivery_arrangement is null;

update orders
set delivery_arrangement = null,
    delivery_provider = null
where delivery_mode = 'pickup';

alter table orders
  drop constraint if exists orders_delivery_arrangement_check,
  add constraint orders_delivery_arrangement_check
    check (
      (
        delivery_mode = 'pickup'
        and delivery_arrangement is null
        and delivery_provider is null
      )
      or
      (
        delivery_mode = 'delivery'
        and delivery_arrangement in (
          'own',
          'customer_arranged',
          'integrated_partner'
        )
        and (
          (
            delivery_arrangement = 'integrated_partner'
            and nullif(btrim(delivery_provider), '') is not null
          )
          or
          (
            delivery_arrangement in ('own', 'customer_arranged')
            and delivery_provider is null
          )
        )
      )
    );
