import { describe, expect, it } from "vitest";
import { buildOrderDirectExpenseResult } from "./orders.direct-expense-result";

const date = new Date("2026-08-26T12:00:00-03:00");

describe("resultado das despesas diretas", () => {
  it("substitui somente a parcela prevista informada", () => {
    const result = buildOrderDirectExpenseResult(12, [
      {
        id: "delivery",
        kind: "expense",
        category: "delivery",
        description: "Entrega por aplicativo",
        actualAmount: 15,
        estimatedAmount: 10,
        incurredAt: date,
        note: null,
        reversesExpenseId: null,
        createdAt: date,
      },
    ]);

    expect(result.actualRegistered).toBe(15);
    expect(result.estimatedReconciled).toBe(10);
    expect(result.remainingEstimate).toBe(2);
    expect(result.adjustment).toBe(5);
    expect(result.effectiveAdditionalCost).toBe(17);
  });

  it("soma gasto não previsto sem consumir a estimativa", () => {
    const result = buildOrderDirectExpenseResult(12, [
      {
        id: "extra",
        kind: "expense",
        category: "other",
        description: "Impressão urgente",
        actualAmount: 4.5,
        estimatedAmount: 0,
        incurredAt: date,
        note: null,
        reversesExpenseId: null,
        createdAt: date,
      },
    ]);

    expect(result.adjustment).toBe(4.5);
    expect(result.effectiveAdditionalCost).toBe(16.5);
  });

  it("retira da projeção uma despesa estornada", () => {
    const reversal = new Date("2026-08-27T10:00:00-03:00");
    const result = buildOrderDirectExpenseResult(12, [
      {
        id: "expense",
        kind: "expense",
        category: "packaging",
        description: "Caixa",
        actualAmount: 6,
        estimatedAmount: 5,
        incurredAt: date,
        note: null,
        reversesExpenseId: null,
        createdAt: date,
      },
      {
        id: "reversal",
        kind: "reversal",
        category: "packaging",
        description: "Caixa",
        actualAmount: 6,
        estimatedAmount: 5,
        incurredAt: date,
        note: "Compra devolvida",
        reversesExpenseId: "expense",
        createdAt: reversal,
      },
    ]);

    expect(result.activeCount).toBe(0);
    expect(result.adjustment).toBe(0);
    expect(result.entries[0]?.reversalReason).toBe("Compra devolvida");
  });
});
