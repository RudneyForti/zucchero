alter table recipe_versions
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_author text,
  add column if not exists source_accessed_at timestamptz,
  add column if not exists import_method text,
  add column if not exists import_warnings jsonb not null default '[]'::jsonb;

alter table recipe_versions
  drop constraint if exists recipe_versions_import_method_check;

alter table recipe_versions
  add constraint recipe_versions_import_method_check
  check (import_method is null or import_method in ('structured_data', 'llm'));

alter table recipe_versions
  drop constraint if exists recipe_versions_source_url_check;

alter table recipe_versions
  add constraint recipe_versions_source_url_check
  check (source_url is null or source_url ~ '^https?://');
