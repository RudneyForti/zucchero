do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'confeitaria_app') then
    create role confeitaria_app login password 'confeitaria_app' nosuperuser nocreatedb nocreaterole;
  end if;
end $$;

grant connect on database confeitaria to confeitaria_app;
grant usage on schema public to confeitaria_app;
