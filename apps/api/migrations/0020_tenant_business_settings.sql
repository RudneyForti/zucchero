alter table tenants
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists tax_document text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists updated_at timestamptz not null default now();

alter table tenant_settings
  add column if not exists default_deposit_basis_points integer not null default 5000,
  add column if not exists default_payment_method text not null default 'pix',
  add column if not exists default_delivery_mode text not null default 'delivery',
  add column if not exists business_hours jsonb not null default '[
    {"day":"monday","enabled":true,"start":"08:00","end":"18:00"},
    {"day":"tuesday","enabled":true,"start":"08:00","end":"18:00"},
    {"day":"wednesday","enabled":true,"start":"08:00","end":"18:00"},
    {"day":"thursday","enabled":true,"start":"08:00","end":"18:00"},
    {"day":"friday","enabled":true,"start":"08:00","end":"18:00"},
    {"day":"saturday","enabled":true,"start":"08:00","end":"14:00"},
    {"day":"sunday","enabled":false,"start":"08:00","end":"14:00"}
  ]'::jsonb;

update tenant_settings
set business_hours = '[
  {"day":"monday","enabled":true,"start":"08:00","end":"18:00"},
  {"day":"tuesday","enabled":true,"start":"08:00","end":"18:00"},
  {"day":"wednesday","enabled":true,"start":"08:00","end":"18:00"},
  {"day":"thursday","enabled":true,"start":"08:00","end":"18:00"},
  {"day":"friday","enabled":true,"start":"08:00","end":"18:00"},
  {"day":"saturday","enabled":true,"start":"08:00","end":"14:00"},
  {"day":"sunday","enabled":false,"start":"08:00","end":"14:00"}
]'::jsonb
where business_hours = '[]'::jsonb;

alter table tenant_settings
  drop constraint if exists tenant_settings_margin_range_check,
  add constraint tenant_settings_margin_range_check
    check (default_margin_basis_points between 0 and 9000),
  drop constraint if exists tenant_settings_deposit_range_check,
  add constraint tenant_settings_deposit_range_check
    check (default_deposit_basis_points between 0 and 10000),
  drop constraint if exists tenant_settings_payment_method_check,
  add constraint tenant_settings_payment_method_check
    check (default_payment_method in ('pix', 'card', 'cash')),
  drop constraint if exists tenant_settings_delivery_mode_check,
  add constraint tenant_settings_delivery_mode_check
    check (default_delivery_mode in ('delivery', 'pickup')),
  drop constraint if exists tenant_settings_business_hours_array_check,
  add constraint tenant_settings_business_hours_array_check
    check (jsonb_typeof(business_hours) = 'array');

alter table tenants
  drop constraint if exists tenants_state_format_check,
  add constraint tenants_state_format_check
    check (state is null or state ~ '^[A-Z]{2}$');
