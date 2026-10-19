alter table production_tasks
  drop constraint production_tasks_preparation_tenant_fk;
alter table preparation_instances
  drop constraint preparation_instances_moment_tenant_fk;
alter table preparation_instances
  drop constraint preparation_instances_parent_tenant_fk;

alter table production_moments
  add constraint production_moments_tenant_id_plan_unique
  unique (tenant_id, id, production_plan_id);

alter table preparation_instances
  add constraint preparation_instances_tenant_id_plan_unique
  unique (tenant_id, id, production_plan_id);

alter table preparation_instances
  add constraint preparation_instances_moment_tenant_fk
  foreign key (tenant_id, production_moment_id, production_plan_id)
  references production_moments (tenant_id, id, production_plan_id);

alter table preparation_instances
  add constraint preparation_instances_parent_tenant_fk
  foreign key (
    tenant_id, parent_preparation_instance_id, production_plan_id
  ) references preparation_instances (tenant_id, id, production_plan_id);

alter table production_tasks
  add constraint production_tasks_preparation_tenant_fk
  foreign key (tenant_id, preparation_instance_id, production_plan_id)
  references preparation_instances (tenant_id, id, production_plan_id);

create unique index preparation_instances_one_root_per_plan_idx
  on preparation_instances (tenant_id, production_plan_id)
  where kind = 'final';
