import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../database/database.service";
import { PantryService } from "./pantry.service";
import { registerPurchaseSchema } from "./pantry.contract";

const tenantId = "11111111-1111-4111-8111-111111111111";

function serviceWithoutDatabase() {
  return new PantryService({ isConfigured: false } as DatabaseService);
}

describe("PantryService", () => {
  it("separa grupo culinário, item comercial e lote", async () => {
    const pantry = await serviceWithoutDatabase().getForTenant(tenantId);
    const chocolate = pantry.groups.find(
      (group) => group.name === "Chocolate meio amargo",
    );

    expect(chocolate?.items.map((item) => item.brandName)).toEqual([
      "Harald",
      "Sicao",
    ]);
    expect(chocolate?.availableBase).toBe(3_030);
    expect(pantry.summary.openLotCount).toBe(3);
  });

  it("registra nova compra como lote do item existente", async () => {
    const service = serviceWithoutDatabase();
    const result = await service.registerPurchase(tenantId, {
      commercialItemId: "51111111-1111-4111-8111-111111111111",
      quantityPackages: 2,
      totalCost: 71.8,
      entryDate: "2026-08-24",
      expiryDate: "2027-04-10",
      supplierName: "Atacadista piloto",
      forceCreate: false,
    });
    const harald = result.pantry.groups
      .flatMap((group) => group.items)
      .find((item) => item.id === "51111111-1111-4111-8111-111111111111");

    expect(harald?.lotCount).toBe(2);
    expect(harald?.availableBase).toBe(4_040);
    expect(result.pantry.summary.openLotCount).toBe(4);
  });

  it("interrompe a criação quando encontra possível duplicidade", async () => {
    const service = serviceWithoutDatabase();
    const request = service.registerPurchase(tenantId, {
      newItem: {
        groupName: "Chocolate meio amargo",
        categoryId: "21111111-1111-4111-8111-111111111111",
        baseDimension: "mass",
        perishable: false,
        brandName: "Harald",
        displayName: "Harald Melken meio amargo 1,01 kg",
        packageUnit: "kg",
        netContentBase: 1_010,
      },
      quantityPackages: 1,
      totalCost: 35.9,
      entryDate: "2026-08-24",
      forceCreate: false,
    });

    await expect(request).rejects.toBeInstanceOf(ConflictException);
    await expect(request).rejects.toMatchObject({
      response: { code: "POSSIBLE_DUPLICATE" },
    });
  });

  it("trata quantidade de embalagens como contagem inteira", () => {
    const result = registerPurchaseSchema.safeParse({
      commercialItemId: "51111111-1111-4111-8111-111111111111",
      quantityPackages: 1.001,
      totalCost: 20,
      entryDate: "2026-08-25",
    });
    expect(result.success).toBe(false);
  });

  it("cadastra categoria sem confundi-la com o grupo culinário", async () => {
    const result = await serviceWithoutDatabase().createCategory(tenantId, {
      name: "Farinhas e secos",
      kind: "ingredient",
    });
    expect(
      result.pantry.categories.some(
        (category) => category.name === "Farinhas e secos",
      ),
    ).toBe(true);
    expect(result.categoryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("consolida faltas abertas por apresentação comercial", async () => {
    const pantry = await serviceWithoutDatabase().getForTenant(tenantId);
    expect(pantry.shoppingList).toEqual([
      expect.objectContaining({
        displayName: "Morango fresco bandeja 250 g",
        remainingBase: 600,
        packagesToBuy: 3,
        orderCount: 1,
      }),
    ]);
  });

  it("registra a diferença da contagem sem substituir o histórico", async () => {
    const service = serviceWithoutDatabase();
    const idempotencyKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const first = await service.adjustInventory(
      tenantId,
      "61111111-1111-4111-8111-111111111111",
      {
        idempotencyKey,
        countedQuantityBase: 1_900,
        reason: "physical_count",
        note: "Conferência semanal",
      },
    );
    const repeated = await service.adjustInventory(
      tenantId,
      "61111111-1111-4111-8111-111111111111",
      {
        idempotencyKey,
        countedQuantityBase: 1_800,
        reason: "physical_count",
        note: "Reenvio do mesmo comando",
      },
    );
    const lot = repeated.pantry.groups
      .flatMap((group) => group.items)
      .flatMap((item) => item.lots)
      .find((entry) => entry.id === "61111111-1111-4111-8111-111111111111");
    expect(first.repeated).toBe(false);
    expect(repeated.repeated).toBe(true);
    expect(lot?.physicalBase).toBe(1_900);
  });

  it("registra perda somente sobre o saldo livre do lote", async () => {
    const service = serviceWithoutDatabase();
    const result = await service.registerLoss(
      tenantId,
      "63333333-3333-4333-8333-333333333333",
      {
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quantityBase: 100,
        reason: "quality",
        note: "Textura inadequada",
      },
    );
    const lot = result.pantry.groups
      .flatMap((group) => group.items)
      .flatMap((item) => item.lots)
      .find((entry) => entry.id === "63333333-3333-4333-8333-333333333333");
    expect(lot?.availableBase).toBe(900);
    await expect(
      service.registerLoss(tenantId, "63333333-3333-4333-8333-333333333333", {
        idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        quantityBase: 901,
        reason: "expired",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
