alter table app_users
  add column if not exists avatar_data_url text,
  add column if not exists updated_at timestamptz not null default now();
