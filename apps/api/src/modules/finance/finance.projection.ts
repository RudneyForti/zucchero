import type {
  FinanceCashSummary,
  FinanceCategoryBreakdown,
  FinanceCompositionItem,
  FinanceExpense,
  FinanceRecurrenceForecast,
  FinanceWorkspace,
} from "./finance.contract";

type CompositionEntry = {
  key: string;
  label: string;
  amount: number;
};

type PaymentRow = {
  id: string;
  expenseId: string;
  kind: "payment" | "reversal";
  amount: number;
  paidAt: Date;
  note: string | null;
  reversesPaymentId: string | null;
  createdAt: Date;
};

type ExpenseRow = {
  id: string;
  categoryId: string;
  recurrenceId: string | null;
  description: string;
  supplier: string | null;
  competence: Date;
  dueDate: Date;
  expectedAmount: number;
  cancelledAt: Date | null;
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function previousMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export function cashSummary(args: {
  incomeGross: number;
  receiptFees: number;
  operatingPaid: number;
}): FinanceCashSummary {
  const incomeGross = roundMoney(args.incomeGross);
  const receiptFees = roundMoney(args.receiptFees);
  const operatingPaid = roundMoney(args.operatingPaid);
  return {
    incomeGross,
    receiptFees,
    operatingPaid,
    cashBalance: roundMoney(incomeGross - receiptFees - operatingPaid),
  };
}

export function compareCashSummaries(
  current: FinanceCashSummary,
  previous: FinanceCashSummary,
) {
  return {
    incomeGross: roundMoney(current.incomeGross - previous.incomeGross),
    receiptFees: roundMoney(current.receiptFees - previous.receiptFees),
    operatingPaid: roundMoney(current.operatingPaid - previous.operatingPaid),
    cashBalance: roundMoney(current.cashBalance - previous.cashBalance),
  };
}

export function buildCategoryBreakdown(
  expenses: FinanceExpense[],
): FinanceCategoryBreakdown[] {
  const totalExpected = expenses.reduce(
    (sum, expense) => sum + expense.expectedAmount,
    0,
  );
  const grouped = new Map<string, FinanceCategoryBreakdown>();
  for (const expense of expenses) {
    const current = grouped.get(expense.categoryId) ?? {
      categoryId: expense.categoryId,
      categoryName: expense.categoryName,
      expectedAmount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      expenseCount: 0,
      shareOfExpected: 0,
    };
    current.expectedAmount = roundMoney(
      current.expectedAmount + expense.expectedAmount,
    );
    current.paidAmount = roundMoney(current.paidAmount + expense.paidAmount);
    current.outstandingAmount = roundMoney(
      current.outstandingAmount + expense.balanceDue,
    );
    current.expenseCount += 1;
    grouped.set(expense.categoryId, current);
  }
  return [...grouped.values()]
    .map((category) => ({
      ...category,
      shareOfExpected:
        totalExpected > 0
          ? Math.round((category.expectedAmount / totalExpected) * 1000) / 10
          : 0,
    }))
    .sort(
      (left, right) =>
        right.expectedAmount - left.expectedAmount ||
        left.categoryName.localeCompare(right.categoryName, "pt-BR"),
    );
}

export function buildCompositionBreakdown(
  entries: CompositionEntry[],
): FinanceCompositionItem[] {
  const grouped = new Map<string, Omit<FinanceCompositionItem, "share">>();
  for (const entry of entries) {
    if (entry.amount <= 0) continue;
    const current = grouped.get(entry.key) ?? {
      key: entry.key,
      label: entry.label,
      amount: 0,
      entryCount: 0,
    };
    current.amount = roundMoney(current.amount + entry.amount);
    current.entryCount += 1;
    grouped.set(entry.key, current);
  }
  const total = [...grouped.values()].reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      share: total > 0 ? Math.round((entry.amount / total) * 1000) / 10 : 0,
    }))
    .sort(
      (left, right) =>
        right.amount - left.amount ||
        left.label.localeCompare(right.label, "pt-BR"),
    );
}

function csvCell(value: string | number) {
  let content = String(value);
  const numeric = /^-?\d+(?:,\d+)?$/.test(content);
  if (!numeric && /^[=+\-@]/.test(content)) content = `'${content}`;
  return `"${content.replaceAll('"', '""')}"`;
}

