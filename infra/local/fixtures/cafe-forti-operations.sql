\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recipe_versions
     WHERE tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
       AND id = 'c7100001-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Execute cafe-forti.sql antes desta fixture.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM orders
     WHERE tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  ) THEN
    RAISE EXCEPTION 'A operação de teste da Café Forti já foi criada.';
  END IF;
END
$$;

-- Ativos que podem ser reservados automaticamente pelo planejamento.
INSERT INTO equipment_assets
  (id, tenant_id, idempotency_key, name, normalized_name, kind, brand, model, purchase_date, purchase_value, status, notes, capacity_units)
VALUES
  ('b1000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'b1100001-0000-4000-8000-000000000001', 'Forno elétrico principal', 'forno eletrico principal', 'oven', 'Venâncio', 'F45', current_date - 620, 2850.00, 'active', 'Forno de convecção usado em bolos e brownies.', 2),
  ('b1000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'b1100002-0000-4000-8000-000000000002', 'Batedeira planetária', 'batedeira planetaria', 'mixer', 'KitchenAid', 'Stand Mixer', current_date - 410, 2190.00, 'active', 'Cuba de 4,8 L.', 1),
  ('b1000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'b1100003-0000-4000-8000-000000000003', 'Geladeira de produção', 'geladeira de producao', 'refrigeration', 'Brastemp', 'Frost Free 400 L', current_date - 760, 3299.00, 'active', 'Prateleira superior reservada aos pedidos do dia.', 6),
  ('b1000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'b1100004-0000-4000-8000-000000000004', 'Fogão da cozinha', 'fogao da cozinha', 'stove', 'Atlas', '4 bocas', current_date - 890, 899.00, 'active', null, 2);

INSERT INTO equipment_maintenance_events
  (id, tenant_id, equipment_id, idempotency_key, performed_at, description, cost, provider, next_due_date, notes)
VALUES
  ('b2000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'b1000001-0000-4000-8000-000000000001', 'b2100001-0000-4000-8000-000000000001', current_date - 45, 'Limpeza técnica e aferição de temperatura', 85.00, 'Santos Refrigeração', current_date + 135, 'Diferença máxima aferida: 3 °C.');

-- Pedidos em quatro estágios para exercitar a agenda, a bancada e o histórico.
INSERT INTO orders
  (id, tenant_id, order_number, idempotency_key, status, customer_id, customer_name_snapshot, customer_phone_snapshot, delivery_mode, address_snapshot, delivery_at, notes, ingredient_cost, additional_cost, total_cost, target_margin_basis_points, price, deposit_basis_points, payment_method, availability, confirmed_at, created_at, started_at, ready_at, completed_at)
VALUES
  ('d1000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 1041, 'd1100001-0000-4000-8000-000000000001', 'in_production', 'c6000001-0000-4000-8000-000000000001', 'Marina Lopes', '(13) 98888-1234', 'delivery', '{"label":"Casa","formattedAddress":"Rua das Acácias, 128, apto. 42 — Gonzaga, Santos/SP","deliveryInstructions":"Interfone 42"}'::jsonb, (current_date + time '17:30') AT TIME ZONE 'America/Sao_Paulo', 'Bolo com acabamento rosé, sem excesso de açúcar. Vela separada.', 81.60, 20.00, 101.60, 3800, 164.00, 5000, 'pix', 'available', now() - interval '4 days', now() - interval '4 days', now() - interval '90 minutes', null, null),
  ('d1000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 1042, 'd1100002-0000-4000-8000-000000000002', 'ready', 'c6000002-0000-4000-8000-000000000002', 'Ana Paula Ribeiro', '(13) 99721-8040', 'pickup', null, (current_date + time '15:00') AT TIME ZONE 'America/Sao_Paulo', 'Cortar em 12 quadrados e embalar individualmente.', 30.00, 6.00, 36.00, 3800, 58.00, 5000, 'card', 'available', now() - interval '5 days', now() - interval '5 days', now() - interval '5 hours', now() - interval '35 minutes', null),
  ('d1000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 1043, 'd1100003-0000-4000-8000-000000000003', 'confirmed', 'c6000003-0000-4000-8000-000000000003', 'Beatriz Santos', '(13) 99114-6672', 'delivery', '{"label":"Casa","formattedAddress":"Avenida Bernardino de Campos, 742 — Campo Grande, Santos/SP","deliveryInstructions":"Portaria do bloco B"}'::jsonb, ((current_date + 1) + time '16:00') AT TIME ZONE 'America/Sao_Paulo', 'Usar morangos inteiros na decoração. Mensagem: Feliz aniversário, Bia!', 56.00, 12.00, 68.00, 3800, 110.00, 5000, 'pix', 'partial', now() - interval '2 days', now() - interval '2 days', null, null, null),
  ('d1000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 1040, 'd1100004-0000-4000-8000-000000000004', 'completed', 'c6000004-0000-4000-8000-000000000004', 'Lucas Almeida', '(13) 99650-3351', 'pickup', null, ((current_date - 5) + time '14:00') AT TIME ZONE 'America/Sao_Paulo', 'Brownies para reunião do escritório.', 45.00, 8.00, 53.00, 3800, 85.50, 5000, 'cash', 'available', now() - interval '10 days', now() - interval '10 days', now() - interval '5 days 5 hours', now() - interval '5 days 2 hours', now() - interval '5 days 1 hour');

INSERT INTO order_items
  (id, tenant_id, order_id, recipe_id, recipe_version_id, recipe_name_snapshot, recipe_version_number, requested_mass_g, production_mass_g, scale_factor, ingredient_cost, price)
VALUES
  ('d2000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000001-0000-4000-8000-000000000001', 'c7000001-0000-4000-8000-000000000001', 'c7100001-0000-4000-8000-000000000001', 'Bolo de chocolate', 1, 2400, 2400, 2.0, 81.60, 164.00),
  ('d2000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000002-0000-4000-8000-000000000002', 'c7000002-0000-4000-8000-000000000002', 'c7100002-0000-4000-8000-000000000002', 'Brownie clássico', 1, 1000, 1000, 1.0, 30.00, 58.00),
  ('d2000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000003-0000-4000-8000-000000000003', 'c7000003-0000-4000-8000-000000000003', 'c7100003-0000-4000-8000-000000000003', 'Torta de morango', 1, 1400, 1400, 1.0, 56.00, 110.00),
  ('d2000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000004-0000-4000-8000-000000000004', 'c7000002-0000-4000-8000-000000000002', 'c7100002-0000-4000-8000-000000000002', 'Brownie clássico', 1, 1500, 1500, 1.5, 45.00, 85.50);

-- Requisitos congelam o ingrediente e a versão que existiam na confirmação.
INSERT INTO order_requirements
  (tenant_id, order_id, order_item_id, ingredient_group_id, ingredient_name_snapshot, preferred_commercial_item_id, selection_policy, required_base, available_at_confirmation_base, shortage_base, status, source_recipe_line_id)
SELECT
  oi.tenant_id,
  oi.order_id,
  oi.id,
  rl.ingredient_group_id,
  ig.name,
  rl.preferred_commercial_item_id,
  rl.selection_policy,
  round(rl.quantity_g * oi.scale_factor, 3),
  CASE
    WHEN oi.order_id = 'd1000003-0000-4000-8000-000000000003' AND rl.ingredient_group_id = 'c2000007-0000-4000-8000-000000000007' THEN 250
    ELSE round(rl.quantity_g * oi.scale_factor, 3)
  END,
  CASE
    WHEN oi.order_id = 'd1000003-0000-4000-8000-000000000003' AND rl.ingredient_group_id = 'c2000007-0000-4000-8000-000000000007' THEN round((rl.quantity_g * oi.scale_factor) - 250, 3)
    ELSE 0
  END,
  CASE
    WHEN oi.order_id = 'd1000003-0000-4000-8000-000000000003' AND rl.ingredient_group_id = 'c2000007-0000-4000-8000-000000000007' THEN 'partial'::order_requirement_status
    ELSE 'available'::order_requirement_status
  END,
  rl.id
FROM order_items oi
JOIN recipe_lines rl
  ON rl.tenant_id = oi.tenant_id
 AND rl.recipe_version_id = oi.recipe_version_id
JOIN ingredient_groups ig
  ON ig.tenant_id = rl.tenant_id
 AND ig.id = rl.ingredient_group_id
WHERE oi.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

INSERT INTO shopping_needs
  (tenant_id, order_id, requirement_id, commercial_item_id, item_name_snapshot, shortage_base, package_content_base, packages_to_buy, purchase_quantity_base, needed_by, status)
SELECT
  requirement.tenant_id,
  requirement.order_id,
  requirement.id,
  'c4000007-0000-4000-8000-000000000007',
  'Morango fresco bandeja 250 g',
  requirement.shortage_base,
  250,
  2,
  500,
  ((current_date + 1) + time '10:00') AT TIME ZONE 'America/Sao_Paulo',
  'open'
FROM order_requirements requirement
WHERE requirement.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  AND requirement.order_id = 'd1000003-0000-4000-8000-000000000003'
  AND requirement.ingredient_group_id = 'c2000007-0000-4000-8000-000000000007';

-- Reserva o que ainda será produzido e consome o que já ficou pronto/foi entregue.
INSERT INTO inventory_reservations
  (tenant_id, order_id, requirement_id, lot_id, quantity_base)
SELECT
  requirement.tenant_id,
  requirement.order_id,
  requirement.id,
  lot.id,
  least(requirement.required_base, requirement.available_at_confirmation_base)
FROM order_requirements requirement
JOIN commercial_items item
  ON item.tenant_id = requirement.tenant_id
 AND item.ingredient_group_id = requirement.ingredient_group_id
JOIN LATERAL (
  SELECT purchase_lot.id
    FROM purchase_lots purchase_lot
   WHERE purchase_lot.tenant_id = item.tenant_id
     AND purchase_lot.commercial_item_id = item.id
     AND purchase_lot.status = 'available'
   ORDER BY purchase_lot.expiry_date NULLS LAST, purchase_lot.entry_date
   LIMIT 1
) lot ON true
WHERE requirement.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  AND requirement.order_id IN (
    'd1000001-0000-4000-8000-000000000001',
    'd1000003-0000-4000-8000-000000000003'
  )
  AND least(requirement.required_base, requirement.available_at_confirmation_base) > 0;

INSERT INTO stock_movements
  (tenant_id, lot_id, type, quantity_base, occurred_at, reference_type, reference_id, reason_code, note, actor_user_id, idempotency_key)
SELECT
  reservation.tenant_id,
  reservation.lot_id,
  'RESERVE',
  reservation.quantity_base,
  now(),
  'order',
  reservation.order_id,
  'ORDER_CONFIRMED',
  'Reserva FIFO do pedido de teste',
  '991272d6-1837-4640-bda0-c825803e998d',
  'cafe-forti-reservation-' || reservation.id::text
FROM inventory_reservations reservation
WHERE reservation.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

INSERT INTO stock_movements
  (tenant_id, lot_id, type, quantity_base, occurred_at, reference_type, reference_id, reason_code, note, actor_user_id, idempotency_key)
SELECT
  requirement.tenant_id,
  lot.id,
  'CONSUME',
  requirement.required_base,
  CASE
    WHEN requirement.order_id = 'd1000002-0000-4000-8000-000000000002' THEN now() - interval '2 hours'
    ELSE now() - interval '5 days 3 hours'
  END,
  'order',
  requirement.order_id,
  'PRODUCTION_USAGE',
  'Consumo registrado na produção de teste',
  '991272d6-1837-4640-bda0-c825803e998d',
  'cafe-forti-consume-' || requirement.id::text
FROM order_requirements requirement
JOIN commercial_items item
  ON item.tenant_id = requirement.tenant_id
 AND item.ingredient_group_id = requirement.ingredient_group_id
JOIN LATERAL (
  SELECT purchase_lot.id
    FROM purchase_lots purchase_lot
   WHERE purchase_lot.tenant_id = item.tenant_id
     AND purchase_lot.commercial_item_id = item.id
   ORDER BY purchase_lot.expiry_date NULLS LAST, purchase_lot.entry_date
   LIMIT 1
) lot ON true
WHERE requirement.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  AND requirement.order_id IN (
    'd1000002-0000-4000-8000-000000000002',
    'd1000004-0000-4000-8000-000000000004'
  );

-- Planos de produção; os horários relativos mantêm a fixture útil em qualquer dia.
INSERT INTO production_plans
  (id, tenant_id, order_id, order_item_id, recipe_version_id, product_name_snapshot, scale_factor, production_mass_g, delivery_at, recommended_start_at, planned_finish_at, buffer_minutes, status, planning_version, started_at, ready_at, completed_at)
VALUES
  ('d9000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000001-0000-4000-8000-000000000001', 'd2000001-0000-4000-8000-000000000001', 'c7100001-0000-4000-8000-000000000001', 'Bolo de chocolate', 2.0, 2400, (current_date + time '17:30') AT TIME ZONE 'America/Sao_Paulo', (current_date + time '10:30') AT TIME ZONE 'America/Sao_Paulo', (current_date + time '16:30') AT TIME ZONE 'America/Sao_Paulo', 60, 'in_progress', 1, now() - interval '90 minutes', null, null),
  ('d9000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000002-0000-4000-8000-000000000002', 'd2000002-0000-4000-8000-000000000002', 'c7100002-0000-4000-8000-000000000002', 'Brownie clássico', 1.0, 1000, (current_date + time '15:00') AT TIME ZONE 'America/Sao_Paulo', (current_date + time '08:00') AT TIME ZONE 'America/Sao_Paulo', (current_date + time '13:30') AT TIME ZONE 'America/Sao_Paulo', 90, 'ready', 1, now() - interval '5 hours', now() - interval '35 minutes', null),
  ('d9000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000003-0000-4000-8000-000000000003', 'd2000003-0000-4000-8000-000000000003', 'c7100003-0000-4000-8000-000000000003', 'Torta de morango', 1.0, 1400, ((current_date + 1) + time '16:00') AT TIME ZONE 'America/Sao_Paulo', ((current_date + 1) + time '08:30') AT TIME ZONE 'America/Sao_Paulo', ((current_date + 1) + time '15:00') AT TIME ZONE 'America/Sao_Paulo', 60, 'planned', 1, null, null, null),
  ('d9000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000004-0000-4000-8000-000000000004', 'd2000004-0000-4000-8000-000000000004', 'c7100002-0000-4000-8000-000000000002', 'Brownie clássico', 1.5, 1500, ((current_date - 5) + time '14:00') AT TIME ZONE 'America/Sao_Paulo', ((current_date - 5) + time '08:00') AT TIME ZONE 'America/Sao_Paulo', ((current_date - 5) + time '13:00') AT TIME ZONE 'America/Sao_Paulo', 60, 'completed', 1, now() - interval '5 days 5 hours', now() - interval '5 days 2 hours', now() - interval '5 days 1 hour');

INSERT INTO production_moments
  (id, tenant_id, production_plan_id, source_recipe_moment_id, name_snapshot, position, planned_start_at, planned_end_at, actual_started_at, actual_completed_at, status)
SELECT
  gen_random_uuid(),
  plan.tenant_id,
  plan.id,
  source.id,
  source.name,
  source.position,
  plan.recommended_start_at + ((source.position - 1) * interval '55 minutes'),
  plan.recommended_start_at + (source.position * interval '55 minutes'),
  CASE
    WHEN plan.id IN ('d9000002-0000-4000-8000-000000000002', 'd9000004-0000-4000-8000-000000000004') THEN plan.started_at + ((source.position - 1) * interval '55 minutes')
    WHEN plan.id = 'd9000001-0000-4000-8000-000000000001' AND source.position <= 3 THEN plan.started_at + ((source.position - 1) * interval '45 minutes')
    ELSE null
  END,
  CASE
    WHEN plan.id IN ('d9000002-0000-4000-8000-000000000002', 'd9000004-0000-4000-8000-000000000004') THEN plan.started_at + (source.position * interval '55 minutes')
    WHEN plan.id = 'd9000001-0000-4000-8000-000000000001' AND source.position <= 2 THEN plan.started_at + (source.position * interval '45 minutes')
    ELSE null
  END,
  CASE
    WHEN plan.id IN ('d9000002-0000-4000-8000-000000000002', 'd9000004-0000-4000-8000-000000000004') THEN 'completed'::production_moment_status
    WHEN plan.id = 'd9000001-0000-4000-8000-000000000001' AND source.position <= 2 THEN 'completed'::production_moment_status
    WHEN plan.id = 'd9000001-0000-4000-8000-000000000001' AND source.position = 3 THEN 'in_progress'::production_moment_status
    ELSE 'pending'::production_moment_status
  END
FROM production_plans plan
JOIN recipe_moments source
  ON source.tenant_id = plan.tenant_id
 AND source.recipe_version_id = plan.recipe_version_id
WHERE plan.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

-- Uma preparação final por pedido e preparações intermediárias vinculadas aos momentos.
INSERT INTO preparation_instances
  (id, tenant_id, production_plan_id, production_moment_id, parent_preparation_instance_id, source_recipe_version_id, source_recipe_moment_id, name_snapshot, kind, dedicated_to_order, expected_output_base)
SELECT
  gen_random_uuid(),
  plan.tenant_id,
  plan.id,
  null,
  null,
  plan.recipe_version_id,
  null,
  plan.product_name_snapshot,
  'final',
  true,
  plan.production_mass_g
FROM production_plans plan
WHERE plan.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

INSERT INTO preparation_instances
  (id, tenant_id, production_plan_id, production_moment_id, parent_preparation_instance_id, source_recipe_version_id, source_recipe_moment_id, name_snapshot, kind, dedicated_to_order, expected_output_base)
SELECT
  gen_random_uuid(),
  moment.tenant_id,
  moment.production_plan_id,
  moment.id,
  final_instance.id,
  plan.recipe_version_id,
  moment.source_recipe_moment_id,
  moment.name_snapshot || ' · parte de ' || plan.product_name_snapshot,
  'intermediate',
  true,
  plan.production_mass_g
FROM production_moments moment
JOIN production_plans plan
  ON plan.tenant_id = moment.tenant_id
 AND plan.id = moment.production_plan_id
JOIN recipe_moments source
  ON source.tenant_id = moment.tenant_id
 AND source.id = moment.source_recipe_moment_id
JOIN preparation_instances final_instance
  ON final_instance.tenant_id = moment.tenant_id
 AND final_instance.production_plan_id = moment.production_plan_id
 AND final_instance.kind = 'final'
WHERE moment.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  AND source.preparation_role = 'intermediate';

WITH task_source AS (
  SELECT
    moment.tenant_id,
    moment.production_plan_id,
    moment.id AS production_moment_id,
    step.id AS source_recipe_step_id,
    step.name,
    step.instructions,
    step.kind,
    step.duration_minutes,
    step.parallelizable,
    step.attention_required_at_end,
    step.position,
    step.required_equipment_kind,
    moment.planned_start_at +
      (coalesce(sum(step.duration_minutes) OVER (
        PARTITION BY moment.id
        ORDER BY step.position
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) * interval '1 minute') AS planned_start_at,
    plan.id AS plan_id,
    plan.status AS plan_status,
    plan.started_at,
    source_moment.position AS moment_position
  FROM production_moments moment
  JOIN production_plans plan
    ON plan.tenant_id = moment.tenant_id
   AND plan.id = moment.production_plan_id
  JOIN recipe_moments source_moment
    ON source_moment.tenant_id = moment.tenant_id
   AND source_moment.id = moment.source_recipe_moment_id
  JOIN recipe_steps step
    ON step.tenant_id = moment.tenant_id
   AND step.recipe_moment_id = moment.source_recipe_moment_id
  WHERE moment.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
)
INSERT INTO production_tasks
  (id, tenant_id, production_plan_id, production_moment_id, source_recipe_step_id, name_snapshot, instructions_snapshot, kind, duration_minutes, parallelizable, attention_required_at_end, position, planned_start_at, planned_end_at, actual_started_at, actual_completed_at, next_attention_at, status, preparation_instance_id, required_equipment_kind, equipment_id)
SELECT
  gen_random_uuid(),
  source.tenant_id,
  source.production_plan_id,
  source.production_moment_id,
  source.source_recipe_step_id,
  source.name,
  source.instructions,
  source.kind,
  greatest(source.duration_minutes, 1),
  source.parallelizable,
  source.attention_required_at_end,
  source.position,
  source.planned_start_at,
  source.planned_start_at + (greatest(source.duration_minutes, 1) * interval '1 minute'),
  CASE
    WHEN source.plan_status IN ('ready', 'completed') THEN source.planned_start_at
    WHEN source.plan_id = 'd9000001-0000-4000-8000-000000000001' AND source.moment_position <= 3 THEN source.planned_start_at
    ELSE null
  END,
  CASE
    WHEN source.plan_status IN ('ready', 'completed') THEN source.planned_start_at + (greatest(source.duration_minutes, 1) * interval '1 minute')
    WHEN source.plan_id = 'd9000001-0000-4000-8000-000000000001' AND source.moment_position <= 2 THEN source.planned_start_at + (greatest(source.duration_minutes, 1) * interval '1 minute')
    ELSE null
  END,
  CASE
    WHEN source.plan_id = 'd9000001-0000-4000-8000-000000000001' AND source.source_recipe_step_id = 'c7310004-0000-4000-8000-000000000004' THEN now() + interval '12 minutes'
    ELSE null
  END,
  CASE
    WHEN source.plan_status IN ('ready', 'completed') THEN 'completed'::production_task_status
    WHEN source.plan_id = 'd9000001-0000-4000-8000-000000000001' AND source.moment_position <= 2 THEN 'completed'::production_task_status
    WHEN source.plan_id = 'd9000001-0000-4000-8000-000000000001' AND source.source_recipe_step_id = 'c7310004-0000-4000-8000-000000000004' THEN 'in_progress'::production_task_status
    WHEN source.plan_id = 'd9000001-0000-4000-8000-000000000001' AND source.source_recipe_step_id = 'c7310005-0000-4000-8000-000000000005' THEN 'waiting'::production_task_status
    ELSE 'planned'::production_task_status
  END,
  coalesce(intermediate_instance.id, final_instance.id),
  source.required_equipment_kind,
  equipment.id
FROM task_source source
JOIN preparation_instances final_instance
  ON final_instance.tenant_id = source.tenant_id
 AND final_instance.production_plan_id = source.production_plan_id
 AND final_instance.kind = 'final'
LEFT JOIN preparation_instances intermediate_instance
  ON intermediate_instance.tenant_id = source.tenant_id
 AND intermediate_instance.production_plan_id = source.production_plan_id
 AND intermediate_instance.production_moment_id = source.production_moment_id
LEFT JOIN LATERAL (
  SELECT asset.id
    FROM equipment_assets asset
   WHERE asset.tenant_id = source.tenant_id
     AND asset.kind = source.required_equipment_kind
     AND asset.status = 'active'
   ORDER BY asset.created_at
   LIMIT 1
) equipment ON source.required_equipment_kind IS NOT NULL;

INSERT INTO production_task_dependencies
  (tenant_id, production_plan_id, predecessor_task_id, successor_task_id)
SELECT
  plan.tenant_id,
  plan.id,
  predecessor.id,
  successor.id
FROM production_plans plan
JOIN recipe_step_dependencies source_dependency
  ON source_dependency.tenant_id = plan.tenant_id
 AND source_dependency.recipe_version_id = plan.recipe_version_id
JOIN production_tasks predecessor
  ON predecessor.tenant_id = plan.tenant_id
 AND predecessor.production_plan_id = plan.id
 AND predecessor.source_recipe_step_id = source_dependency.predecessor_step_id
JOIN production_tasks successor
  ON successor.tenant_id = plan.tenant_id
 AND successor.production_plan_id = plan.id
 AND successor.source_recipe_step_id = source_dependency.successor_step_id
WHERE plan.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

INSERT INTO equipment_usages
  (tenant_id, equipment_id, order_id, idempotency_key, used_at, duration_minutes, notes, production_task_id, source)
SELECT
  task.tenant_id,
  task.equipment_id,
  plan.order_id,
  gen_random_uuid(),
  task.actual_started_at::date,
  task.duration_minutes,
  'Uso registrado automaticamente pela produção de teste.',
  task.id,
  'production'
FROM production_tasks task
JOIN production_plans plan
  ON plan.tenant_id = task.tenant_id
 AND plan.id = task.production_plan_id
WHERE task.tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  AND task.equipment_id IS NOT NULL
  AND task.actual_completed_at IS NOT NULL;

-- Entradas e custos permitem testar mês, rentabilidade, parcelas e recorrências.
INSERT INTO order_receipts
  (id, tenant_id, order_id, idempotency_key, kind, amount, fee_amount, payment_method, received_at, note)
VALUES
  ('a1000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000001-0000-4000-8000-000000000001', 'a1100001-0000-4000-8000-000000000001', 'receipt', 82.00, 0, 'pix', now() - interval '4 days', 'Sinal de 50%'),
  ('a1000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000002-0000-4000-8000-000000000002', 'a1100002-0000-4000-8000-000000000002', 'receipt', 58.00, 2.10, 'card', now() - interval '1 day', 'Pagamento integral'),
  ('a1000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000003-0000-4000-8000-000000000003', 'a1100003-0000-4000-8000-000000000003', 'receipt', 55.00, 0, 'pix', now() - interval '2 days', 'Sinal de 50%'),
  ('a1000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000004-0000-4000-8000-000000000004', 'a1100004-0000-4000-8000-000000000004', 'receipt', 85.50, 0, 'cash', now() - interval '5 days', 'Pagamento na retirada');

INSERT INTO order_direct_expenses
  (id, tenant_id, order_id, idempotency_key, kind, category, description, actual_amount, estimated_amount, incurred_at, note)
VALUES
  ('a2000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000001-0000-4000-8000-000000000001', 'a2100001-0000-4000-8000-000000000001', 'expense', 'Entrega', 'Motoboy para o Gonzaga', 14.90, 15.00, current_date, 'Entrega paga pela confeitaria'),
  ('a2000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000002-0000-4000-8000-000000000002', 'a2100002-0000-4000-8000-000000000002', 'expense', 'Embalagem', 'Caixas individuais para brownie', 6.00, 6.00, current_date, null),
  ('a2000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'd1000004-0000-4000-8000-000000000004', 'a2100003-0000-4000-8000-000000000003', 'expense', 'Embalagem', 'Caixa kraft e papel manteiga', 8.00, 8.00, current_date - 5, null);

INSERT INTO expense_categories (id, tenant_id, name, normalized_name, description) VALUES
  ('a3000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Aluguel', 'aluguel', 'Espaço e condomínio'),
  ('a3000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Internet', 'internet', 'Conectividade da cozinha'),
  ('a3000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Gás', 'gas', 'Botijão ou gás encanado'),
  ('a3000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Contabilidade', 'contabilidade', 'Serviço contábil mensal');

INSERT INTO expense_recurrences
  (id, tenant_id, category_id, description, supplier, expected_amount, day_of_month, start_month, active)
VALUES
  ('a4000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000001-0000-4000-8000-000000000001', 'Aluguel do espaço de produção', 'Espaço Doce Santos', 650.00, 5, date_trunc('month', current_date)::date - interval '4 months', true),
  ('a4000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000002-0000-4000-8000-000000000002', 'Internet da cozinha', 'Vivo', 99.90, 10, date_trunc('month', current_date)::date - interval '4 months', true),
  ('a4000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000004-0000-4000-8000-000000000004', 'Assessoria contábil', 'Conta Simples', 180.00, 12, date_trunc('month', current_date)::date - interval '2 months', true);

INSERT INTO operating_expenses
  (id, tenant_id, category_id, recurrence_id, idempotency_key, description, supplier, competence, due_date, expected_amount)
VALUES
  ('a5000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000001-0000-4000-8000-000000000001', 'a4000001-0000-4000-8000-000000000001', 'a5100001-0000-4000-8000-000000000001', 'Aluguel do espaço de produção', 'Espaço Doce Santos', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 4, 650.00),
  ('a5000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000002-0000-4000-8000-000000000002', 'a4000002-0000-4000-8000-000000000002', 'a5100002-0000-4000-8000-000000000002', 'Internet da cozinha', 'Vivo', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 9, 99.90),
  ('a5000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000003-0000-4000-8000-000000000003', null, 'a5100003-0000-4000-8000-000000000003', 'Reposição do botijão de gás', 'Ultragaz', date_trunc('month', current_date)::date, current_date + 8, 125.00),
  ('a5000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a3000004-0000-4000-8000-000000000004', 'a4000003-0000-4000-8000-000000000003', 'a5100004-0000-4000-8000-000000000004', 'Assessoria contábil', 'Conta Simples', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 11, 180.00);

INSERT INTO expense_payments
  (id, tenant_id, expense_id, idempotency_key, kind, amount, paid_at, note)
VALUES
  ('a6000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a5000001-0000-4000-8000-000000000001', 'a6100001-0000-4000-8000-000000000001', 'payment', 650.00, date_trunc('month', current_date)::date + 4, 'Pago via Pix'),
  ('a6000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'a5000002-0000-4000-8000-000000000002', 'a6100002-0000-4000-8000-000000000002', 'payment', 99.90, current_date, 'Débito automático');

COMMIT;
