\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM tenants
     WHERE id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
       AND name = 'Café Forti'
  ) THEN
    RAISE EXCEPTION 'A empresa Café Forti esperada não foi encontrada.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM recipes
     WHERE tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a'
  ) THEN
    RAISE EXCEPTION 'A Café Forti já possui dados de negócio; a fixture não foi reaplicada.';
  END IF;
END
$$;

UPDATE tenant_settings
   SET default_margin_basis_points = 3800,
       default_deposit_basis_points = 5000,
       default_payment_method = 'pix',
       default_delivery_mode = 'delivery',
       business_hours = '[
         {"day":"monday","start":"08:00","end":"18:00","enabled":true},
         {"day":"tuesday","start":"08:00","end":"18:00","enabled":true},
         {"day":"wednesday","start":"08:00","end":"18:00","enabled":true},
         {"day":"thursday","start":"08:00","end":"18:00","enabled":true},
         {"day":"friday","start":"08:00","end":"18:00","enabled":true},
         {"day":"saturday","start":"08:00","end":"14:00","enabled":true},
         {"day":"sunday","start":"08:00","end":"14:00","enabled":false}
       ]'::jsonb,
       updated_at = now()
 WHERE tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

-- Taxonomia culinária: categoria organiza a despensa; grupo é o ingrediente usado na receita.
INSERT INTO ingredient_categories (id, tenant_id, name, normalized_name, kind) VALUES
  ('c1000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Chocolates e cacaus', 'chocolates e cacaus', 'ingredient'),
  ('c1000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Farinhas e secos', 'farinhas e secos', 'ingredient'),
  ('c1000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Açúcares e adoçantes', 'acucares e adocantes', 'ingredient'),
  ('c1000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Cremes e laticínios', 'cremes e laticinios', 'ingredient'),
  ('c1000005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Ovos', 'ovos', 'ingredient'),
  ('c1000006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Frutas', 'frutas', 'ingredient'),
  ('c1000007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Fermentos e aromas', 'fermentos e aromas', 'ingredient');

INSERT INTO ingredient_groups
  (id, tenant_id, name, normalized_name, category, base_dimension, base_unit, perishable, default_density_g_ml, minimum_stock, category_id)
