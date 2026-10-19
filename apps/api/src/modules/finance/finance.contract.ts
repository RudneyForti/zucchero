import { z } from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export const financeMonthSchema = z.string().regex(monthPattern);
export const financeYearSchema = z.coerce.number().int().min(2000).max(2100);

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
});

export const createOperatingExpenseSchema = z.object({
  idempotencyKey: z.string().uuid(),
  categoryId: z.string().uuid(),
  description: z.string().trim().min(2).max(160),
  supplier: z.string().trim().max(120).optional(),
  expectedAmount: z.number().positive().max(1_000_000),
  competence: financeMonthSchema,
  dueDate: z.string().regex(datePattern),
  recurring: z.boolean().default(false),
});

export const registerExpensePaymentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  paidAt: z.string().regex(datePattern),
  note: z.string().trim().max(300).optional(),
});

export const reverseExpensePaymentSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const instantiateExpenseRecurrenceSchema = z.object({
  idempotencyKey: z.string().uuid(),
  competence: financeMonthSchema,
});

export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategorySchema
>;
export type CreateOperatingExpenseInput = z.infer<
  typeof createOperatingExpenseSchema
>;
export type RegisterExpensePaymentInput = z.infer<
  typeof registerExpensePaymentSchema
>;
export type ReverseExpensePaymentInput = z.infer<
  typeof reverseExpensePaymentSchema
>;
export type InstantiateExpenseRecurrenceInput = z.infer<
  typeof instantiateExpenseRecurrenceSchema
>;

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

export type FinanceRecurrenceForecast = {
  recurrenceId: string;
  categoryId: string;
  categoryName: string;
  description: string;
  supplier: string | null;
  expectedAmount: number;
  competence: string;
  dueDate: string;
};

export type FinanceCashSummary = {
  incomeGross: number;
  receiptFees: number;
  operatingPaid: number;
  cashBalance: number;
};

export type FinanceComparison = {
  previousMonth: string;
  previousMonthLabel: string;
  hasPreviousActivity: boolean;
  current: FinanceCashSummary;
  previous: FinanceCashSummary;
  delta: FinanceCashSummary;
};

export type FinanceCategoryBreakdown = {
  categoryId: string;
  categoryName: string;
  expectedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  expenseCount: number;
  shareOfExpected: number;
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
  comparison: FinanceComparison;
  composition: FinanceComposition;
  categoryBreakdown: FinanceCategoryBreakdown[];
  categories: Array<{ id: string; name: string; description: string | null }>;
  expenses: FinanceExpense[];
  recurringForecasts: FinanceRecurrenceForecast[];
};

export type FinanceYearMonth = {
  month: string;
  monthLabel: string;
  incomeGross: number;
  receiptFees: number;
  operatingPaid: number;
  cashBalance: number;
  expectedOutflow: number;
  outstandingAmount: number;
};

export type FinanceYearWorkspace = {
  tenantName: string;
  ownerName: string;
  year: number;
  yearLabel: string;
  summary: FinanceCashSummary & {
    expectedOutflow: number;
    outstandingAmount: number;
  };
  composition: FinanceComposition;
  categoryBreakdown: FinanceCategoryBreakdown[];
  months: FinanceYearMonth[];
  expenses: FinanceExpense[];
};

export type FinanceMutationResult = {
  message: string;
  workspace: FinanceWorkspace;
  repeated: boolean;
};
