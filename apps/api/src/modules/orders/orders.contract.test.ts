import { describe, expect, it } from "vitest";
import { confirmOrderSchema } from "./orders.contract";

const baseOrder = {
  idempotencyKey: "aaaaaaaa-1111-4111-8111-111111111111",
  customerId: "91111111-1111-4111-8111-111111111111",
  customerName: "Ana Paula",
  customerPhone: "11988881234",
  deliveryMode: "delivery" as const,
  deliveryArrangement: "own" as const,
  address: "Rua das Acácias, 128 · Centro",
  customerAddressId: "94111111-1111-4111-8111-111111111111",
  deliveryAt: "2026-09-15T17:30:00-03:00",
  recipeId: "81111111-1111-4111-8111-111111111111",
  recipeVersionNumber: 1,
  requestedMassG: 1_000,
  productionIncrementG: 50,
  additionalCost: 0,
  targetMarginPercentage: 35,
  depositPercentage: 50,
  paymentMethod: "pix" as const,
};

describe("confirmOrderSchema", () => {
  it("aceita entrega própria e terceirizada pela cliente", () => {
    expect(confirmOrderSchema.safeParse(baseOrder).success).toBe(true);
    expect(
      confirmOrderSchema.safeParse({
        ...baseOrder,
        deliveryArrangement: "customer_arranged",
      }).success,
    ).toBe(true);
  });

  it("exige o provedor de uma plataforma integrada", () => {
    const result = confirmOrderSchema.safeParse({
      ...baseOrder,
      deliveryArrangement: "integrated_partner",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.deliveryProvider).toBeTruthy();
    }
  });

  it("não associa um responsável de entrega à retirada", () => {
    const result = confirmOrderSchema.safeParse({
      ...baseOrder,
      deliveryMode: "pickup",
    });

    expect(result.success).toBe(false);
  });
});
