import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import { ProductionService } from "../src/modules/production/production.service";

const tenantId = "11111111-1111-4111-8111-111111111111";
const appDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgres://confeitaria_app:confeitaria_app@localhost:55432/confeitaria";
const adminDatabaseUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://confeitaria_admin:confeitaria_admin@localhost:55432/confeitaria";

describe("ciclo de vida transacional dos pedidos", () => {
  let admin: Sql;
  let database: DatabaseService;
  let service: OrdersService;
  let productionService: ProductionService;
  let originalNextNumber = 0;
  const testEquipmentId = randomUUID();
  const testEquipmentIdempotencyKey = randomUUID();
  let originalOvenStatuses: Array<{ id: string; status: string }> = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = appDatabaseUrl;
    admin = postgres(adminDatabaseUrl, { max: 1 });
    database = new DatabaseService();
    service = new OrdersService(database);
    productionService = new ProductionService(database);
    const [sequence] = await admin<[{ next_number: number }]>`
      select next_number
      from tenant_order_sequences
      where tenant_id = ${tenantId}
    `;
    originalNextNumber = sequence.next_number;
    originalOvenStatuses = await admin<Array<{ id: string; status: string }>>`
      select id, status::text
      from equipment_assets
      where tenant_id = ${tenantId}
        and kind = 'oven'
    `;
    await admin`
      update equipment_assets
      set status = 'maintenance'
      where tenant_id = ${tenantId}
        and kind = 'oven'
    `;
    await admin`
      insert into equipment_assets (
        id, tenant_id, idempotency_key, name, normalized_name, kind, status, notes
      ) values (
        ${testEquipmentId}, ${tenantId}, ${testEquipmentIdempotencyKey},
        'Forno exclusivo dos testes', 'forno exclusivo dos testes', 'oven', 'active',
        'Recurso temporário da suíte de integração.'
      )
    `;
  });

  afterEach(async () => {
    for (const orderId of createdOrderIds) {
      await admin.begin(async (transaction) => {
        await transaction`
          delete from audit_events
          where tenant_id = ${tenantId}
            and payload ->> 'planId' in (
              select id::text from production_plans where order_id = ${orderId}
            )
        `;
        await transaction`
          delete from audit_events
          where tenant_id = ${tenantId}
            and payload ->> 'taskId' in (
              select tasks.id::text
              from production_tasks tasks
              join production_plans plans on plans.id = tasks.production_plan_id
              where plans.order_id = ${orderId}
            )
        `;
        await transaction`
          delete from production_notes
          where production_task_id in (
            select tasks.id
            from production_tasks tasks
            join production_plans plans on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`alter table stock_movements disable trigger user`;
        await transaction`
          delete from stock_movements
          where reference_id in (
            select correction_lines.id
            from production_consumption_correction_lines correction_lines
            join production_task_consumptions consumptions
              on consumptions.id = correction_lines.consumption_id
            join production_tasks tasks
              on tasks.id = consumptions.production_task_id
            join production_plans plans
              on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`
          delete from stock_movements
          where reference_id in (
            select consumptions.id
            from production_task_consumptions consumptions
            join production_tasks tasks
              on tasks.id = consumptions.production_task_id
            join production_plans plans
              on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`
          delete from production_consumption_correction_lines
          where consumption_id in (
            select consumptions.id
            from production_task_consumptions consumptions
            join production_tasks tasks
              on tasks.id = consumptions.production_task_id
            join production_plans plans
              on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`
          delete from production_consumption_corrections
          where production_task_id in (
            select tasks.id
            from production_tasks tasks
            join production_plans plans
              on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`
          delete from production_task_consumptions
          where production_task_id in (
            select tasks.id
            from production_tasks tasks
            join production_plans plans on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`
          delete from equipment_usages
          where production_task_id in (
            select tasks.id
            from production_tasks tasks
            join production_plans plans on plans.id = tasks.production_plan_id
            where plans.order_id = ${orderId}
          )
        `;
        await transaction`
          delete from production_tasks
          where production_plan_id in (
            select id from production_plans where order_id = ${orderId}
          )
        `;
        await transaction`
          delete from preparation_instances
          where production_plan_id in (
            select id from production_plans where order_id = ${orderId}
          )
        `;
        await transaction`
          delete from production_moments
          where production_plan_id in (
            select id from production_plans where order_id = ${orderId}
          )
        `;
        await transaction`delete from production_plans where order_id = ${orderId}`;
        await transaction`delete from shopping_needs where order_id = ${orderId}`;
        await transaction`delete from inventory_reservations where order_id = ${orderId}`;
        await transaction`delete from stock_movements where reference_id = ${orderId}`;
        await transaction`alter table stock_movements enable trigger user`;
        await transaction`delete from order_requirements where order_id = ${orderId}`;
        await transaction`delete from order_items where order_id = ${orderId}`;
        await transaction`delete from order_receipts where order_id = ${orderId}`;
        await transaction`delete from order_direct_expenses where order_id = ${orderId}`;
        await transaction`
          delete from audit_events
          where tenant_id = ${tenantId}
            and payload ->> 'orderId' = ${orderId}
        `;
        await transaction`delete from orders where id = ${orderId}`;
      });
    }
    createdOrderIds.length = 0;
    await admin`
      update tenant_order_sequences
      set next_number = ${originalNextNumber}
      where tenant_id = ${tenantId}
    `;
  });

  afterAll(async () => {
    await admin`delete from equipment_assets where id = ${testEquipmentId}`;
    for (const equipment of originalOvenStatuses) {
      await admin`
        update equipment_assets
        set status = ${equipment.status}::equipment_status
        where id = ${equipment.id}
      `;
    }
    await database.onModuleDestroy();
    await admin.end();
  });

  async function confirmTestOrder() {
    const result = await service.confirm(tenantId, {
      idempotencyKey: randomUUID(),
      customerId: "91111111-1111-4111-8111-111111111111",
      customerName: "Ana Paula",
      customerPhone: "(11) 98888-1234",
      deliveryMode: "pickup",
      deliveryAt: "2026-08-28T17:30:00-03:00",
      recipeId: "81111111-1111-4111-8111-111111111111",
      recipeVersionNumber: 1,
      requestedMassG: 1_200,
      productionIncrementG: 50,
      additionalCost: 5,
      targetMarginPercentage: 40,
      depositPercentage: 50,
      paymentMethod: "pix",
    });
    createdOrderIds.push(result.order.id);
    return result.order;
  }

  it("libera reservas e cancela faltas sem apagar movimentos", async () => {
    const order = await confirmTestOrder();
    const result = await service.updateStatus(tenantId, order.id, {
      status: "cancelled",
      cancellationReason: "Cancelamento de validação automatizada.",
    });

    const movements = await admin<{ type: string }[]>`
      select type from stock_movements
      where reference_id = ${order.id}
      order by occurred_at, type
    `;
    const needs = await admin<{ status: string }[]>`
      select status from shopping_needs where order_id = ${order.id}
    `;

    expect(result.order.status).toBe("cancelled");
    expect(movements.some((movement) => movement.type === "RESERVE")).toBe(
      true,
    );
    expect(movements.some((movement) => movement.type === "RELEASE")).toBe(
      true,
    );
    expect(needs.every((need) => need.status === "cancelled")).toBe(true);
  });

  it("concilia a reserva com consumo ao concluir", async () => {
    const order = await confirmTestOrder();
    await service.updateStatus(tenantId, order.id, {
      status: "in_production",
    });
    await service.updateStatus(tenantId, order.id, { status: "ready" });
    const result = await service.updateStatus(tenantId, order.id, {
      status: "completed",
    });

    const movements = await admin<{ type: string }[]>`
      select type from stock_movements where reference_id = ${order.id}
    `;

    expect(result.order.status).toBe("completed");
    expect(movements.some((movement) => movement.type === "RELEASE")).toBe(
      true,
    );
    expect(movements.some((movement) => movement.type === "CONSUME")).toBe(
      true,
    );
  });

  it("registra entradas, desconta taxas do resultado e estorna sem apagar", async () => {
    const order = await confirmTestOrder();
    const receipt = await service.registerReceipt(tenantId, order.id, {
      idempotencyKey: randomUUID(),
      amount: 20,
      feeAmount: 1.25,
      paymentMethod: "card",
      receivedAt: "2026-08-26T12:00:00-03:00",
      note: "Sinal no cartão",
    });

    expect(receipt.order.paymentResult.status).toBe("partial");
    expect(receipt.order.paymentResult.grossReceived).toBe(20);
    expect(receipt.order.paymentResult.feeTotal).toBe(1.25);
    expect(receipt.order.paymentResult.netReceived).toBe(18.75);
    expect(receipt.order.costResult.paymentFee).toBe(1.25);

    const receiptId = receipt.order.paymentResult.receipts[0]!.id;
    const reversed = await service.reverseReceipt(
      tenantId,
      order.id,
      receiptId,
      { reason: "Lançamento duplicado no teste." },
    );
    const rows = await admin<
      { kind: string; reverses_receipt_id: string | null }[]
    >`
      select kind, reverses_receipt_id
      from order_receipts
      where order_id = ${order.id}
      order by created_at
    `;

    expect(reversed.order.paymentResult.status).toBe("unpaid");
    expect(reversed.order.paymentResult.grossReceived).toBe(0);
    expect(reversed.order.paymentResult.receipts[0]?.reversedAt).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe("receipt");
    expect(rows[1]).toMatchObject({
      kind: "reversal",
      reverses_receipt_id: receiptId,
    });
  });

  it("concilia gasto direto com o orçamento e preserva o estorno", async () => {
    const order = await confirmTestOrder();
    const expense = await service.registerDirectExpense(tenantId, order.id, {
      idempotencyKey: randomUUID(),
      category: "delivery",
      description: "Entrega por aplicativo",
      actualAmount: 8,
      estimatedAmount: 5,
      incurredAt: "2026-08-26",
      note: "Valor real da corrida",
    });

    expect(expense.order.directExpenseResult.actualRegistered).toBe(8);
    expect(expense.order.directExpenseResult.estimatedReconciled).toBe(5);
    expect(expense.order.directExpenseResult.adjustment).toBe(3);
    expect(expense.order.directExpenseResult.effectiveAdditionalCost).toBe(8);
    expect(expense.order.costResult.realizedAdditionalCost).toBe(8);

    const expenseId = expense.order.directExpenseResult.entries[0]!.id;
    const reversed = await service.reverseDirectExpense(
      tenantId,
      order.id,
      expenseId,
      { reason: "Corrida cancelada e valor devolvido." },
    );
    const rows = await admin<
      { kind: string; reverses_expense_id: string | null }[]
    >`
      select kind, reverses_expense_id
      from order_direct_expenses
      where order_id = ${order.id}
      order by created_at
    `;

    expect(reversed.order.directExpenseResult.adjustment).toBe(0);
    expect(
      reversed.order.directExpenseResult.entries[0]?.reversedAt,
    ).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      kind: "reversal",
      reverses_expense_id: expenseId,
    });
  });

  it("instancia a receita e libera o próximo momento pela bancada", async () => {
    const order = await confirmTestOrder();
    const [firstTask] = await admin<
      [{ id: string; plan_id: string; moment_id: string }]
    >`
      select tasks.id, tasks.production_plan_id as plan_id,
             tasks.production_moment_id as moment_id
      from production_tasks tasks
      join production_plans plans on plans.id = tasks.production_plan_id
      where plans.order_id = ${order.id}
      order by tasks.planned_start_at
      limit 1
    `;

    await productionService.updateTask(tenantId, firstTask.id, {
      action: "start",
    });
    const board = await productionService.getBoardForTenant(tenantId);
    const taskRequirements = await admin<
      { id: string; reserved_base: number }[]
    >`
      select requirements.id,
             coalesce(sum(reservations.quantity_base), 0) as reserved_base
      from production_tasks tasks
      join recipe_lines lines
        on lines.recipe_step_id = tasks.source_recipe_step_id
      join production_plans plans
        on plans.id = tasks.production_plan_id
      join order_requirements requirements
        on requirements.order_id = plans.order_id
       and requirements.source_recipe_line_id = lines.id
      left join inventory_reservations reservations
        on reservations.requirement_id = requirements.id
       and reservations.released_at is null
      where tasks.id = ${firstTask.id}
      group by requirements.id
    `;
    await productionService.saveNote(
      tenantId,
      firstTask.id,
      "O forno estabilizou cinco minutos depois do previsto.",
    );
    await expect(
      productionService.updateTask(tenantId, firstTask.id, {
        action: "complete",
      }),
    ).rejects.toThrow("Confirme o consumo");
    expect(taskRequirements).toHaveLength(1);
    const consumptionResult = await productionService.confirmConsumption(
      tenantId,
      firstTask.id,
      {
        lines: taskRequirements.map((requirement, index) => ({
          requirementId: requirement.id,
          actualUsedG:
            Number(requirement.reserved_base) - (index === 0 ? 10 : 0),
          lossG: index === 0 ? 10 : 0,
        })),
      },
    );
    const correctionResult = await productionService.correctConsumption(
      tenantId,
      firstTask.id,
      {
        reason: "A sobra foi pesada novamente após a conferência.",
        lines: taskRequirements.map((requirement, index) => ({
          requirementId: requirement.id,
          actualUsedG:
            Number(requirement.reserved_base) - (index === 0 ? 20 : 0),
          lossG: index === 0 ? 10 : 0,
        })),
      },
    );
    await productionService.updateTask(tenantId, firstTask.id, {
      action: "complete",
    });
    const workspaceAfterConsumption = await service.getForTenant(tenantId);
    const orderAfterConsumption = workspaceAfterConsumption.orders.find(
      (entry) => entry.id === order.id,
    );

    const [storedOrder] = await admin<[{ status: string }]>`
      select status from orders where id = ${order.id}
    `;
    const [finishedMoment] = await admin<[{ status: string }]>`
      select status from production_moments where id = ${firstTask.moment_id}
    `;
    const [nextTask] = await admin<[{ status: string }]>`
      select status from production_tasks
      where production_plan_id = ${firstTask.plan_id}
        and id <> ${firstTask.id}
      order by planned_start_at
      limit 1
    `;
    const [storedNote] = await admin<[{ body: string }]>`
      select body from production_notes
      where production_task_id = ${firstTask.id}
    `;
    const [storedEquipmentUsage] = await admin<
      [{ equipment_id: string; order_id: string; source: string }]
    >`
      select equipment_id, order_id, source::text
      from equipment_usages
      where production_task_id = ${firstTask.id}
    `;
    const requirementSources = await admin<{ source_recipe_line_id: string }[]>`
      select source_recipe_line_id
      from order_requirements
      where order_id = ${order.id}
    `;
    const [storedConsumption] = await admin<
      [
        {
          id: string;
          actual_used_base: number;
          loss_base: number;
        },
      ]
    >`
      select id, actual_used_base, loss_base
      from production_task_consumptions
      where production_task_id = ${firstTask.id}
    `;
    const [storedCorrectionLine] = await admin<
      [
        {
          id: string;
          previous_actual_used_base: number;
          corrected_actual_used_base: number;
          actual_used_delta_base: number;
        },
      ]
    >`
      select id, previous_actual_used_base, corrected_actual_used_base,
             actual_used_delta_base
      from production_consumption_correction_lines
      where consumption_id = ${storedConsumption.id}
    `;
    const preparationInstances = await admin<
      {
        id: string;
        kind: "final" | "intermediate";
        parent_preparation_instance_id: string | null;
        name_snapshot: string;
      }[]
    >`
      select id, kind, parent_preparation_instance_id, name_snapshot
      from preparation_instances
      where production_plan_id = ${firstTask.plan_id}
      order by kind, name_snapshot
    `;
    const [taskPreparation] = await admin<
      [{ preparation_instance_id: string }]
    >`
      select preparation_instance_id
      from production_tasks
      where id = ${firstTask.id}
    `;
    const consumptionMovements = await admin<{ type: string }[]>`
      select type from stock_movements
      where reference_id = ${storedConsumption.id}
      order by occurred_at, type
    `;
    const correctionMovements = await admin<{ type: string }[]>`
      select type from stock_movements
      where reference_id = ${storedCorrectionLine.id}
      order by occurred_at, type
    `;

    expect(board.currentTask?.ingredientScope).toBe("task");
    expect(board.currentTask?.ingredients.map((entry) => entry.name)).toEqual([
      "Chocolate meio amargo",
    ]);
    expect(board.currentTask?.consumptionRequired).toBe(true);
    expect(board.currentTask?.consumptionConfirmed).toBe(false);
    if (consumptionResult.board.currentTask?.id === firstTask.id)
      expect(consumptionResult.board.currentTask.consumptionConfirmed).toBe(
        true,
      );
    if (correctionResult.board.currentTask?.id === firstTask.id) {
      const correctedIngredient =
        correctionResult.board.currentTask.ingredients[0];
      expect(correctedIngredient?.consumption?.originalActualUsedG).toBe(
        Number(taskRequirements[0]!.reserved_base) - 10,
      );
      expect(correctedIngredient?.consumption?.actualUsedG).toBe(
        Number(taskRequirements[0]!.reserved_base) - 20,
      );
      expect(correctedIngredient?.consumption?.correctionCount).toBe(1);
      expect(correctedIngredient?.consumption?.variance.deltaG).toBe(-10);
      expect(
        correctionResult.board.currentTask.consumptionVariance?.deltaG,
      ).toBe(-10);
    }
    expect(orderAfterConsumption?.productionVariance).toMatchObject({
      deltaG: -10,
      status: "on_target",
      complete: false,
      confirmedLineCount: 1,
    });
    expect(Number(storedConsumption.actual_used_base)).toBe(
      Number(taskRequirements[0]!.reserved_base) - 10,
    );
    expect(Number(storedConsumption.loss_base)).toBe(10);
    expect(Number(storedCorrectionLine.previous_actual_used_base)).toBe(
      Number(taskRequirements[0]!.reserved_base) - 10,
    );
    expect(Number(storedCorrectionLine.corrected_actual_used_base)).toBe(
      Number(taskRequirements[0]!.reserved_base) - 20,
    );
    expect(Number(storedCorrectionLine.actual_used_delta_base)).toBe(-10);
    expect(consumptionMovements.map((movement) => movement.type)).toEqual(
      expect.arrayContaining(["RELEASE", "CONSUME", "LOSS"]),
    );
    expect(correctionMovements.map((movement) => movement.type)).toEqual([
      "RETURN_IN",
    ]);
    const rootPreparation = preparationInstances.find(
      (preparation) => preparation.kind === "final",
    );
    const intermediatePreparations = preparationInstances.filter(
      (preparation) => preparation.kind === "intermediate",
    );
    expect(rootPreparation?.name_snapshot).toBe("Bolo de chocolate");
    expect(
      intermediatePreparations.map((entry) => entry.name_snapshot),
    ).toEqual(expect.arrayContaining(["Massa", "Ganache"]));
    expect(
      intermediatePreparations.every(
        (preparation) =>
          preparation.parent_preparation_instance_id === rootPreparation?.id,
      ),
    ).toBe(true);
    expect(
      intermediatePreparations.some(
        (preparation) =>
          preparation.id === taskPreparation.preparation_instance_id,
      ),
    ).toBe(true);
    expect(
      requirementSources.every((entry) => entry.source_recipe_line_id),
    ).toBe(true);
    expect(storedOrder.status).toBe("in_production");
    expect(finishedMoment.status).toBe("completed");
    expect(nextTask.status).toBe("available");
    expect(storedNote.body).toContain("cinco minutos");
    expect(storedEquipmentUsage).toMatchObject({
      equipment_id: testEquipmentId,
      order_id: order.id,
      source: "production",
    });
  });

  it("replaneja só as tarefas futuras e preserva a execução iniciada", async () => {
    const order = await confirmTestOrder();
    const tasksBefore = await admin<
      {
        id: string;
        status: string;
        planned_start_at: Date;
        planned_end_at: Date;
      }[]
    >`
      select tasks.id, tasks.status, tasks.planned_start_at, tasks.planned_end_at
      from production_tasks tasks
      join production_plans plans on plans.id = tasks.production_plan_id
      where plans.order_id = ${order.id}
      order by tasks.planned_start_at
    `;
    const firstTask = tasksBefore[0]!;
    const futureTask = tasksBefore[1]!;
    await productionService.updateTask(tenantId, firstTask.id, {
      action: "start",
    });

    const result = await service.replan(tenantId, order.id, {
      deliveryAt: "2026-08-30T18:30:00-03:00",
      reason: "A cliente adiou a comemoração.",
    });

    const [storedFirstTask] = await admin<
      [
        {
          planned_start_at: Date;
          planned_end_at: Date;
          actual_started_at: Date | null;
        },
      ]
    >`
      select planned_start_at, planned_end_at, actual_started_at
      from production_tasks where id = ${firstTask.id}
    `;
    const [storedFutureTask] = await admin<
      [{ planned_start_at: Date; planned_end_at: Date }]
    >`
      select planned_start_at, planned_end_at
      from production_tasks where id = ${futureTask.id}
    `;
    const [storedPlan] = await admin<
      [{ delivery_at: Date; planning_version: number }]
    >`
      select delivery_at, planning_version
      from production_plans where order_id = ${order.id}
    `;
    const [audit] = await admin<[{ event_type: string }]>`
      select event_type from audit_events
      where tenant_id = ${tenantId}
        and payload ->> 'orderId' = ${order.id}
        and event_type = 'ORDER_PRODUCTION_REPLANNED'
    `;

    expect(result.order.deliveryAt).toBe("2026-08-30T21:30:00.000Z");
    expect(storedFirstTask.planned_start_at.getTime()).toBe(
      firstTask.planned_start_at.getTime(),
    );
    expect(storedFirstTask.planned_end_at.getTime()).toBe(
      firstTask.planned_end_at.getTime(),
    );
    expect(storedFirstTask.actual_started_at).toBeTruthy();
    expect(storedFutureTask.planned_start_at.getTime()).not.toBe(
      futureTask.planned_start_at.getTime(),
    );
    expect(storedPlan.delivery_at.toISOString()).toBe(
      "2026-08-30T21:30:00.000Z",
    );
    expect(storedPlan.planning_version).toBe(2);
    expect(audit.event_type).toBe("ORDER_PRODUCTION_REPLANNED");
  });

  it("corrige usado e perda sem movimentar estoque quando o total não muda", async () => {
    const order = await confirmTestOrder();
    const [firstTask] = await admin<[{ id: string }]>`
      select tasks.id
      from production_tasks tasks
      join production_plans plans on plans.id = tasks.production_plan_id
      where plans.order_id = ${order.id}
      order by tasks.planned_start_at
      limit 1
    `;
    await productionService.updateTask(tenantId, firstTask.id, {
      action: "start",
    });
    const [requirement] = await admin<[{ id: string; reserved_base: number }]>`
      select requirements.id,
             coalesce(sum(reservations.quantity_base), 0) as reserved_base
      from production_tasks tasks
      join recipe_lines lines
        on lines.recipe_step_id = tasks.source_recipe_step_id
      join production_plans plans
        on plans.id = tasks.production_plan_id
      join order_requirements requirements
        on requirements.order_id = plans.order_id
       and requirements.source_recipe_line_id = lines.id
      left join inventory_reservations reservations
        on reservations.requirement_id = requirements.id
       and reservations.released_at is null
      where tasks.id = ${firstTask.id}
      group by requirements.id
    `;
    await productionService.confirmConsumption(tenantId, firstTask.id, {
      lines: [
        {
          requirementId: requirement.id,
          actualUsedG: Number(requirement.reserved_base),
          lossG: 0,
        },
      ],
    });
    const result = await productionService.correctConsumption(
      tenantId,
      firstTask.id,
      {
        reason: "Parte do uso foi reclassificada como perda técnica.",
        lines: [
          {
            requirementId: requirement.id,
            actualUsedG: Number(requirement.reserved_base) - 5,
            lossG: 5,
          },
        ],
      },
    );
    const [correctionLine] = await admin<[{ id: string }]>`
      select lines.id
      from production_consumption_correction_lines lines
      join production_consumption_corrections corrections
        on corrections.id = lines.correction_id
      where corrections.production_task_id = ${firstTask.id}
    `;
    const movements = await admin<{ type: string }[]>`
      select type from stock_movements
      where reference_id = ${correctionLine.id}
    `;

    expect(result.message).toContain("sem alterar o saldo físico");
    expect(movements).toEqual([]);
    if (result.board.currentTask?.id === firstTask.id) {
      expect(
        result.board.currentTask.ingredients[0]?.consumption?.actualUsedG,
      ).toBe(Number(requirement.reserved_base) - 5);
      expect(result.board.currentTask.ingredients[0]?.consumption?.lossG).toBe(
        5,
      );
    }
  });
});
