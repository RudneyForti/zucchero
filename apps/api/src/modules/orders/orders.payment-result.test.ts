import { describe, expect, it } from "vitest";
import {
  buildOrderPaymentResult,
  type PaymentProjectionRow,
} from "./orders.payment-result";

const receivedAt = new Date("2026-08-26T12:00:00-03:00");

function receipt(
  id: string,
  amount: number,
  feeAmount = 0,
): PaymentProjectionRow {
  return {
    id,
    kind: "receipt",
    amount,
    feeAmount,
    paymentMethod: "card",
    receivedAt,
    note: null,
    reversesReceiptId: null,
    createdAt: receivedAt,
  };
}

describe("buildOrderPaymentResult", () => {
  it("diferencia o que a cliente pagou do líquido após a taxa", () => {
    const result = buildOrderPaymentResult(100, [receipt("receipt-1", 40, 2)]);

    expect(result.status).toBe("partial");
    expect(result.grossReceived).toBe(40);
    expect(result.netReceived).toBe(38);
    expect(result.feeTotal).toBe(2);
    expect(result.balanceDue).toBe(60);
  });

  it("considera o pedido pago pela soma de entradas válidas", () => {
    const result = buildOrderPaymentResult(100, [
      receipt("receipt-1", 40),
      receipt("receipt-2", 60, 3),
    ]);

    expect(result.status).toBe("paid");
    expect(result.grossReceived).toBe(100);
    expect(result.feeTotal).toBe(3);
  });

  it("retira integralmente um recebimento estornado da projeção", () => {
    const reversal: PaymentProjectionRow = {
      ...receipt("reversal-1", 40, 2),
      kind: "reversal",
      reversesReceiptId: "receipt-1",
      note: "Lançamento registrado em duplicidade.",
      createdAt: new Date("2026-08-27T09:00:00-03:00"),
    };
    const result = buildOrderPaymentResult(100, [
      receipt("receipt-1", 40, 2),
      reversal,
    ]);

    expect(result.status).toBe("unpaid");
    expect(result.grossReceived).toBe(0);
    expect(result.feeTotal).toBe(0);
    expect(result.receipts[0]).toMatchObject({
      reversedAt: "2026-08-27T12:00:00.000Z",
      reversalReason: "Lançamento registrado em duplicidade.",
    });
  });
});
