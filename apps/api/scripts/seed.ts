import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://confeitaria_admin:confeitaria_admin@localhost:55432/confeitaria";

const tenants = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "stefanie-dellavolpe-doces",
    name: "Stefanie Dellavolpe Doces",
    email: "stefanie@example.invalid",
    displayName: "Stefanie",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    slug: "confeitaria-vizinha",
    name: "Confeitaria Vizinha",
    email: "vizinha@example.invalid",
    displayName: "Empresa de isolamento",
  },
];

async function main() {
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql.begin(async (transaction) => {
      for (const tenant of tenants) {
        await transaction`
          insert into tenants (id, name, slug)
          values (${tenant.id}, ${tenant.name}, ${tenant.slug})
          on conflict (id) do update set name = excluded.name, slug = excluded.slug
        `;
        await transaction`
          insert into app_users (id, external_subject, email, display_name)
          values (${tenant.userId}, ${`seed:${tenant.slug}`}, ${tenant.email}, ${tenant.displayName})
          on conflict (id) do update
          set email = excluded.email, display_name = excluded.display_name
        `;
        await transaction`
          insert into memberships (tenant_id, user_id, role)
          values (${tenant.id}, ${tenant.userId}, 'owner')
          on conflict (tenant_id, user_id) do nothing
        `;
        await transaction`
          insert into tenant_settings (tenant_id, timezone, default_margin_basis_points)
          values (${tenant.id}, 'America/Sao_Paulo', 3500)
          on conflict (tenant_id) do nothing
        `;
      }

      const tenantId = tenants[0]!.id;
      await transaction`
        insert into customers (
          id, tenant_id, name, normalized_name, primary_phone,
          normalized_phone, email, preferred_delivery_mode,
          preferred_payment_method, notes
        ) values
          ('91111111-1111-4111-8111-111111111111', ${tenantId}, 'Ana Paula', 'ana paula', '(11) 98888-1234', '11988881234', 'ana@example.invalid', 'delivery', 'pix', 'Prefere confirmações objetivas pelo WhatsApp.'),
          ('92222222-2222-4222-8222-222222222222', ${tenantId}, 'Marina Lopes', 'marina lopes', '(11) 97777-4455', '11977774455', null, 'pickup', 'pix', null),
          ('93333333-3333-4333-8333-333333333333', ${tenantId}, 'Beatriz Nunes', 'beatriz nunes', '(11) 96666-7788', '11966667788', 'beatriz@example.invalid', 'delivery', 'card', 'Entregas em horário comercial.')
        on conflict (id) do update
        set name = excluded.name,
            normalized_name = excluded.normalized_name,
            primary_phone = excluded.primary_phone,
            normalized_phone = excluded.normalized_phone,
            email = excluded.email,
            preferred_delivery_mode = excluded.preferred_delivery_mode,
            preferred_payment_method = excluded.preferred_payment_method,
            notes = excluded.notes
      `;
      await transaction`
        insert into customer_addresses (
          id, tenant_id, customer_id, label, recipient, formatted_address,
          postal_code, street, address_number, address_complement,
          neighborhood, city, state, delivery_instructions, is_default
        ) values
          ('94111111-1111-4111-8111-111111111111', ${tenantId}, '91111111-1111-4111-8111-111111111111', 'Casa', 'Ana Paula', 'Rua das Acácias, 128 · Centro', null, 'Rua das Acácias', '128', null, 'Centro', null, null, 'Interfone 12; deixar na portaria somente com autorização.', true),
          ('94333333-3333-4333-8333-333333333333', ${tenantId}, '93333333-3333-4333-8333-333333333333', 'Trabalho', 'Beatriz Nunes', 'Av. das Flores, 440 · Jardim América', null, 'Av. das Flores', '440', null, 'Jardim América', null, null, 'Recepção no térreo.', true)
        on conflict (id) do update
        set label = excluded.label,
            recipient = excluded.recipient,
            formatted_address = excluded.formatted_address,
            postal_code = excluded.postal_code,
            street = excluded.street,
            address_number = excluded.address_number,
            address_complement = excluded.address_complement,
            neighborhood = excluded.neighborhood,
            city = excluded.city,
            state = excluded.state,
            delivery_instructions = excluded.delivery_instructions,
            is_default = excluded.is_default,
            updated_at = now()
      `;
      await transaction`
        insert into tenant_order_sequences (tenant_id, next_number)
        values (${tenantId}, 1043)
        on conflict (tenant_id) do nothing
      `;
      await transaction`
        insert into ingredient_categories (
          id, tenant_id, name, normalized_name, kind
        ) values
          ('21111111-1111-4111-8111-111111111111', ${tenantId}, 'Chocolates e cacaus', 'chocolates e cacaus', 'ingredient'),
          ('22222222-2222-4222-8222-222222222223', ${tenantId}, 'Cremes e laticínios', 'cremes e laticinios', 'ingredient'),
          ('23333333-3333-4333-8333-333333333333', ${tenantId}, 'Frutas', 'frutas', 'ingredient')
        on conflict (tenant_id, normalized_name) where active do update
        set name = excluded.name, kind = excluded.kind
      `;
      await transaction`
        insert into ingredient_groups (
          id, tenant_id, name, normalized_name, category_id, category, base_dimension,
          base_unit, perishable, default_density_g_ml, minimum_stock
        ) values
          (
            '31111111-1111-4111-8111-111111111111', ${tenantId},
            'Chocolate meio amargo', 'chocolate meio amargo',
            '21111111-1111-4111-8111-111111111111', 'Chocolates e cacaus',
            'mass', 'g', false, null, 1500
          ),
          (
            '32222222-2222-4222-8222-222222222222', ${tenantId},
            'Chantilly', 'chantilly',
            '22222222-2222-4222-8222-222222222223', 'Cremes e laticínios',
            'mass', 'g', true, 1, 1000
          ),
          (
            '33333333-3333-4333-8333-333333333333', ${tenantId},
            'Morango', 'morango',
            '23333333-3333-4333-8333-333333333333', 'Frutas',
            'mass', 'g', true, null, 600
          )
        on conflict (tenant_id, normalized_name) where active do update
        set category_id = excluded.category_id,
            category = excluded.category,
            minimum_stock = excluded.minimum_stock
      `;
      await transaction`
        insert into brands (id, tenant_id, name, normalized_name) values
          ('41111111-1111-4111-8111-111111111111', ${tenantId}, 'Harald', 'harald'),
          ('42222222-2222-4222-8222-222222222222', ${tenantId}, 'Sicao', 'sicao'),
          ('43333333-3333-4333-8333-333333333333', ${tenantId}, 'Amélia', 'amelia')
        on conflict (tenant_id, normalized_name) do update set name = excluded.name
      `;
      await transaction`
        insert into commercial_items (
          id, tenant_id, ingredient_group_id, brand_id, display_name,
          normalized_name, gtin, package_quantity, package_unit, net_content_base
        ) values
          (
            '51111111-1111-4111-8111-111111111111', ${tenantId},
            '31111111-1111-4111-8111-111111111111',
            '41111111-1111-4111-8111-111111111111',
            'Harald Melken meio amargo 1,01 kg',
            'harald melken meio amargo 1 01 kg', '7897077821017', 1, 'kg', 1010
          ),
          (
            '52222222-2222-4222-8222-222222222222', ${tenantId},
            '31111111-1111-4111-8111-111111111111',
            '42222222-2222-4222-8222-222222222222',
            'Sicao Nobre meio amargo 1,01 kg',
            'sicao nobre meio amargo 1 01 kg', '7891118001017', 1, 'kg', 1010
          ),
          (
            '53333333-3333-4333-8333-333333333333', ${tenantId},
            '32222222-2222-4222-8222-222222222222',
            '43333333-3333-4333-8333-333333333333',
            'Chantilly Amélia 1 L',
            'chantilly amelia 1 l', '7896010401514', 1, 'l', 1000
          ),
          (
            '54444444-4444-4444-8444-444444444444', ${tenantId},
            '33333333-3333-4333-8333-333333333333', null,
            'Morango fresco bandeja 250 g',
            'morango fresco bandeja 250 g', null, 1, 'g', 250
          )
        on conflict (id) do update
        set display_name = excluded.display_name,
            normalized_name = excluded.normalized_name,
            net_content_base = excluded.net_content_base
      `;
      await transaction`
        insert into purchase_lots (
          id, tenant_id, commercial_item_id, supplier_name, entry_date,
          expiry_date, quantity_initial_base, total_cost, unit_cost_base,
          lot_code, source
        ) values
          (
            '61111111-1111-4111-8111-111111111111', ${tenantId},
            '51111111-1111-4111-8111-111111111111', 'Atacadão',
            '2026-08-18', '2027-02-20', 2020, 67.80, 67.80 / 2020,
            'HML-0826', 'manual'
          ),
          (
            '62222222-2222-4222-8222-222222222222', ${tenantId},
            '52222222-2222-4222-8222-222222222222', 'Loja do Confeiteiro',
            '2026-08-10', '2026-12-15', 1010, 31.90, 31.90 / 1010,
            'SIC-401', 'manual'
          ),
          (
            '63333333-3333-4333-8333-333333333333', ${tenantId},
            '53333333-3333-4333-8333-333333333333', 'Assaí',
            '2026-08-22', '2026-09-03', 1000, 19.90, 19.90 / 1000,
            'AME-228', 'manual'
          )
        on conflict (id) do nothing
      `;
      await transaction`
        insert into stock_movements (
          id, tenant_id, lot_id, type, quantity_base,
          reference_type, reference_id, note
        ) values
          (
            '71111111-1111-4111-8111-111111111111', ${tenantId},
            '61111111-1111-4111-8111-111111111111', 'PURCHASE_IN', 2020,
            'purchase_lot', '61111111-1111-4111-8111-111111111111', 'Seed demonstrativo'
          ),
          (
            '72222222-2222-4222-8222-222222222222', ${tenantId},
            '62222222-2222-4222-8222-222222222222', 'PURCHASE_IN', 1010,
            'purchase_lot', '62222222-2222-4222-8222-222222222222', 'Seed demonstrativo'
          ),
          (
            '73333333-3333-4333-8333-333333333333', ${tenantId},
            '63333333-3333-4333-8333-333333333333', 'PURCHASE_IN', 1000,
            'purchase_lot', '63333333-3333-4333-8333-333333333333', 'Seed demonstrativo'
          )
        on conflict (id) do nothing
      `;
      await transaction`
        insert into recipes (
          id, tenant_id, name, normalized_name
        ) values (
          '81111111-1111-4111-8111-111111111111', ${tenantId},
          'Bolo de chocolate', 'bolo de chocolate'
        )
        on conflict (id) do update
        set name = excluded.name, normalized_name = excluded.normalized_name
      `;
      await transaction`
        insert into recipe_versions (
          id, tenant_id, recipe_id, version_number, status, yield_mass_g,
          yield_units, expected_loss_percentage, published_at
        ) values (
          '82111111-1111-4111-8111-111111111111', ${tenantId},
          '81111111-1111-4111-8111-111111111111', 1, 'published', 1200,
          12, 3, '2026-08-24T12:00:00-03:00'
        )
        on conflict (tenant_id, recipe_id, version_number) do update
        set status = excluded.status,
            yield_mass_g = excluded.yield_mass_g,
            yield_units = excluded.yield_units,
            expected_loss_percentage = excluded.expected_loss_percentage,
            published_at = excluded.published_at
      `;
      await transaction`
        insert into recipe_lines (
          id, tenant_id, recipe_version_id, ingredient_group_id, quantity_g,
          input_quantity, input_unit, conversion_factor_to_g, conversion_confidence,
          selection_policy, preferred_commercial_item_id, waste_percentage, position
        ) values
          (
            '84111111-1111-4111-8111-111111111111', ${tenantId},
            '82111111-1111-4111-8111-111111111111',
            '31111111-1111-4111-8111-111111111111', 500, 500, 'g', 1, 'provided',
            'preferred', '51111111-1111-4111-8111-111111111111', 2, 0
          ),
          (
            '84222222-2222-4222-8222-222222222222', ${tenantId},
            '82111111-1111-4111-8111-111111111111',
            '32222222-2222-4222-8222-222222222222', 300, 300, 'g', 1, 'provided',
            'preferred', '53333333-3333-4333-8333-333333333333', 0, 1
          )
        on conflict (id) do update
        set quantity_g = excluded.quantity_g,
            input_quantity = excluded.input_quantity,
            input_unit = excluded.input_unit,
            conversion_factor_to_g = excluded.conversion_factor_to_g,
            conversion_confidence = excluded.conversion_confidence,
            selection_policy = excluded.selection_policy,
            preferred_commercial_item_id = excluded.preferred_commercial_item_id,
            waste_percentage = excluded.waste_percentage,
            position = excluded.position
      `;
      await transaction`
        insert into recipe_moments (
          id, tenant_id, recipe_version_id, name, preparation_role, position
        ) values
          ('83111111-1111-4111-8111-111111111111', ${tenantId}, '82111111-1111-4111-8111-111111111111', 'Massa', 'intermediate', 0),
          ('83222222-2222-4222-8222-222222222222', ${tenantId}, '82111111-1111-4111-8111-111111111111', 'Ganache', 'intermediate', 1),
          ('83333333-3333-4333-8333-333333333333', ${tenantId}, '82111111-1111-4111-8111-111111111111', 'Desenforme', 'final', 2),
          ('83444444-4444-4444-8444-444444444444', ${tenantId}, '82111111-1111-4111-8111-111111111111', 'Montagem', 'final', 3),
          ('83555555-5555-4555-8555-555555555555', ${tenantId}, '82111111-1111-4111-8111-111111111111', 'Pronto', 'final', 4)
        on conflict (id) do update
        set name = excluded.name,
            preparation_role = excluded.preparation_role,
            position = excluded.position
      `;
      await transaction`
        insert into recipe_steps (
          id, tenant_id, recipe_version_id, recipe_moment_id, name,
          instructions, duration_minutes, kind, parallelizable, position
        ) values
          ('85111111-1111-4111-8111-111111111111', ${tenantId}, '82111111-1111-4111-8111-111111111111', '83111111-1111-4111-8111-111111111111', 'Preparar e assar a massa', 'Misture a massa e asse até o centro firmar.', 55, 'oven', false, 0),
          ('85222222-2222-4222-8222-222222222222', ${tenantId}, '82111111-1111-4111-8111-111111111111', '83222222-2222-4222-8222-222222222222', 'Preparar a ganache', 'Aqueça o creme e incorpore ao chocolate.', 25, 'active', true, 0),
          ('85333333-3333-4333-8333-333333333333', ${tenantId}, '82111111-1111-4111-8111-111111111111', '83333333-3333-4333-8333-333333333333', 'Resfriar e desenformar', 'Aguarde o resfriamento antes de desenformar.', 50, 'cooling', true, 0),
          ('85444444-4444-4444-8444-444444444444', ${tenantId}, '82111111-1111-4111-8111-111111111111', '83444444-4444-4444-8444-444444444444', 'Rechear e finalizar', 'Monte as camadas e aplique o acabamento.', 40, 'assembly', false, 0),
          ('85555555-5555-4555-8555-555555555555', ${tenantId}, '82111111-1111-4111-8111-111111111111', '83555555-5555-4555-8555-555555555555', 'Conferir e embalar', 'Confira acabamento, peso e embalagem.', 10, 'active', false, 0)
        on conflict (id) do update
        set name = excluded.name,
            instructions = excluded.instructions,
            duration_minutes = excluded.duration_minutes,
            kind = excluded.kind,
            parallelizable = excluded.parallelizable,
            position = excluded.position
      `;
      await transaction`
        insert into recipe_step_dependencies (
          tenant_id, recipe_version_id, predecessor_step_id, successor_step_id
        ) values
          (${tenantId}, '82111111-1111-4111-8111-111111111111', '85111111-1111-4111-8111-111111111111', '85333333-3333-4333-8333-333333333333'),
          (${tenantId}, '82111111-1111-4111-8111-111111111111', '85222222-2222-4222-8222-222222222222', '85444444-4444-4444-8444-444444444444'),
          (${tenantId}, '82111111-1111-4111-8111-111111111111', '85333333-3333-4333-8333-333333333333', '85444444-4444-4444-8444-444444444444'),
          (${tenantId}, '82111111-1111-4111-8111-111111111111', '85444444-4444-4444-8444-444444444444', '85555555-5555-4555-8555-555555555555')
        on conflict (tenant_id, predecessor_step_id, successor_step_id) do nothing
      `;
      await transaction`
        update recipe_lines
        set recipe_step_id = case id
          when '84111111-1111-4111-8111-111111111111'::uuid
            then '85111111-1111-4111-8111-111111111111'::uuid
          when '84222222-2222-4222-8222-222222222222'::uuid
            then '85222222-2222-4222-8222-222222222222'::uuid
        end
        where tenant_id = ${tenantId}
          and id in (
            '84111111-1111-4111-8111-111111111111'::uuid,
            '84222222-2222-4222-8222-222222222222'::uuid
          )
      `;
    });

    process.stdout.write(
      "Dados demonstrativos criados para dois tenants, Despensa e Receita piloto.\n",
    );
  } finally {
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
