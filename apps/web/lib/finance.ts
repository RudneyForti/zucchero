export type FinanceExpensePayment = {
  id: string;
  amount: number;
  paidAt: string;
  note: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type FinanceExpense = {
  id: string;
  categoryId: string;
  categoryName: string;
  recurrenceId: string | null;
  description: string;
  supplier: string | null;
  competence: string;
  dueDate: string;
  expectedAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: "open" | "partial" | "paid";
  payments: FinanceExpensePayment[];
};

export type FinanceCompositionItem = {
  key: string;
  label: string;
  amount: number;
  entryCount: number;
  share: number;
};

export type FinanceComposition = {
  income: FinanceCompositionItem[];
  expenses: FinanceCompositionItem[];
};

export type FinanceWorkspace = {
  tenantName: string;
  ownerName: string;
  month: string;
  monthLabel: string;
  summary: {
    incomeGross: number;
    receiptFees: number;
    operatingPaid: number;
    cashBalance: number;
    expectedOutflow: number;
    outstandingAmount: number;
  };
  comparison: {
    previousMonth: string;
    previousMonthLabel: string;
    hasPreviousActivity: boolean;
    current: {
      incomeGross: number;
      receiptFees: number;
      operatingPaid: number;
      cashBalance: number;
    };
    previous: {
      incomeGross: number;
      receiptFees: number;
      operatingPaid: number;
      cashBalance: number;
    };
    delta: {
      incomeGross: number;
      receiptFees: number;
      operatingPaid: number;
      cashBalance: number;
    };
  };
  composition: FinanceComposition;
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    expectedAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    expenseCount: number;
    shareOfExpected: number;
  }>;
  categories: Array<{ id: string; name: string; description: string | null }>;
  expenses: FinanceExpense[];
  recurringForecasts: Array<{
    recurrenceId: string;
    categoryId: string;
    categoryName: string;
    description: string;
    supplier: string | null;
    expectedAmount: number;
    competence: string;
    dueDate: string;
  }>;
};

export type FinanceYearWorkspace = {
  tenantName: string;
  ownerName: string;
  year: number;
  yearLabel: string;
  summary: {
    incomeGross: number;
    receiptFees: number;
    operatingPaid: number;
    cashBalance: number;
    expectedOutflow: number;
    outstandingAmount: number;
  };
  composition: FinanceComposition;
  categoryBreakdown: FinanceWorkspace["categoryBreakdown"];
  months: Array<{
    month: string;
    monthLabel: string;
    incomeGross: number;
    receiptFees: number;
    operatingPaid: number;
    cashBalance: number;
    expectedOutflow: number;
    outstandingAmount: number;
  }>;
  expenses: FinanceExpense[];
};

function fallback(month: string): FinanceWorkspace {
  const date = new Date(`${month}-01T12:00:00Z`);
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const previousDate = new Date(`${month}-01T12:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = previousDate.toISOString().slice(0, 7);
  const previousLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(previousDate);
  const emptyCash = {
    incomeGross: 0,
    receiptFees: 0,
    operatingPaid: 0,
    cashBalance: 0,
  };
  return {
    tenantName: "Stefanie Dellavolpe Doces",
    ownerName: "Stefanie",
    month,
    monthLabel: label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1),
    summary: {
      incomeGross: 0,
      receiptFees: 0,
      operatingPaid: 0,
      cashBalance: 0,
      expectedOutflow: 0,
      outstandingAmount: 0,
    },
    comparison: {
      previousMonth,
      previousMonthLabel:
        previousLabel.charAt(0).toLocaleUpperCase("pt-BR") +
        previousLabel.slice(1),
      hasPreviousActivity: false,
      current: emptyCash,
      previous: emptyCash,
      delta: emptyCash,
    },
    composition: { income: [], expenses: [] },
    categoryBreakdown: [],
    categories: [],
    expenses: [],
    recurringForecasts: [],
  };
}

function yearFallback(year: number): FinanceYearWorkspace {
  const months = Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );
  const emptyCash = {
    incomeGross: 0,
    receiptFees: 0,
    operatingPaid: 0,
    cashBalance: 0,
  };
  return {
    tenantName: "Stefanie Dellavolpe Doces",
    ownerName: "Stefanie",
    year,
    yearLabel: String(year),
    summary: { ...emptyCash, expectedOutflow: 0, outstandingAmount: 0 },
    composition: { income: [], expenses: [] },
    categoryBreakdown: [],
    months: months.map((month) => ({
      month,
      monthLabel: new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${month}-01T12:00:00Z`)),
      ...emptyCash,
      expectedOutflow: 0,
      outstandingAmount: 0,
    })),
    expenses: [],
  };
}

export async function getFinance(
  month: string,
  requestHeaders?: HeadersInit,
): Promise<FinanceWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };
  try {
    const response = await fetch(`${apiUrl}/finance?month=${month}`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return fallback(month);
    return (await response.json()) as FinanceWorkspace;
  } catch {
    return fallback(month);
  }
}

export async function getFinanceYear(
  year: number,
  requestHeaders?: HeadersInit,
): Promise<FinanceYearWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };
  try {
    const response = await fetch(`${apiUrl}/finance/year?year=${year}`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return yearFallback(year);
    return (await response.json()) as FinanceYearWorkspace;
  } catch {
    return yearFallback(year);
  }
}
