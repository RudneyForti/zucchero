import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  expenseCategories,
  expensePayments,
  expenseRecurrences,
  operatingExpenses,
  orderReceipts,
} from "../../database/schema";
import type {
  CreateExpenseCategoryInput,
  CreateOperatingExpenseInput,
  FinanceMutationResult,
  FinanceWorkspace,
  FinanceYearWorkspace,
  InstantiateExpenseRecurrenceInput,
  RegisterExpensePaymentInput,
  ReverseExpensePaymentInput,
} from "./finance.contract";
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
  roundMoney,
} from "./finance.projection";

const demoTenantId = "11111111-1111-4111-8111-111111111111";

function monthDate(month: string) {
  return new Date(`${month}-01T12:00:00.000Z`);
}

function exactDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new ConflictException("Informe uma data válida.");
  }
  return date;
}

function monthOf(value: Date) {
  return value.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate(month));
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function normalizedName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function paymentMethodLabel(value: string) {
  return (
    {
      pix: "Pix",
      card: "Cartão",
      cash: "Dinheiro",
    }[value] ?? "Outra forma"
  );
}

function monthsOfYear(year: number) {
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );
}

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getForTenant(
    tenantId: string,
    month: string,
  ): Promise<FinanceWorkspace> {
    if (!this.database.isConfigured)
      return this.emptyWorkspace(tenantId, month);
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadWorkspace(transaction, tenantId, month),
    );
  }

  async getYearForTenant(
    tenantId: string,
    year: number,
  ): Promise<FinanceYearWorkspace> {
    if (!this.database.isConfigured)
      return this.emptyYearWorkspace(tenantId, year);
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadYearWorkspace(transaction, tenantId, year),
    );
  }

  async exportForTenant(tenantId: string, month: string) {
    return buildFinanceCsv(await this.getForTenant(tenantId, month));
  }

  async createCategory(
    tenantId: string,
    input: CreateExpenseCategoryInput,
    month: string,
  ): Promise<FinanceMutationResult> {
    if (!this.database.isConfigured) {
      throw new ConflictException("Conecte o banco para cadastrar categorias.");
    }
    await this.database.withTenant(tenantId, async (transaction) => {
      const normalized = normalizedName(input.name);
      const [existing] = await transaction
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(eq(expenseCategories.normalizedName, normalized));
      if (existing) throw new ConflictException("Esta categoria já existe.");
      await transaction.insert(expenseCategories).values({
        tenantId,
        name: input.name,
        normalizedName: normalized,
        description: input.description,
      });
    });
    return {
      message: `Categoria ${input.name} criada.`,
      workspace: await this.getForTenant(tenantId, month),
      repeated: false,
    };
  }

  async createExpense(
    tenantId: string,
    input: CreateOperatingExpenseInput,
  ): Promise<FinanceMutationResult> {
    if (!this.database.isConfigured) {
      throw new ConflictException("Conecte o banco para registrar despesas.");
    }
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [existing] = await transaction
          .select({ id: operatingExpenses.id })
          .from(operatingExpenses)
          .where(eq(operatingExpenses.idempotencyKey, input.idempotencyKey));
        if (existing) return true;
        const [category] = await transaction
          .select({ id: expenseCategories.id })
          .from(expenseCategories)
          .where(
            and(
              eq(expenseCategories.id, input.categoryId),
              eq(expenseCategories.tenantId, tenantId),
            ),
          );
        if (!category) throw new NotFoundException("Categoria não encontrada.");

        const competence = monthDate(input.competence);
        const dueDate = exactDate(input.dueDate);
        if (monthOf(dueDate) !== input.competence) {
          throw new ConflictException(
            "O vencimento precisa estar no mês da conta.",
          );
        }
        let recurrenceId: string | null = null;
        if (input.recurring) {
          const [recurrence] = await transaction
            .insert(expenseRecurrences)
            .values({
              tenantId,
              categoryId: input.categoryId,
              description: input.description,
              supplier: input.supplier,
              expectedAmount: roundMoney(input.expectedAmount),
              dayOfMonth: Math.min(28, dueDate.getUTCDate()),
              startMonth: competence,
            })
            .returning({ id: expenseRecurrences.id });
          recurrenceId = recurrence?.id ?? null;
        }
        await transaction.insert(operatingExpenses).values({
          tenantId,
          categoryId: input.categoryId,
          recurrenceId,
          idempotencyKey: input.idempotencyKey,
          description: input.description,
          supplier: input.supplier,
          competence,
          dueDate,
          expectedAmount: roundMoney(input.expectedAmount),
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "OPERATING_EXPENSE_CREATED",
          correlationId: input.idempotencyKey,
          payload: {
            description: input.description,
            amount: input.expectedAmount,
            recurring: input.recurring,
          },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Esta conta já estava registrada."
        : "Conta incluída no mês.",
      workspace: await this.getForTenant(tenantId, input.competence),
      repeated,
    };
  }

  async instantiateRecurrence(
    tenantId: string,
    recurrenceId: string,
    input: InstantiateExpenseRecurrenceInput,
  ): Promise<FinanceMutationResult> {
    if (!this.database.isConfigured)
      throw new ConflictException("Banco não configurado.");
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [idempotent] = await transaction
          .select({ id: operatingExpenses.id })
          .from(operatingExpenses)
          .where(eq(operatingExpenses.idempotencyKey, input.idempotencyKey));
        if (idempotent) return true;
        const [recurrence] = await transaction
          .select()
          .from(expenseRecurrences)
          .where(
            and(
              eq(expenseRecurrences.id, recurrenceId),
              eq(expenseRecurrences.active, true),
            ),
          );
        if (!recurrence)
          throw new NotFoundException("Compromisso recorrente não encontrado.");
        const competence = monthDate(input.competence);
        if (
          competence < recurrence.startMonth ||
          (recurrence.endMonth && competence > recurrence.endMonth)
        ) {
          throw new ConflictException(
            "Este compromisso não vigora no mês escolhido.",
          );
        }
        const [already] = await transaction
          .select({ id: operatingExpenses.id })
          .from(operatingExpenses)
          .where(
            and(
              eq(operatingExpenses.recurrenceId, recurrenceId),
              eq(operatingExpenses.competence, competence),
            ),
          );
        if (already) return true;
        await transaction.insert(operatingExpenses).values({
          tenantId,
          categoryId: recurrence.categoryId,
          recurrenceId,
          idempotencyKey: input.idempotencyKey,
          description: recurrence.description,
          supplier: recurrence.supplier,
          competence,
          dueDate: exactDate(
            `${input.competence}-${String(recurrence.dayOfMonth).padStart(2, "0")}`,
          ),
          expectedAmount: recurrence.expectedAmount,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EXPENSE_RECURRENCE_INSTANTIATED",
          correlationId: input.idempotencyKey,
          payload: { recurrenceId, competence: input.competence },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Esta conta já estava no mês."
        : "Compromisso trazido para este mês.",
      workspace: await this.getForTenant(tenantId, input.competence),
      repeated,
    };
  }

  async registerPayment(
    tenantId: string,
    expenseId: string,
    input: RegisterExpensePaymentInput,
  ): Promise<FinanceMutationResult> {
    if (!this.database.isConfigured)
      throw new ConflictException("Banco não configurado.");
    let competence = monthOf(exactDate(input.paidAt));
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [idempotent] = await transaction
          .select()
          .from(expensePayments)
          .where(eq(expensePayments.idempotencyKey, input.idempotencyKey));
        if (idempotent) {
          const [expense] = await transaction
            .select()
            .from(operatingExpenses)
            .where(eq(operatingExpenses.id, idempotent.expenseId));
          if (expense) competence = monthOf(expense.competence);
          return true;
        }
        const [expense] = await transaction
          .select()
          .from(operatingExpenses)
          .where(eq(operatingExpenses.id, expenseId));
        if (!expense || expense.cancelledAt)
          throw new NotFoundException("Conta não encontrada.");
        competence = monthOf(expense.competence);
        const rows = await transaction
          .select()
          .from(expensePayments)
          .where(eq(expensePayments.expenseId, expenseId));
        const paid = activePaymentRows(rows).reduce(
          (sum, payment) => sum + payment.amount,
          0,
        );
        const balance = roundMoney(Math.max(0, expense.expectedAmount - paid));
        if (balance <= 0)
          throw new ConflictException("Esta conta já está paga.");
        if (input.amount > balance + 0.001) {
          throw new ConflictException(
            `O saldo desta conta é ${balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
          );
        }
        await transaction.insert(expensePayments).values({
          tenantId,
          expenseId,
          idempotencyKey: input.idempotencyKey,
          amount: roundMoney(input.amount),
          paidAt: exactDate(input.paidAt),
          note: input.note,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EXPENSE_PAYMENT_REGISTERED",
          correlationId: input.idempotencyKey,
          payload: { expenseId, amount: input.amount, paidAt: input.paidAt },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Este pagamento já estava registrado."
        : "Pagamento anotado no caixa.",
      workspace: await this.getForTenant(tenantId, competence),
      repeated,
    };
  }

  async reversePayment(
    tenantId: string,
    expenseId: string,
    paymentId: string,
    input: ReverseExpensePaymentInput,
  ): Promise<FinanceMutationResult> {
    if (!this.database.isConfigured)
      throw new ConflictException("Banco não configurado.");
    let competence = new Date().toISOString().slice(0, 7);
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [payment] = await transaction
          .select()
          .from(expensePayments)
          .where(
            and(
              eq(expensePayments.id, paymentId),
              eq(expensePayments.expenseId, expenseId),
              eq(expensePayments.kind, "payment"),
            ),
          );
        if (!payment) throw new NotFoundException("Pagamento não encontrado.");
        const [expense] = await transaction
          .select()
          .from(operatingExpenses)
          .where(eq(operatingExpenses.id, expenseId));
        if (expense) competence = monthOf(expense.competence);
        const [existing] = await transaction
          .select()
          .from(expensePayments)
          .where(eq(expensePayments.reversesPaymentId, paymentId));
        if (existing) return true;
        const correlationId = randomUUID();
        await transaction.insert(expensePayments).values({
          tenantId,
          expenseId,
          idempotencyKey: correlationId,
          kind: "reversal",
          amount: payment.amount,
          paidAt: payment.paidAt,
          note: input.reason,
          reversesPaymentId: payment.id,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EXPENSE_PAYMENT_REVERSED",
          correlationId,
          payload: { expenseId, paymentId, reason: input.reason },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Este pagamento já estava estornado."
        : "Pagamento estornado; o histórico foi preservado.",
      workspace: await this.getForTenant(tenantId, competence),
      repeated,
    };
  }

  private async loadWorkspace(
    transaction: AppTransaction,
    tenantId: string,
    month: string,
  ): Promise<FinanceWorkspace> {
    const [categories, expenses, recurrences, payments, receipts] =
      await Promise.all([
        transaction
          .select()
          .from(expenseCategories)
          .orderBy(asc(expenseCategories.name)),
        transaction
          .select()
          .from(operatingExpenses)
          .orderBy(asc(operatingExpenses.dueDate)),
        transaction.select().from(expenseRecurrences),
        transaction.select().from(expensePayments),
        transaction.select().from(orderReceipts),
      ]);
    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const monthExpenses = expenses
      .filter(
        (expense) =>
          !expense.cancelledAt && monthOf(expense.competence) === month,
      )
      .map((expense) =>
        buildFinanceExpense(
          expense,
          categoryNames.get(expense.categoryId) ?? "Outros",
          payments.filter((payment) => payment.expenseId === expense.id),
        ),
      );
    const instantiatedRecurrences = new Set(
      monthExpenses.flatMap((expense) =>
        expense.recurrenceId ? [expense.recurrenceId] : [],
      ),
    );
    const selectedMonth = monthDate(month);
    const recurringForecasts = recurrences
      .filter(
        (recurrence) =>
          recurrence.active &&
          recurrence.startMonth <= selectedMonth &&
          (!recurrence.endMonth || recurrence.endMonth >= selectedMonth) &&
          !instantiatedRecurrences.has(recurrence.id),
      )
      .map((recurrence) =>
        buildRecurrenceForecast({
          recurrence,
          categoryName: categoryNames.get(recurrence.categoryId) ?? "Outros",
          month,
        }),
      );

    const reversedReceiptIds = new Set(
      receipts
        .filter(
          (receipt) => receipt.kind === "reversal" && receipt.reversesReceiptId,
        )
        .map((receipt) => receipt.reversesReceiptId as string),
    );
    const activeReceipts = receipts.filter(
      (receipt) =>
        receipt.kind === "receipt" && !reversedReceiptIds.has(receipt.id),
    );
    const activePayments = activePaymentRows(payments);
    const summarize = (targetMonth: string) => {
      const monthReceipts = activeReceipts.filter(
        (receipt) => monthOf(receipt.receivedAt) === targetMonth,
      );
      const monthPayments = activePayments.filter(
        (payment) => monthOf(payment.paidAt) === targetMonth,
      );
      return cashSummary({
        incomeGross: monthReceipts.reduce(
          (sum, receipt) => sum + receipt.amount,
          0,
        ),
        receiptFees: monthReceipts.reduce(
          (sum, receipt) => sum + receipt.feeAmount,
          0,
        ),
        operatingPaid: monthPayments.reduce(
          (sum, payment) => sum + payment.amount,
          0,
        ),
      });
    };
    const currentCash = summarize(month);
    const comparisonMonth = previousMonth(month);
    const previousCash = summarize(comparisonMonth);
    const expectedOutflow = roundMoney(
      monthExpenses.reduce((sum, expense) => sum + expense.expectedAmount, 0) +
        recurringForecasts.reduce(
          (sum, forecast) => sum + forecast.expectedAmount,
          0,
        ),
    );
    const outstandingAmount = roundMoney(
      monthExpenses.reduce((sum, expense) => sum + expense.balanceDue, 0) +
        recurringForecasts.reduce(
          (sum, forecast) => sum + forecast.expectedAmount,
          0,
        ),
    );
    const monthReceiptRows = activeReceipts.filter(
      (receipt) => monthOf(receipt.receivedAt) === month,
    );
    const monthPaymentRows = activePayments.filter(
      (payment) => monthOf(payment.paidAt) === month,
    );
    const expenseById = new Map(
      expenses.map((expense) => [expense.id, expense]),
    );
    const composition = {
      income: buildCompositionBreakdown(
        monthReceiptRows.map((receipt) => ({
          key: receipt.paymentMethod,
          label: paymentMethodLabel(receipt.paymentMethod),
          amount: receipt.amount,
        })),
      ),
      expenses: buildCompositionBreakdown([
        ...monthPaymentRows.map((payment) => {
          const expense = expenseById.get(payment.expenseId);
          const categoryId = expense?.categoryId ?? "other";
          return {
            key: categoryId,
            label: categoryNames.get(categoryId) ?? "Outros gastos",
            amount: payment.amount,
          };
        }),
        ...monthReceiptRows
          .filter((receipt) => receipt.feeAmount > 0)
          .map((receipt) => ({
            key: "receipt-fees",
            label: "Taxas dos recebimentos",
            amount: receipt.feeAmount,
          })),
      ]),
    };
    return {
      tenantName:
        tenantId === demoTenantId
          ? "Stefanie Dellavolpe Doces"
          : "Confeitaria Vizinha",
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
      month,
      monthLabel: monthLabel(month),
      summary: { ...currentCash, expectedOutflow, outstandingAmount },
      comparison: {
        previousMonth: comparisonMonth,
        previousMonthLabel: monthLabel(comparisonMonth),
        hasPreviousActivity: Object.values(previousCash).some(
          (value) => Math.abs(value) > 0.001,
        ),
        current: currentCash,
        previous: previousCash,
        delta: compareCashSummaries(currentCash, previousCash),
      },
      composition,
      categoryBreakdown: buildCategoryBreakdown(monthExpenses),
      categories: categories
        .filter((category) => !category.archivedAt)
        .map(({ id, name, description }) => ({ id, name, description })),
      expenses: monthExpenses,
      recurringForecasts,
    };
  }

  private async loadYearWorkspace(
    transaction: AppTransaction,
    tenantId: string,
    year: number,
  ): Promise<FinanceYearWorkspace> {
    const [categories, expenses, recurrences, payments, receipts] =
      await Promise.all([
        transaction
          .select()
          .from(expenseCategories)
          .orderBy(asc(expenseCategories.name)),
        transaction
          .select()
          .from(operatingExpenses)
          .orderBy(asc(operatingExpenses.dueDate)),
        transaction.select().from(expenseRecurrences),
        transaction.select().from(expensePayments),
        transaction.select().from(orderReceipts),
      ]);
    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const yearPrefix = `${year}-`;
    const yearExpenseRows = expenses.filter(
      (expense) =>
        !expense.cancelledAt &&
        monthOf(expense.competence).startsWith(yearPrefix),
    );
    const yearExpenses = yearExpenseRows.map((expense) =>
      buildFinanceExpense(
        expense,
        categoryNames.get(expense.categoryId) ?? "Outros",
        payments.filter((payment) => payment.expenseId === expense.id),
      ),
    );
    const reversedReceiptIds = new Set(
      receipts
        .filter(
          (receipt) => receipt.kind === "reversal" && receipt.reversesReceiptId,
        )
        .map((receipt) => receipt.reversesReceiptId as string),
    );
    const activeReceipts = receipts.filter(
      (receipt) =>
        receipt.kind === "receipt" && !reversedReceiptIds.has(receipt.id),
    );
    const activePayments = activePaymentRows(payments);
    const yearReceipts = activeReceipts.filter((receipt) =>
      monthOf(receipt.receivedAt).startsWith(yearPrefix),
    );
    const yearPayments = activePayments.filter((payment) =>
      monthOf(payment.paidAt).startsWith(yearPrefix),
    );
    const expenseById = new Map(
      expenses.map((expense) => [expense.id, expense]),
    );
    const months = monthsOfYear(year).map((month) => {
      const monthReceipts = yearReceipts.filter(
        (receipt) => monthOf(receipt.receivedAt) === month,
      );
      const monthPayments = yearPayments.filter(
        (payment) => monthOf(payment.paidAt) === month,
      );
      const monthExpenses = yearExpenses.filter(
        (expense) => expense.competence === month,
      );
      const instantiatedRecurrences = new Set(
        monthExpenses.flatMap((expense) =>
          expense.recurrenceId ? [expense.recurrenceId] : [],
        ),
      );
      const selectedMonth = monthDate(month);
      const forecastAmount = recurrences
        .filter(
          (recurrence) =>
            recurrence.active &&
            recurrence.startMonth <= selectedMonth &&
            (!recurrence.endMonth || recurrence.endMonth >= selectedMonth) &&
            !instantiatedRecurrences.has(recurrence.id),
        )
        .reduce((sum, recurrence) => sum + recurrence.expectedAmount, 0);
      const cash = cashSummary({
        incomeGross: monthReceipts.reduce(
          (sum, receipt) => sum + receipt.amount,
          0,
        ),
        receiptFees: monthReceipts.reduce(
          (sum, receipt) => sum + receipt.feeAmount,
          0,
        ),
        operatingPaid: monthPayments.reduce(
          (sum, payment) => sum + payment.amount,
          0,
        ),
      });
      return {
        month,
        monthLabel: monthLabel(month).replace(` de ${year}`, ""),
        ...cash,
        expectedOutflow: roundMoney(
          monthExpenses.reduce(
            (sum, expense) => sum + expense.expectedAmount,
            0,
          ) + forecastAmount,
        ),
        outstandingAmount: roundMoney(
          monthExpenses.reduce((sum, expense) => sum + expense.balanceDue, 0) +
            forecastAmount,
        ),
      };
    });
    const summary = cashSummary({
      incomeGross: yearReceipts.reduce(
        (sum, receipt) => sum + receipt.amount,
        0,
      ),
      receiptFees: yearReceipts.reduce(
        (sum, receipt) => sum + receipt.feeAmount,
        0,
      ),
      operatingPaid: yearPayments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ),
    });
    return {
      tenantName:
        tenantId === demoTenantId
          ? "Stefanie Dellavolpe Doces"
          : "Confeitaria Vizinha",
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
      year,
      yearLabel: String(year),
      summary: {
        ...summary,
        expectedOutflow: roundMoney(
          months.reduce((sum, month) => sum + month.expectedOutflow, 0),
        ),
        outstandingAmount: roundMoney(
          months.reduce((sum, month) => sum + month.outstandingAmount, 0),
        ),
      },
      composition: {
        income: buildCompositionBreakdown(
          yearReceipts.map((receipt) => ({
            key: receipt.paymentMethod,
            label: paymentMethodLabel(receipt.paymentMethod),
            amount: receipt.amount,
          })),
        ),
        expenses: buildCompositionBreakdown([
          ...yearPayments.map((payment) => {
            const expense = expenseById.get(payment.expenseId);
            const categoryId = expense?.categoryId ?? "other";
            return {
              key: categoryId,
              label: categoryNames.get(categoryId) ?? "Outros gastos",
              amount: payment.amount,
            };
          }),
          ...yearReceipts
            .filter((receipt) => receipt.feeAmount > 0)
            .map((receipt) => ({
              key: "receipt-fees",
              label: "Taxas dos recebimentos",
              amount: receipt.feeAmount,
            })),
        ]),
      },
      categoryBreakdown: buildCategoryBreakdown(yearExpenses),
      months,
      expenses: yearExpenses,
    };
  }

  private emptyWorkspace(tenantId: string, month: string): FinanceWorkspace {
    const comparisonMonth = previousMonth(month);
    const emptyCash = cashSummary({
      incomeGross: 0,
      receiptFees: 0,
      operatingPaid: 0,
    });
    return {
      tenantName:
        tenantId === demoTenantId
          ? "Stefanie Dellavolpe Doces"
          : "Confeitaria Vizinha",
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
      month,
      monthLabel: monthLabel(month),
      summary: { ...emptyCash, expectedOutflow: 0, outstandingAmount: 0 },
      comparison: {
        previousMonth: comparisonMonth,
        previousMonthLabel: monthLabel(comparisonMonth),
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

  private emptyYearWorkspace(
    tenantId: string,
    year: number,
  ): FinanceYearWorkspace {
    const emptyCash = cashSummary({
      incomeGross: 0,
      receiptFees: 0,
      operatingPaid: 0,
    });
    return {
      tenantName:
        tenantId === demoTenantId
          ? "Stefanie Dellavolpe Doces"
          : "Confeitaria Vizinha",
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
      year,
      yearLabel: String(year),
      summary: { ...emptyCash, expectedOutflow: 0, outstandingAmount: 0 },
      composition: { income: [], expenses: [] },
      categoryBreakdown: [],
      months: monthsOfYear(year).map((month) => ({
        month,
        monthLabel: monthLabel(month).replace(` de ${year}`, ""),
        ...emptyCash,
        expectedOutflow: 0,
        outstandingAmount: 0,
      })),
      expenses: [],
    };
  }
}
