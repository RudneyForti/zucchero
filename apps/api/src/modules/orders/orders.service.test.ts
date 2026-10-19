import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../database/database.service";
import type {
  recipeLines,
  recipeSubrecipeLines,
  recipeVersions,
} from "../../database/schema";
import { explodeRecipeLines, OrdersService } from "./orders.service";

const tenantId = "11111111-1111-4111-8111-111111111111";
const input = {
  idempotencyKey: "aaaaaaaa-1111-4111-8111-111111111111",
  customerId: "91111111-1111-4111-8111-111111111111",
  customerName: "Ana Paula",
  customerPhone: "(11) 98888-1234",
  deliveryMode: "delivery" as const,
  addressLabel: "Casa",
  address: "Rua das Acácias, 128 · Centro",
  deliveryAt: "2026-08-26T17:30:00-03:00",
  recipeId: "81111111-1111-4111-8111-111111111111",
  recipeVersionNumber: 1,
  requestedMassG: 5_000,
  productionIncrementG: 50,
  additionalCost: 12,
  targetMarginPercentage: 40,
  depositPercentage: 50,
  paymentMethod: "pix" as const,
};

function serviceWithoutDatabase() {
  return new OrdersService({ isConfigured: false } as DatabaseService);
}

describe("OrdersService", () => {
  it("explode ingredientes de uma sub-receita na proporção necessária", () => {
    const rootVersionId = "82111111-1111-4111-8111-111111111111";
    const componentVersionId = "82222222-2222-4222-8222-222222222222";
    const versions = [
      {
        id: rootVersionId,
        yieldMassG: 1_000,
        status: "published",
      },
      {
        id: componentVersionId,
        yieldMassG: 200,
        status: "published",
      },
    ] as Array<typeof recipeVersions.$inferSelect>;
    const lines = [
      {
        id: "84111111-1111-4111-8111-111111111111",
        recipeVersionId: rootVersionId,
        quantityG: 300,
      },
      {
        id: "84222222-2222-4222-8222-222222222222",
        recipeVersionId: componentVersionId,
        quantityG: 120,
      },
    ] as Array<typeof recipeLines.$inferSelect>;
    const components = [
      {
        recipeVersionId: rootVersionId,
        referencedRecipeVersionId: componentVersionId,
        requiredYieldG: 100,
        position: 0,
      },
    ] as Array<typeof recipeSubrecipeLines.$inferSelect>;

    const exploded = explodeRecipeLines(
      rootVersionId,
      lines,
      versions,
      components,
    );

    expect(exploded.map((line) => line.quantityG)).toEqual([300, 60]);
  });

  it("confirma a encomenda com preço e compra calculados no servidor", async () => {
    const result = await serviceWithoutDatabase().confirm(tenantId, input);

    expect(result.repeated).toBe(false);
    expect(result.order.orderNumber).toBe(1043);
    expect(result.order.recipeVersionNumber).toBe(1);
    expect(result.order.availability).toBe("partial");
    expect(result.order.purchaseNeedCount).toBe(1);
    expect(result.order.deliveryArrangement).toBe("own");
    expect(result.order.price).toBeCloseTo(180.33, 2);
  });

  it("registra entrega terceirizada sem incluir frete no custo do pedido", async () => {
    const result = await serviceWithoutDatabase().confirm(tenantId, {
      ...input,
      idempotencyKey: "bbbbbbbb-1111-4111-8111-111111111111",
      deliveryArrangement: "customer_arranged",
    });

    expect(result.order.deliveryArrangement).toBe("customer_arranged");
    expect(result.order.deliveryCost).toBe(0);
  });

  it("não duplica confirmação com a mesma chave idempotente", async () => {
    const service = serviceWithoutDatabase();
    const first = await service.confirm(tenantId, input);
    const repeated = await service.confirm(tenantId, input);

    expect(repeated.repeated).toBe(true);
    expect(repeated.order.id).toBe(first.order.id);
    expect(repeated.workspace.orders).toHaveLength(1);
  });

  it("avança somente pela sequência operacional permitida", async () => {
    const service = serviceWithoutDatabase();
    const confirmed = await service.confirm(tenantId, input);
    const started = await service.updateStatus(tenantId, confirmed.order.id, {
      status: "in_production",
    });
    const ready = await service.updateStatus(tenantId, confirmed.order.id, {
      status: "ready",
    });
    const completed = await service.updateStatus(tenantId, confirmed.order.id, {
      status: "completed",
    });

    expect(started.order.startedAt).toBeTruthy();
    expect(ready.order.readyAt).toBeTruthy();
    expect(completed.order.status).toBe("completed");
    expect(completed.workspace.summary.activeCount).toBe(0);
  });

  it("cancela com motivo e retira compras pendentes do resumo", async () => {
    const service = serviceWithoutDatabase();
    const confirmed = await service.confirm(tenantId, input);
    const cancelled = await service.updateStatus(tenantId, confirmed.order.id, {
      status: "cancelled",
      cancellationReason: "A cliente mudou a data da comemoração.",
    });

    expect(cancelled.order.status).toBe("cancelled");
    expect(cancelled.order.cancellationReason).toContain("mudou a data");
    expect(cancelled.workspace.summary.purchasePendingCount).toBe(0);
  });

  it("ajusta a entrega de um pedido ainda ativo", async () => {
    const service = serviceWithoutDatabase();
    const confirmed = await service.confirm(tenantId, input);
    const result = await service.replan(tenantId, confirmed.order.id, {
      deliveryAt: "2026-08-29T18:00:00-03:00",
      reason: "Mudança no horário da comemoração.",
    });

    expect(result.repeated).toBe(false);
    expect(result.order.deliveryAt).toBe("2026-08-29T18:00:00-03:00");
    expect(result.message).toContain("agenda recalculada");
  });
});
