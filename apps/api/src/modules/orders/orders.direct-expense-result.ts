export type OrderDirectExpenseEntry = {
  id: string;
  category: string;
  description: string;
  actualAmount: number;
  estimatedAmount: number;
  adjustment: number;
  incurredAt: string;
  note: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type OrderDirectExpenseResult = {
  estimatedBase: number;
  actualRegistered: number;
  estimatedReconciled: number;
  remainingEstimate: number;
  adjustment: number;
  effectiveAdditionalCost: number;
  activeCount: number;
  entries: OrderDirectExpenseEntry[];
};

export type DirectExpenseProjectionRow = {
  id: string;
  kind: "expense" | "reversal";
  category: string;
  description: string;
  actualAmount: number;
  estimatedAmount: number;
  incurredAt: Date;
  note: string | null;
  reversesExpenseId: string | null;
  createdAt: Date;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildOrderDirectExpenseResult(
  estimatedBase: number,
  rows: DirectExpenseProjectionRow[],
): OrderDirectExpenseResult {
  const reversals = new Map(
    rows
      .filter(
        (
          row,
        ): row is DirectExpenseProjectionRow & {
          reversesExpenseId: string;
        } => row.kind === "reversal" && Boolean(row.reversesExpenseId),
      )
      .map((row) => [row.reversesExpenseId, row]),
  );
  const entries = rows
    .filter((row) => row.kind === "expense")
    .map((row): OrderDirectExpenseEntry => {
      const reversal = reversals.get(row.id);
      return {
        id: row.id,
        category: row.category,
        description: row.description,
        actualAmount: roundMoney(row.actualAmount),
        estimatedAmount: roundMoney(row.estimatedAmount),
        adjustment: roundMoney(row.actualAmount - row.estimatedAmount),
        incurredAt: row.incurredAt.toISOString().slice(0, 10),
        note: row.note,
        reversedAt: reversal?.createdAt.toISOString() ?? null,
        reversalReason: reversal?.note ?? null,
      };
    })
    .sort((left, right) => right.incurredAt.localeCompare(left.incurredAt));
  const activeEntries = entries.filter((entry) => !entry.reversedAt);
  const actualRegistered = roundMoney(
    activeEntries.reduce((total, entry) => total + entry.actualAmount, 0),
  );
  const estimatedReconciled = roundMoney(
    activeEntries.reduce((total, entry) => total + entry.estimatedAmount, 0),
  );
  const safeEstimatedBase = roundMoney(estimatedBase);
  const adjustment = roundMoney(actualRegistered - estimatedReconciled);

  return {
    estimatedBase: safeEstimatedBase,
    actualRegistered,
    estimatedReconciled,
    remainingEstimate: roundMoney(
      Math.max(0, safeEstimatedBase - estimatedReconciled),
    ),
    adjustment,
    effectiveAdditionalCost: roundMoney(safeEstimatedBase + adjustment),
    activeCount: activeEntries.length,
    entries,
  };
}