VALUES
  ('c2000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Chocolate meio amargo', 'chocolate meio amargo', 'Chocolates e cacaus', 'mass', 'g', false, null, 1000, 'c1000001-0000-4000-8000-000000000001'),
  ('c2000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Farinha de trigo', 'farinha de trigo', 'Farinhas e secos', 'mass', 'g', false, null, 1500, 'c1000002-0000-4000-8000-000000000002'),
  ('c2000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Açúcar refinado', 'acucar refinado', 'Açúcares e adoçantes', 'mass', 'g', false, null, 1000, 'c1000003-0000-4000-8000-000000000003'),
  ('c2000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Manteiga sem sal', 'manteiga sem sal', 'Cremes e laticínios', 'mass', 'g', true, null, 400, 'c1000004-0000-4000-8000-000000000004'),
  ('c2000005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Ovo', 'ovo', 'Ovos', 'mass', 'g', true, null, 600, 'c1000005-0000-4000-8000-000000000005'),
  ('c2000006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Creme de leite', 'creme de leite', 'Cremes e laticínios', 'mass', 'g', true, 1.03, 600, 'c1000004-0000-4000-8000-000000000004'),
  ('c2000007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Morango', 'morango', 'Frutas', 'mass', 'g', true, null, 600, 'c1000006-0000-4000-8000-000000000006'),
  ('c2000008-0000-4000-8000-000000000008', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Fermento químico', 'fermento quimico', 'Fermentos e aromas', 'mass', 'g', false, null, 100, 'c1000007-0000-4000-8000-000000000007'),
  ('c2000009-0000-4000-8000-000000000009', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Leite condensado', 'leite condensado', 'Cremes e laticínios', 'mass', 'g', true, 1.28, 790, 'c1000004-0000-4000-8000-000000000004'),
  ('c2000010-0000-4000-8000-000000000010', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Essência de baunilha', 'essencia de baunilha', 'Fermentos e aromas', 'mass', 'g', false, 0.95, 30, 'c1000007-0000-4000-8000-000000000007');

INSERT INTO brands (id, tenant_id, name, normalized_name) VALUES
  ('c3000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Harald', 'harald'),
  ('c3000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Dona Benta', 'dona benta'),
  ('c3000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'União', 'uniao'),
  ('c3000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Itambé', 'itambe'),
  ('c3000005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Amélia', 'amelia'),
  ('c3000006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Royal', 'royal'),
  ('c3000007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Moça', 'moca'),
  ('c3000008-0000-4000-8000-000000000008', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Dr. Oetker', 'dr oetker');

INSERT INTO commercial_items
  (id, tenant_id, ingredient_group_id, brand_id, manufacturer_name, display_name, normalized_name, gtin, package_quantity, package_unit, net_content_base)
VALUES
  ('c4000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000001-0000-4000-8000-000000000001', 'c3000001-0000-4000-8000-000000000001', 'Harald', 'Harald Melken meio amargo 1,01 kg', 'harald melken meio amargo 1 01 kg', '7897077830712', 1, 'kg', 1010),
  ('c4000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000002-0000-4000-8000-000000000002', 'c3000002-0000-4000-8000-000000000002', 'J.Macêdo', 'Farinha Dona Benta tradicional 1 kg', 'farinha dona benta tradicional 1 kg', '7896005210008', 1, 'kg', 1000),
  ('c4000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000003-0000-4000-8000-000000000003', 'c3000003-0000-4000-8000-000000000003', 'Camil', 'Açúcar União refinado 1 kg', 'acucar uniao refinado 1 kg', '7891910000195', 1, 'kg', 1000),
  ('c4000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000004-0000-4000-8000-000000000004', 'c3000004-0000-4000-8000-000000000004', 'Itambé', 'Manteiga Itambé sem sal 200 g', 'manteiga itambe sem sal 200 g', '7896051111076', 1, 'g', 200),
  ('c4000005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000005-0000-4000-8000-000000000005', null, 'Granja Boa Vista', 'Ovos brancos grandes — dúzia', 'ovos brancos grandes duzia', null, 12, 'un', 720),
  ('c4000006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000006-0000-4000-8000-000000000006', 'c3000005-0000-4000-8000-000000000005', 'Vigor', 'Chantilly Amélia 1 L', 'chantilly amelia 1 l', '7891025112004', 1, 'l', 1030),
  ('c4000007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000007-0000-4000-8000-000000000007', null, 'Hortifruti local', 'Morango fresco bandeja 250 g', 'morango fresco bandeja 250 g', null, 1, 'g', 250),
  ('c4000008-0000-4000-8000-000000000008', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000008-0000-4000-8000-000000000008', 'c3000006-0000-4000-8000-000000000006', 'Mondelēz', 'Fermento Royal 100 g', 'fermento royal 100 g', '7622300990921', 1, 'g', 100),
  ('c4000009-0000-4000-8000-000000000009', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000009-0000-4000-8000-000000000009', 'c3000007-0000-4000-8000-000000000007', 'Nestlé', 'Leite condensado Moça 395 g', 'leite condensado moca 395 g', '7891000100103', 1, 'g', 395),
  ('c4000010-0000-4000-8000-000000000010', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c2000010-0000-4000-8000-000000000010', 'c3000008-0000-4000-8000-000000000008', 'Dr. Oetker', 'Essência de baunilha 30 ml', 'essencia de baunilha 30 ml', null, 1, 'ml', 28.5);

INSERT INTO purchase_lots
  (id, tenant_id, commercial_item_id, supplier_name, entry_date, expiry_date, quantity_initial_base, total_cost, unit_cost_base, lot_code)
VALUES
  ('c5000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000001-0000-4000-8000-000000000001', 'Atacadão', current_date - 12, current_date + 240, 3030, 119.70, 0.03950495, 'CHO-260827'),
  ('c5000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000002-0000-4000-8000-000000000002', 'Assaí', current_date - 8, current_date + 150, 4000, 27.96, 0.00699, 'FAR-260831'),
  ('c5000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000003-0000-4000-8000-000000000003', 'Assaí', current_date - 8, current_date + 365, 3000, 15.87, 0.00529, 'ACU-260831'),
  ('c5000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000004-0000-4000-8000-000000000004', 'Pão de Açúcar', current_date - 4, current_date + 45, 1000, 54.95, 0.05495, 'MAN-260904'),
  ('c5000005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000005-0000-4000-8000-000000000005', 'Granja Boa Vista', current_date - 3, current_date + 18, 2160, 53.70, 0.02486111, 'OVO-260905'),
  ('c5000006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000006-0000-4000-8000-000000000006', 'Atacadão', current_date - 3, current_date + 12, 2060, 39.80, 0.01932039, 'CRE-260905'),
  ('c5000007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000007-0000-4000-8000-000000000007', 'Hortifruti da Ana', current_date - 1, current_date + 2, 250, 11.90, 0.0476, 'MOR-260907'),
  ('c5000008-0000-4000-8000-000000000008', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000008-0000-4000-8000-000000000008', 'Assaí', current_date - 20, current_date + 220, 300, 15.87, 0.0529, 'FER-260819'),
  ('c5000009-0000-4000-8000-000000000009', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000009-0000-4000-8000-000000000009', 'Atacadão', current_date - 6, current_date + 250, 2370, 53.94, 0.02275949, 'LEI-260902'),
  ('c5000010-0000-4000-8000-000000000010', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c4000010-0000-4000-8000-000000000010', 'Pão de Açúcar', current_date - 15, current_date + 300, 85.5, 26.70, 0.31228070, 'BAU-260824');

INSERT INTO stock_movements
  (tenant_id, lot_id, type, quantity_base, occurred_at, reference_type, reason_code, note, actor_user_id, idempotency_key)
SELECT
  'f6999f8a-1ddf-47ac-a34f-566acba40b6a',
  id,
  'PURCHASE_IN',
  quantity_initial_base,
  (entry_date::timestamp + time '10:00') AT TIME ZONE 'America/Sao_Paulo',
  'fixture_purchase',
  'TEST_DATA',
  'Entrada de teste da Café Forti',
  '991272d6-1837-4640-bda0-c825803e998d',
  'cafe-forti-purchase-' || id::text
FROM purchase_lots
WHERE tenant_id = 'f6999f8a-1ddf-47ac-a34f-566acba40b6a';

INSERT INTO customers
  (id, tenant_id, name, normalized_name, primary_phone, normalized_phone, email, notes, preferred_delivery_mode, preferred_payment_method)
VALUES
  ('c6000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Marina Lopes', 'marina lopes', '(13) 98888-1234', '13988881234', 'marina.lopes@example.com', 'Prefere decoração delicada e pouco doce.', 'delivery', 'pix'),
  ('c6000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Ana Paula Ribeiro', 'ana paula ribeiro', '(13) 99721-8040', '13997218040', 'ana.paula@example.com', 'Retira pessoalmente quando o pedido é pequeno.', 'pickup', 'card'),
  ('c6000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Beatriz Santos', 'beatriz santos', '(13) 99114-6672', '13991146672', 'bia.santos@example.com', 'Avisar na portaria antes da entrega.', 'delivery', 'pix'),
  ('c6000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Lucas Almeida', 'lucas almeida', '(13) 99650-3351', '13996503351', 'lucas.almeida@example.com', null, 'pickup', 'cash');

INSERT INTO customer_addresses
  (id, tenant_id, customer_id, label, recipient, formatted_address, delivery_instructions, is_default)
VALUES
  ('c6100001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c6000001-0000-4000-8000-000000000001', 'Casa', 'Marina Lopes', 'Rua das Acácias, 128, apto. 42 — Gonzaga, Santos/SP', 'Interfone 42; deixar na portaria se necessário.', true),
  ('c6100002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c6000003-0000-4000-8000-000000000003', 'Casa', 'Beatriz Santos', 'Avenida Bernardino de Campos, 742 — Campo Grande, Santos/SP', 'Portaria do bloco B.', true),
  ('c6100003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c6000004-0000-4000-8000-000000000004', 'Trabalho', 'Lucas Almeida', 'Rua Tolentino Filgueiras, 80 — Gonzaga, Santos/SP', null, true);

-- Receitas-base. A versão publicada é o contrato preservado pelos pedidos.
INSERT INTO recipes (id, tenant_id, name, normalized_name) VALUES
  ('c7000001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Bolo de chocolate', 'bolo de chocolate'),
  ('c7000002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Brownie clássico', 'brownie classico'),
  ('c7000003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Torta de morango', 'torta de morango'),
  ('c7000004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'Brigadeiro de panela', 'brigadeiro de panela');

INSERT INTO recipe_versions
  (id, tenant_id, recipe_id, version_number, status, yield_mass_g, yield_units, expected_loss_percentage, minimum_batch_factor, rounding_rule, published_at, source_name, source_author, import_method)
VALUES
  ('c7100001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7000001-0000-4000-8000-000000000001', 1, 'published', 1200, 12, 10, 0.5, 'nearest_50g', now() - interval '120 days', 'Caderno Café Forti', 'Rudney Forti', null),
  ('c7100002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7000002-0000-4000-8000-000000000002', 1, 'published', 1000, 12, 8, 0.5, 'nearest_50g', now() - interval '90 days', 'Caderno Café Forti', 'Rudney Forti', null),
  ('c7100003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7000003-0000-4000-8000-000000000003', 1, 'published', 1400, 14, 7, 0.5, 'nearest_50g', now() - interval '60 days', 'Caderno Café Forti', 'Rudney Forti', null),
  ('c7100004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7000004-0000-4000-8000-000000000004', 1, 'draft', 790, 20, 3, 0.5, 'proportional', null, 'Caderno Café Forti', 'Rudney Forti', null);

-- Momentos e etapas do bolo de chocolate.
INSERT INTO recipe_moments (id, tenant_id, recipe_version_id, name, description, position, preparation_role) VALUES
  ('c7210001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'Mise en place', 'Separar ingredientes e utensílios antes de começar.', 1, 'intermediate'),
  ('c7210002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'Massa', 'Produzir e assar a base do bolo.', 2, 'intermediate'),
  ('c7210003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'Ganache', 'Preparar o recheio e a cobertura.', 3, 'intermediate'),
  ('c7210004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'Montagem', 'Unir massa, recheio e acabamento.', 4, 'final'),
  ('c7210005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'Finalização', 'Decorar, revisar e embalar.', 5, 'final');

INSERT INTO recipe_steps
  (id, tenant_id, recipe_version_id, recipe_moment_id, name, instructions, duration_minutes, kind, parallelizable, attention_required_at_end, position, required_equipment_kind)
VALUES
  ('c7310001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210001-0000-4000-8000-000000000001', 'Separar e pesar', 'Pese todos os ingredientes, prepare as formas e confira a embalagem.', 15, 'active', false, false, 1, null),
  ('c7310002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210002-0000-4000-8000-000000000002', 'Bater a massa', 'Bata manteiga e açúcar; junte os ovos e incorpore os secos delicadamente.', 20, 'active', false, true, 1, 'mixer'),
  ('c7310003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210002-0000-4000-8000-000000000002', 'Assar', 'Leve ao forno preaquecido a 180 °C e asse até o centro retornar ao toque.', 40, 'oven', false, true, 2, 'oven'),
  ('c7310004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210003-0000-4000-8000-000000000003', 'Preparar a ganache', 'Aqueça o creme sem ferver, verta sobre o chocolate e emulsione.', 15, 'heating', true, true, 1, 'stove'),
  ('c7310005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210003-0000-4000-8000-000000000003', 'Descansar a ganache', 'Cubra em contato e deixe ganhar textura antes da montagem.', 20, 'cooling', true, true, 2, 'refrigeration'),
  ('c7310006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210004-0000-4000-8000-000000000004', 'Rechear e cobrir', 'Nivele as camadas, recheie, cubra e confira o peso final.', 30, 'assembly', false, true, 1, null),
  ('c7310007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7210005-0000-4000-8000-000000000005', 'Decorar e embalar', 'Finalize com bicos delicados, fotografe e acomode na caixa.', 20, 'assembly', false, true, 1, null);

-- Momentos e etapas do brownie.
INSERT INTO recipe_moments (id, tenant_id, recipe_version_id, name, description, position, preparation_role) VALUES
  ('c7220001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'Mise en place', 'Separar e pesar os ingredientes.', 1, 'intermediate'),
  ('c7220002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'Massa', 'Preparar a massa densa do brownie.', 2, 'intermediate'),
  ('c7220003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'Forno', 'Assar mantendo o centro úmido.', 3, 'intermediate'),
  ('c7220004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'Finalização', 'Resfriar, cortar e embalar.', 4, 'final');

INSERT INTO recipe_steps
  (id, tenant_id, recipe_version_id, recipe_moment_id, name, instructions, duration_minutes, kind, parallelizable, attention_required_at_end, position, required_equipment_kind)
VALUES
  ('c7320001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7220001-0000-4000-8000-000000000001', 'Separar e preparar a forma', 'Pese os ingredientes e forre a forma de 20 × 20 cm.', 10, 'active', false, false, 1, null),
  ('c7320002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7220002-0000-4000-8000-000000000002', 'Misturar a massa', 'Derreta chocolate e manteiga; incorpore açúcar, ovos e farinha.', 20, 'heating', false, true, 1, 'stove'),
  ('c7320003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7220003-0000-4000-8000-000000000003', 'Assar o brownie', 'Asse a 170 °C; retire quando o centro ainda estiver levemente úmido.', 30, 'oven', false, true, 1, 'oven'),
  ('c7320004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7220004-0000-4000-8000-000000000004', 'Resfriar, cortar e embalar', 'Espere esfriar completamente, corte 12 unidades iguais e embale.', 40, 'cooling', false, true, 1, null);

-- Momentos e etapas da torta de morango.
INSERT INTO recipe_moments (id, tenant_id, recipe_version_id, name, description, position, preparation_role) VALUES
  ('c7230001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'Mise en place', 'Higienizar morangos e pesar ingredientes.', 1, 'intermediate'),
  ('c7230002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'Massa', 'Preparar a base da torta.', 2, 'intermediate'),
  ('c7230003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'Forno', 'Assar a base.', 3, 'intermediate'),
  ('c7230004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'Creme', 'Preparar e resfriar o creme.', 4, 'intermediate'),
  ('c7230005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'Montagem', 'Montar, decorar e refrigerar.', 5, 'final');

INSERT INTO recipe_steps
  (id, tenant_id, recipe_version_id, recipe_moment_id, name, instructions, duration_minutes, kind, parallelizable, attention_required_at_end, position, required_equipment_kind)
VALUES
  ('c7330001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7230001-0000-4000-8000-000000000001', 'Higienizar e pesar', 'Higienize os morangos, seque bem e separe os ingredientes.', 20, 'active', false, false, 1, null),
  ('c7330002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7230002-0000-4000-8000-000000000002', 'Preparar a massa', 'Bata a massa até ficar homogênea e espalhe na forma.', 20, 'active', false, true, 1, 'mixer'),
  ('c7330003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7230003-0000-4000-8000-000000000003', 'Assar a base', 'Asse a 180 °C até dourar; deixe esfriar antes de rechear.', 35, 'oven', false, true, 1, 'oven'),
  ('c7330004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7230004-0000-4000-8000-000000000004', 'Cozinhar o creme', 'Cozinhe em fogo baixo até engrossar e cubra em contato.', 20, 'heating', true, true, 1, 'stove'),
  ('c7330005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7230004-0000-4000-8000-000000000004', 'Resfriar o creme', 'Leve o creme à refrigeração até ficar firme.', 45, 'cold', true, true, 2, 'refrigeration'),
  ('c7330006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7230005-0000-4000-8000-000000000005', 'Montar e decorar', 'Recheie a base, distribua os morangos e finalize a apresentação.', 30, 'assembly', false, true, 1, null);

-- Rascunho de brigadeiro para testar o estado "em edição".
INSERT INTO recipe_moments (id, tenant_id, recipe_version_id, name, description, position, preparation_role) VALUES
  ('c7240001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100004-0000-4000-8000-000000000004', 'Cocção', 'Cozinhar até o ponto de enrolar.', 1, 'intermediate'),
  ('c7240002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100004-0000-4000-8000-000000000004', 'Finalização', 'Resfriar, porcionar e confeitar.', 2, 'final');

INSERT INTO recipe_steps
  (id, tenant_id, recipe_version_id, recipe_moment_id, name, instructions, duration_minutes, kind, position, required_equipment_kind)
VALUES
  ('c7340001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100004-0000-4000-8000-000000000004', 'c7240001-0000-4000-8000-000000000001', 'Cozinhar a massa', 'Misture em fogo baixo até desgrudar do fundo da panela.', 20, 'heating', 1, 'stove'),
  ('c7340002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100004-0000-4000-8000-000000000004', 'c7240002-0000-4000-8000-000000000002', 'Resfriar e porcionar', 'Resfrie, porcione e finalize conforme a encomenda.', 45, 'cooling', 1, null);

INSERT INTO recipe_step_dependencies (tenant_id, recipe_version_id, predecessor_step_id, successor_step_id) VALUES
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7310001-0000-4000-8000-000000000001', 'c7310002-0000-4000-8000-000000000002'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7310002-0000-4000-8000-000000000002', 'c7310003-0000-4000-8000-000000000003'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7310003-0000-4000-8000-000000000003', 'c7310006-0000-4000-8000-000000000006'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7310004-0000-4000-8000-000000000004', 'c7310005-0000-4000-8000-000000000005'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7310005-0000-4000-8000-000000000005', 'c7310006-0000-4000-8000-000000000006'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c7310006-0000-4000-8000-000000000006', 'c7310007-0000-4000-8000-000000000007'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7320001-0000-4000-8000-000000000001', 'c7320002-0000-4000-8000-000000000002'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7320002-0000-4000-8000-000000000002', 'c7320003-0000-4000-8000-000000000003'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c7320003-0000-4000-8000-000000000003', 'c7320004-0000-4000-8000-000000000004'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7330001-0000-4000-8000-000000000001', 'c7330002-0000-4000-8000-000000000002'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7330002-0000-4000-8000-000000000002', 'c7330003-0000-4000-8000-000000000003'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7330004-0000-4000-8000-000000000004', 'c7330005-0000-4000-8000-000000000005'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7330003-0000-4000-8000-000000000003', 'c7330006-0000-4000-8000-000000000006'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c7330005-0000-4000-8000-000000000005', 'c7330006-0000-4000-8000-000000000006'),
  ('f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100004-0000-4000-8000-000000000004', 'c7340001-0000-4000-8000-000000000001', 'c7340002-0000-4000-8000-000000000002');

INSERT INTO recipe_lines
  (id, tenant_id, recipe_version_id, ingredient_group_id, quantity_g, selection_policy, preferred_commercial_item_id, waste_percentage, position, recipe_step_id, input_quantity, input_unit, conversion_factor_to_g, conversion_source, conversion_confidence, notes)
VALUES
  ('c7410001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000002-0000-4000-8000-000000000002', 300, 'generic', null, 0, 1, 'c7310002-0000-4000-8000-000000000002', 300, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7410002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000003-0000-4000-8000-000000000003', 250, 'generic', null, 0, 2, 'c7310002-0000-4000-8000-000000000002', 250, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7410003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000005-0000-4000-8000-000000000005', 240, 'generic', null, 0, 3, 'c7310002-0000-4000-8000-000000000002', 4, 'unit', 60, '60 g por ovo', 'provided', '4 ovos grandes'),
  ('c7410004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000004-0000-4000-8000-000000000004', 150, 'generic', null, 0, 4, 'c7310002-0000-4000-8000-000000000002', 150, 'g', 1, 'Ficha Café Forti', 'provided', 'Em ponto de pomada'),
  ('c7410005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000008-0000-4000-8000-000000000008', 10, 'generic', null, 0, 5, 'c7310002-0000-4000-8000-000000000002', 10, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7410006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000001-0000-4000-8000-000000000001', 200, 'preferred', 'c4000001-0000-4000-8000-000000000001', 0, 6, 'c7310004-0000-4000-8000-000000000004', 200, 'g', 1, 'Ficha Café Forti', 'provided', 'Harald preferencial'),
  ('c7410007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100001-0000-4000-8000-000000000001', 'c2000006-0000-4000-8000-000000000006', 200, 'preferred', 'c4000006-0000-4000-8000-000000000006', 0, 7, 'c7310004-0000-4000-8000-000000000004', 200, 'g', 1, 'Ficha Café Forti', 'provided', 'Amélia preferencial'),
  ('c7420001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c2000001-0000-4000-8000-000000000001', 300, 'preferred', 'c4000001-0000-4000-8000-000000000001', 0, 1, 'c7320002-0000-4000-8000-000000000002', 300, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7420002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c2000004-0000-4000-8000-000000000004', 200, 'generic', null, 0, 2, 'c7320002-0000-4000-8000-000000000002', 200, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7420003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c2000003-0000-4000-8000-000000000003', 250, 'generic', null, 0, 3, 'c7320002-0000-4000-8000-000000000002', 250, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7420004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c2000005-0000-4000-8000-000000000005', 180, 'generic', null, 0, 4, 'c7320002-0000-4000-8000-000000000002', 3, 'unit', 60, '60 g por ovo', 'provided', '3 ovos grandes'),
  ('c7420005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100002-0000-4000-8000-000000000002', 'c2000002-0000-4000-8000-000000000002', 120, 'generic', null, 0, 5, 'c7320002-0000-4000-8000-000000000002', 120, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7430001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000002-0000-4000-8000-000000000002', 250, 'generic', null, 0, 1, 'c7330002-0000-4000-8000-000000000002', 250, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7430002-0000-4000-8000-000000000002', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000003-0000-4000-8000-000000000003', 200, 'generic', null, 0, 2, 'c7330002-0000-4000-8000-000000000002', 200, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7430003-0000-4000-8000-000000000003', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000005-0000-4000-8000-000000000005', 240, 'generic', null, 0, 3, 'c7330002-0000-4000-8000-000000000002', 4, 'unit', 60, '60 g por ovo', 'provided', null),
  ('c7430004-0000-4000-8000-000000000004', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000004-0000-4000-8000-000000000004', 120, 'generic', null, 0, 4, 'c7330002-0000-4000-8000-000000000002', 120, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7430005-0000-4000-8000-000000000005', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000008-0000-4000-8000-000000000008', 10, 'generic', null, 0, 5, 'c7330002-0000-4000-8000-000000000002', 10, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7430006-0000-4000-8000-000000000006', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000006-0000-4000-8000-000000000006', 300, 'preferred', 'c4000006-0000-4000-8000-000000000006', 0, 6, 'c7330004-0000-4000-8000-000000000004', 300, 'g', 1, 'Ficha Café Forti', 'provided', null),
  ('c7430007-0000-4000-8000-000000000007', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100003-0000-4000-8000-000000000003', 'c2000007-0000-4000-8000-000000000007', 600, 'generic', null, 5, 7, 'c7330006-0000-4000-8000-000000000006', 600, 'g', 1, 'Ficha Café Forti', 'provided', 'Escolher frutas firmes e maduras'),
  ('c7440001-0000-4000-8000-000000000001', 'f6999f8a-1ddf-47ac-a34f-566acba40b6a', 'c7100004-0000-4000-8000-000000000004', 'c2000009-0000-4000-8000-000000000009', 790, 'preferred', 'c4000009-0000-4000-8000-000000000009', 0, 1, 'c7340001-0000-4000-8000-000000000001', 2, 'unit', 395, '395 g por embalagem', 'provided', '2 latas');

COMMIT;
