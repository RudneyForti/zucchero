import { describe, expect, it } from "vitest";
import { buildOrderCostResult } from "./orders.cost-result";

const order = {
  id: "order-1",
  status: "in_production",
  ingredientCost: 30,
  additionalCost: 10,
  totalCost: 40,
  price: 80,
};
const requirements = [
  { id: "requirement-1", orderId: order.id },
  { id: "requirement-2", orderId: order.id },
];
const lots = [
  { id: "lot-1", unitCostBase: 0.02 },
  { id: "lot-2", unitCostBase: 0.04 },
];

describe("buildOrderCostResult", () => {
  it("não trata ausência de apontamento como custo realizado zero", () => {
    const result = buildOrderCostResult({
      order,
      requirements,
      consumptions: [],
      correctionLines: [],
      lots,
      movements: [],
    });

    expect(result.status).toBe("not_started");
    expect(result.realizedIngredientCost).toBe(0);
    expect(result.realizedTotalCost).toBeNull();
    expect(result.realizedProfit).toBeNull();
  });

  it("valora uso e perda pelos lotes efetivamente movimentados", () => {
    const consumptions = [
      { id: "consumption-1", orderRequirementId: "requirement-1" },
      { id: "consumption-2", orderRequirementId: "requirement-2" },
    ];
    const result = buildOrderCostResult({
      order,
      requirements,
      consumptions,
      correctionLines: [],
      lots,
      movements: [
        {
          lotId: "lot-1",
          type: "CONSUME",
          quantityBase: 500,
          referenceType: "production_task_consumption",
          referenceId: "consumption-1",
        },
        {
          lotId: "lot-1",
          type: "LOSS",
          quantityBase: 50,
          referenceType: "production_task_consumption",
          referenceId: "consumption-1",
        },
        {
          lotId: "lot-2",
          type: "CONSUME",
          quantityBase: 400,
          referenceType: "production_task_consumption",
          referenceId: "consumption-2",
        },
      ],
    });

    expect(result.status).toBe("complete");
    expect(result.realizedIngredientCost).toBe(27);
    expect(result.realizedTotalCost).toBe(37);
    expect(result.costDelta).toBe(-3);
    expect(result.realizedProfit).toBe(43);
    expect(result.realizedMarginPercentage).toBe(53.75);
  });

  it("incorpora correções compensatórias sem reescrever o consumo", () => {
    const result = buildOrderCostResult({
      order,
      requirements: [requirements[0]!],
      consumptions: [
        { id: "consumption-1", orderRequirementId: "requirement-1" },
      ],
      correctionLines: [
        { id: "correction-line-1", consumptionId: "consumption-1" },
      ],
      lots,
      movements: [
        {
          lotId: "lot-1",
          type: "CONSUME",
          quantityBase: 500,
          referenceType: "production_task_consumption",
          referenceId: "consumption-1",
        },
        {
          lotId: "lot-1",
          type: "RETURN_IN",
          quantityBase: 100,
          referenceType: "production_consumption_correction",
          referenceId: "correction-line-1",
        },
      ],
    });

    expect(result.realizedIngredientCost).toBe(8);
  });

  it("reconhece o consumo consolidado de pedidos legados concluídos", () => {
    const result = buildOrderCostResult({
      order: { ...order, status: "completed" },
      requirements,
      consumptions: [],
      correctionLines: [],
      lots,
      movements: [
        {
          lotId: "lot-1",
          type: "CONSUME",
          quantityBase: 1_000,
          referenceType: "order",
          referenceId: order.id,
        },
      ],
    });

    expect(result.status).toBe("complete");
    expect(result.confirmedLineCount).toBe(2);
    expect(result.realizedTotalCost).toBe(30);
  });
});
