do $$
begin
  create type fiscal_document_status as enum (
    'requires_review', 'confirmed', 'cancelled', 'failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type fiscal_line_match_status as enum (
    'unmatched', 'suggested', 'confirmed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  document_key text not null,
  source_hash text not null,
  capture_method text not null default 'qr_code',
  issuer_name text,
  issued_at timestamptz,
  total_amount numeric(14, 2),
  status fiscal_document_status not null default 'requires_review',
  adapter_name text not null default 'assisted_text',
  adapter_version text not null default '1',
  captured_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint fiscal_documents_tenant_id_id_unique unique (tenant_id, id),
  constraint fiscal_documents_tenant_key_unique unique (tenant_id, document_key),
  constraint fiscal_documents_key_format_check check (document_key ~ '^[0-9]{44}$'),
  constraint fiscal_documents_total_non_negative check (
    total_amount is null or total_amount >= 0
  )
);

create index if not exists fiscal_documents_tenant_status_idx
  on fiscal_documents (tenant_id, status, captured_at desc);

create table if not exists fiscal_document_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  fiscal_document_id uuid not null,
  line_number integer not null,
  original_description text not null,
  gtin text,
  commercial_item_id uuid,
  quantity numeric(14, 3) not null,
  unit text not null,
  total_amount numeric(14, 2) not null,
  extraction_confidence numeric(5, 4) not null default 0.7,
  match_status fiscal_line_match_status not null default 'unmatched',
  created_at timestamptz not null default now(),
  constraint fiscal_document_lines_tenant_id_id_unique unique (tenant_id, id),
  constraint fiscal_document_lines_document_number_unique
    unique (tenant_id, fiscal_document_id, line_number),
  constraint fiscal_document_lines_document_tenant_fk
    foreign key (tenant_id, fiscal_document_id)
    references fiscal_documents (tenant_id, id),
  constraint fiscal_document_lines_item_tenant_fk
    foreign key (tenant_id, commercial_item_id)
    references commercial_items (tenant_id, id),
  constraint fiscal_document_lines_quantity_positive check (quantity > 0),
  constraint fiscal_document_lines_total_non_negative check (total_amount >= 0),
  constraint fiscal_document_lines_confidence_range check (
    extraction_confidence >= 0 and extraction_confidence <= 1
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_lots_source_document_tenant_fk'
  ) then
    alter table purchase_lots
      add constraint purchase_lots_source_document_tenant_fk
      foreign key (tenant_id, source_document_id)
      references fiscal_documents (tenant_id, id);
  end if;
end $$;

alter table fiscal_documents enable row level security;
alter table fiscal_documents force row level security;
alter table fiscal_document_lines enable row level security;
alter table fiscal_document_lines force row level security;

drop policy if exists fiscal_documents_isolation on fiscal_documents;
create policy fiscal_documents_isolation on fiscal_documents
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists fiscal_document_lines_isolation on fiscal_document_lines;
create policy fiscal_document_lines_isolation on fiscal_document_lines
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    grant select, insert, update on fiscal_documents to confeitaria_app;
    grant select, insert, update on fiscal_document_lines to confeitaria_app;
  end if;
end $$;
