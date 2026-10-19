import { describe, expect, it } from "vitest";
import {
  activePaymentRows,
  buildCategoryBreakdown,
  buildCompositionBreakdown,
  buildFinanceCsv,
  buildFinanceExpense,
  buildRecurrenceForecast,
  cashSummary,
  compareCashSummaries,
  previousMonth,
} from "./finance.projection";

const date = new Date("2026-08-10T12:00:00Z");
const expense = {
  id: "expense-1",
  categoryId: "category-1",
  recurrenceId: null,
  description: "Internet da cozinha",
  supplier: "Vivo",
  competence: new Date("2026-08-01T12:00:00Z"),
  dueDate: date,
  expectedAmount: 120,
  cancelledAt: null,
};

describe("finance projection", () => {
  it("mostra pagamentos parciais sem confundir obrigação com saída", () => {
    const result = buildFinanceExpense(expense, "Internet e telefone", [
      {
        id: "payment-1",
        expenseId: expense.id,
        kind: "payment",
        amount: 40,
        paidAt: date,
        note: null,
        reversesPaymentId: null,
        createdAt: date,
      },
    ]);
    expect(result).toMatchObject({
      status: "partial",
      paidAmount: 40,
      balanceDue: 80,
      expectedAmount: 120,
    });
  });

  it("preserva o pagamento estornado no histórico e o retira do caixa", () => {
    const rows = [
      {
        id: "payment-1",
        expenseId: expense.id,
        kind: "payment" as const,
        amount: 120,
        paidAt: date,
        note: null,
        reversesPaymentId: null,
        createdAt: date,
      },
      {
        id: "reversal-1",
        expenseId: expense.id,
        kind: "reversal" as const,
        amount: 120,
        paidAt: date,
        note: "Lançamento em duplicidade",
        reversesPaymentId: "payment-1",
        createdAt: new Date("2026-08-11T12:00:00Z"),
      },
    ];
    expect(activePaymentRows(rows)).toHaveLength(0);
    const result = buildFinanceExpense(expense, "Internet e telefone", rows);
    expect(result.status).toBe("open");
    expect(result.payments[0]?.reversalReason).toBe(
      "Lançamento em duplicidade",
    );
  });

  it("projeta a recorrência sem transformá-la antecipadamente em pagamento", () => {
    const result = buildRecurrenceForecast({
      recurrence: {
        id: "recurrence-1",
        categoryId: "category-1",
        description: "Contabilidade",
        supplier: null,
        expectedAmount: 180,
        dayOfMonth: 10,
      },
      categoryName: "Contabilidade",
      month: "2026-09",
    });
    expect(result).toMatchObject({
      competence: "2026-09",
      dueDate: "2026-09-10",
      expectedAmount: 180,
    });
  });

  it("compara o caixa com o mês imediatamente anterior", () => {
    const current = cashSummary({
      incomeGross: 500,
      receiptFees: 20,
      operatingPaid: 180,
    });
    const previous = cashSummary({
      incomeGross: 420,
      receiptFees: 10,
      operatingPaid: 200,
    });
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(compareCashSummaries(current, previous)).toEqual({
      incomeGross: 80,
      receiptFees: 10,
      operatingPaid: -20,
      cashBalance: 90,
    });
  });

  it("agrupa as contas por categoria e preserva valores exatos", () => {
    const first = buildFinanceExpense(expense, "Internet e telefone", []);
    const second = buildFinanceExpense(
      { ...expense, id: "expense-2", expectedAmount: 80 },
      "Internet e telefone",
      [
        {
          id: "payment-2",
          expenseId: "expense-2",
          kind: "payment",
          amount: 30,
          paidAt: date,
          note: null,
          reversesPaymentId: null,
          createdAt: date,
        },
      ],
    );
    expect(buildCategoryBreakdown([first, second])).toEqual([
      {
        categoryId: "category-1",
        categoryName: "Internet e telefone",
        expectedAmount: 200,
        paidAmount: 30,
        outstandingAmount: 170,
        expenseCount: 2,
        shareOfExpected: 100,
      },
    ]);
  });

  it("compõe o caixa por categoria sem esconder valores pequenos", () => {
    expect(
      buildCompositionBreakdown([
        { key: "pix", label: "Pix", amount: 120 },
        { key: "pix", label: "Pix", amount: 80 },
        { key: "cash", label: "Dinheiro", amount: 50 },
      ]),
    ).toEqual([
      {
        key: "pix",
        label: "Pix",
        amount: 200,
        entryCount: 2,
        share: 80,
      },
      {
        key: "cash",
        label: "Dinheiro",
        amount: 50,
        entryCount: 1,
        share: 20,
      },
    ]);
  });

  it("exporta CSV legível pelo Excel e neutraliza fórmulas em texto", () => {
    const financeExpense = buildFinanceExpense(
      { ...expense, description: '=IMPORTXML("exemplo")' },
      "Internet e telefone",
      [],
    );
    const emptyCash = cashSummary({
      incomeGross: 0,
      receiptFees: 0,
      operatingPaid: 0,
    });
    const csv = buildFinanceCsv({
      tenantName: "Confeitaria",
      ownerName: "Proprietária",
      month: "2026-08",
      monthLabel: "Agosto de 2026",
      summary: { ...emptyCash, expectedOutflow: 120, outstandingAmount: 120 },
      comparison: {
        previousMonth: "2026-07",
        previousMonthLabel: "Julho de 2026",
        hasPreviousActivity: false,
        current: emptyCash,
        previous: emptyCash,
        delta: emptyCash,
      },
      composition: { income: [], expenses: [] },
      categoryBreakdown: buildCategoryBreakdown([financeExpense]),
      categories: [],
      expenses: [financeExpense],
      recurringForecasts: [],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(';"120,00"');
    expect(csv).toContain('"\'=IMPORTXML(""exemplo"")"');
  });
});