function csvMoney(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function buildFinanceCsv(workspace: FinanceWorkspace) {
  const rows: Array<Array<string | number>> = [
    ["Financeiro da confeitaria", workspace.monthLabel],
    [],
    ["Resumo do caixa", "Valor (R$)"],
    ["Recebido de pedidos", csvMoney(workspace.summary.incomeGross)],
    ["Taxas dos recebimentos", csvMoney(workspace.summary.receiptFees)],
    ["Contas pagas", csvMoney(workspace.summary.operatingPaid)],
    ["Saldo de caixa", csvMoney(workspace.summary.cashBalance)],
    ["Compromissos previstos", csvMoney(workspace.summary.expectedOutflow)],
    ["Ainda em aberto", csvMoney(workspace.summary.outstandingAmount)],
    [],
    ["Categorias", "Contas", "Previsto (R$)", "Pago (R$)", "Em aberto (R$)"],
    ...workspace.categoryBreakdown.map((category) => [
      category.categoryName,
      category.expenseCount,
      csvMoney(category.expectedAmount),
      csvMoney(category.paidAmount),
      csvMoney(category.outstandingAmount),
    ]),
    [],
    [
      "Contas do mês",
      "Categoria",
      "Fornecedor",
      "Vencimento",
      "Previsto (R$)",
      "Pago (R$)",
      "Em aberto (R$)",
      "Situação",
    ],
    ...workspace.expenses.map((expense) => [
      expense.description,
      expense.categoryName,
      expense.supplier ?? "",
      expense.dueDate,
      csvMoney(expense.expectedAmount),
      csvMoney(expense.paidAmount),
      csvMoney(expense.balanceDue),
      expense.status === "paid"
        ? "Pago"
        : expense.status === "partial"
          ? "Em parte"
          : "Em aberto",
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function activePaymentRows(rows: PaymentRow[]) {
  const reversedIds = new Set(
    rows
      .filter((row) => row.kind === "reversal" && row.reversesPaymentId)
      .map((row) => row.reversesPaymentId as string),
  );
  return rows.filter(
    (row) => row.kind === "payment" && !reversedIds.has(row.id),
  );
}

export function buildFinanceExpense(
  expense: ExpenseRow,
  categoryName: string,
  rows: PaymentRow[],
): FinanceExpense {
  const reversals = new Map(
    rows
      .filter((row) => row.kind === "reversal" && row.reversesPaymentId)
      .map((row) => [row.reversesPaymentId as string, row]),
  );
  const payments = rows
    .filter((row) => row.kind === "payment")
    .map((row) => {
      const reversal = reversals.get(row.id);
      return {
        id: row.id,
        amount: roundMoney(row.amount),
        paidAt: isoDate(row.paidAt),
        note: row.note,
        reversedAt: reversal?.createdAt.toISOString() ?? null,
        reversalReason: reversal?.note ?? null,
      };
    })
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const paidAmount = roundMoney(
    payments
      .filter((payment) => !payment.reversedAt)
      .reduce((sum, payment) => sum + payment.amount, 0),
  );
  const balanceDue = roundMoney(
    Math.max(0, expense.expectedAmount - paidAmount),
  );
  const status = paidAmount <= 0 ? "open" : balanceDue > 0 ? "partial" : "paid";
  return {
    id: expense.id,
    categoryId: expense.categoryId,
    categoryName,
    recurrenceId: expense.recurrenceId,
    description: expense.description,
    supplier: expense.supplier,
    competence: isoDate(expense.competence).slice(0, 7),
    dueDate: isoDate(expense.dueDate),
    expectedAmount: roundMoney(expense.expectedAmount),
    paidAmount,
    balanceDue,
    status,
    payments,
  };
}

export function recurrenceDueDate(month: string, dayOfMonth: number) {
  return `${month}-${String(dayOfMonth).padStart(2, "0")}`;
}

export function buildRecurrenceForecast(args: {
  recurrence: {
    id: string;
    categoryId: string;
    description: string;
    supplier: string | null;
    expectedAmount: number;
    dayOfMonth: number;
  };
  categoryName: string;
  month: string;
}): FinanceRecurrenceForecast {
  return {
    recurrenceId: args.recurrence.id,
    categoryId: args.recurrence.categoryId,
    categoryName: args.categoryName,
    description: args.recurrence.description,
    supplier: args.recurrence.supplier,
    expectedAmount: roundMoney(args.recurrence.expectedAmount),
    competence: args.month,
    dueDate: recurrenceDueDate(args.month, args.recurrence.dayOfMonth),
  };
}
