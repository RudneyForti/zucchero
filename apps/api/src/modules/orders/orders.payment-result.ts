export type OrderPaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export type OrderPaymentEntry = {
  id: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  paymentMethod: string;
  receivedAt: string;
  note: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type OrderPaymentResult = {
  status: OrderPaymentStatus;
  price: number;
  grossReceived: number;
  feeTotal: number;
  netReceived: number;
  balanceDue: number;
  overpaidAmount: number;
  receiptCount: number;
  receipts: OrderPaymentEntry[];
};

export type PaymentProjectionRow = {
  id: string;
  kind: "receipt" | "reversal";
  amount: number;
  feeAmount: number;
  paymentMethod: string;
  receivedAt: Date;
  note: string | null;
  reversesReceiptId: string | null;
  createdAt: Date;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildOrderPaymentResult(
  price: number,
  rows: PaymentProjectionRow[],
): OrderPaymentResult {
  const reversals = new Map(
    rows
      .filter(
        (row): row is PaymentProjectionRow & { reversesReceiptId: string } =>
          row.kind === "reversal" && Boolean(row.reversesReceiptId),
      )
      .map((row) => [row.reversesReceiptId, row]),
  );
  const receipts = rows
    .filter((row) => row.kind === "receipt")
    .map((row): OrderPaymentEntry => {
      const reversal = reversals.get(row.id);
      return {
        id: row.id,
        amount: roundMoney(row.amount),
        feeAmount: roundMoney(row.feeAmount),
        netAmount: roundMoney(row.amount - row.feeAmount),
        paymentMethod: row.paymentMethod,
        receivedAt: row.receivedAt.toISOString(),
        note: row.note,
        reversedAt: reversal?.createdAt.toISOString() ?? null,
        reversalReason: reversal?.note ?? null,
      };
    })
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  const activeReceipts = receipts.filter((receipt) => !receipt.reversedAt);
  const grossReceived = roundMoney(
    activeReceipts.reduce((total, receipt) => total + receipt.amount, 0),
  );
  const feeTotal = roundMoney(
    activeReceipts.reduce((total, receipt) => total + receipt.feeAmount, 0),
  );
  const safePrice = roundMoney(price);
  const balanceDue = roundMoney(Math.max(0, safePrice - grossReceived));
  const overpaidAmount = roundMoney(Math.max(0, grossReceived - safePrice));
  const status: OrderPaymentStatus =
    grossReceived <= 0
      ? "unpaid"
      : overpaidAmount > 0
        ? "overpaid"
        : balanceDue > 0
          ? "partial"
          : "paid";

  return {
    status,
    price: safePrice,
    grossReceived,
    feeTotal,
    netReceived: roundMoney(grossReceived - feeTotal),
    balanceDue,
    overpaidAmount,
    receiptCount: activeReceipts.length,
    receipts,
  };
}
