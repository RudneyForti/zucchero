import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://confeitaria_app:confeitaria_app@localhost:55432/confeitaria";

describe("isolamento RLS", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(databaseUrl, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  it("retorna somente a configuração do tenant corrente", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantA}, true)`;
      return transaction<{ tenant_id: string }[]>`
        select tenant_id from tenant_settings order by tenant_id
      `;
    });

    expect(rows.map((row) => row.tenant_id)).toEqual([tenantA]);
  });

  it("não permite alterar a configuração de outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantA}, true)`;
      return transaction<{ tenant_id: string }[]>`
        update tenant_settings
        set default_margin_basis_points = 9900
        where tenant_id = ${tenantB}
        returning tenant_id
      `;
    });

    expect(rows).toHaveLength(0);
  });

  it("não expõe os insumos da empresa piloto para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; name: string }[]>`
        select tenant_id, name from ingredient_groups order by name
      `;
    });

    expect(rows).toEqual([]);
  });

  it("não expõe as receitas publicadas da empresa piloto para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; name: string }[]>`
        select tenant_id, name from recipes order by name
      `;
    });

    expect(rows).toEqual([]);
  });

  it("não expõe categorias da despensa para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; name: string }[]>`
        select tenant_id, name from ingredient_categories order by name
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe clientes da empresa piloto para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; name: string }[]>`
        select tenant_id, name from customers order by name
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe a agenda de produção da empresa piloto para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; product: string }[]>`
        select tenant_id, product_name_snapshot as product
        from production_plans
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe observações de preparo para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; body: string }[]>`
        select tenant_id, body from production_notes
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe apontamentos de consumo para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; actual_used_base: number }[]>`
        select tenant_id, actual_used_base
        from production_task_consumptions
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe correções de consumo para outro tenant", async () => {
    const result = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      const corrections = await transaction<{ tenant_id: string }[]>`
        select tenant_id from production_consumption_corrections
      `;
      const lines = await transaction<{ tenant_id: string }[]>`
        select tenant_id from production_consumption_correction_lines
      `;
      return { corrections, lines };
    });
    expect(result.corrections).toEqual([]);
    expect(result.lines).toEqual([]);
  });

  it("não expõe preparações instanciadas para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; name_snapshot: string }[]>`
        select tenant_id, name_snapshot from preparation_instances
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe recebimentos de pedidos para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; amount: number }[]>`
        select tenant_id, amount from order_receipts
      `;
    });
    expect(rows).toEqual([]);
  });

  it("não expõe despesas diretas de pedidos para outro tenant", async () => {
    const rows = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      return transaction<{ tenant_id: string; actual_amount: number }[]>`
        select tenant_id, actual_amount from order_direct_expenses
      `;
    });
    expect(rows).toEqual([]);
  });

  it("mantém categorias, contas, recorrências e pagamentos dentro do tenant", async () => {
    const result = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      const categories = await transaction<
        { tenant_id: string }[]
      >`select distinct tenant_id from expense_categories`;
      const recurrences = await transaction<
        { tenant_id: string }[]
      >`select distinct tenant_id from expense_recurrences`;
      const expenses = await transaction<
        { tenant_id: string }[]
      >`select distinct tenant_id from operating_expenses`;
      const payments = await transaction<
        { tenant_id: string }[]
      >`select distinct tenant_id from expense_payments`;
      return { categories, recurrences, expenses, payments };
    });

    expect(result.categories.every((row) => row.tenant_id === tenantB)).toBe(
      true,
    );
    expect(result.recurrences.every((row) => row.tenant_id === tenantB)).toBe(
      true,
    );
    expect(result.expenses.every((row) => row.tenant_id === tenantB)).toBe(
      true,
    );
    expect(result.payments.every((row) => row.tenant_id === tenantB)).toBe(
      true,
    );
  });

  it("isola equipamentos, manutenções e usos entre empresas", async () => {
    const result = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      const assets = await transaction<
        { tenant_id: string }[]
      >`select tenant_id from equipment_assets`;
      const maintenance = await transaction<
        { tenant_id: string }[]
      >`select tenant_id from equipment_maintenance_events`;
      const usages = await transaction<
        { tenant_id: string }[]
      >`select tenant_id from equipment_usages`;
      return { assets, maintenance, usages };
    });

    expect(result.assets).toEqual([]);
    expect(result.maintenance).toEqual([]);
    expect(result.usages).toEqual([]);
  });
});
