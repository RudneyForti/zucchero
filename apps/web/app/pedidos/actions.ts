"use server";

import type {
  DeliveryQuote,
  OrderWorkspace,
  StoredOrderSummary,
} from "@/lib/orders";
import { apiRequestHeaders } from "@/lib/server-api";

export type OrderActionState = {
  status: "idle" | "success" | "error";
  operation:
    | "confirm"
    | "status"
    | "replan"
    | "receipt"
    | "receipt_reversal"
    | "direct_expense"
    | "direct_expense_reversal"
    | null;
  message: string;
  workspace: OrderWorkspace;
  order: StoredOrderSummary | null;
  notificationId: number | null;
};

export type DeliveryQuoteActionResult =
  | { status: "success"; quote: DeliveryQuote }
  | { status: "error"; message: string };

export async function calculateDeliveryQuoteAction(input: {
  customerId: string;
  customerAddressId: string;
}): Promise<DeliveryQuoteActionResult> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  try {
    const response = await fetch(`${apiUrl}/orders/delivery-quote`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json()) as DeliveryQuote & {
      message?: string;
    };
    if (!response.ok || !result.quoteToken) {
      return {
        status: "error",
        message:
          result.message ?? "Não foi possível calcular esta entrega agora.",
      };
    }
    return { status: "success", quote: result };
  } catch {
    return {
      status: "error",
      message: "A rota demorou a responder. Tente novamente.",
    };
  }
}

export async function mutateOrderAction(
  previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const requestedOperation = formData.get("operation");
  const operation = [
    "status",
    "replan",
    "receipt",
    "receipt_reversal",
    "direct_expense",
    "direct_expense_reversal",
  ].includes(String(requestedOperation))
    ? (requestedOperation as Exclude<OrderActionState["operation"], null>)
    : "confirm";
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);

  if (
    operation === "direct_expense" ||
    operation === "direct_expense_reversal"
  ) {
    const orderId = formData.get("orderId");
    const expenseId = formData.get("expenseId");
    const reason = formData.get("reason");
    if (typeof orderId !== "string") {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Não foi possível reconhecer a encomenda.",
      };
    }

    let endpoint = `${apiUrl}/orders/${orderId}/direct-expenses`;
    let body: Record<string, unknown>;
    if (operation === "direct_expense_reversal") {
      if (typeof expenseId !== "string" || typeof reason !== "string") {
        return {
          ...previous,
          status: "error",
          operation,
          message: "Informe o gasto e o motivo do estorno.",
        };
      }
      endpoint += `/${expenseId}/reverse`;
      body = { reason: reason.trim() };
    } else {
      const idempotencyKey = formData.get("idempotencyKey");
      const category = formData.get("category");
      const description = formData.get("description");
      const incurredAt = formData.get("incurredAt");
      const actualAmount = Number(formData.get("actualAmount"));
      const estimatedAmount = Number(formData.get("estimatedAmount") || 0);
      const note = formData.get("note");
      if (
        typeof idempotencyKey !== "string" ||
        typeof category !== "string" ||
        typeof description !== "string" ||
        description.trim().length < 2 ||
        typeof incurredAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(incurredAt) ||
        !Number.isFinite(actualAmount) ||
        actualAmount <= 0 ||
        !Number.isFinite(estimatedAmount) ||
        estimatedAmount < 0
      ) {
        return {
          ...previous,
          status: "error",
          operation,
          message: "Revise o gasto real e a parcela que já estava prevista.",
        };
      }
      body = {
        idempotencyKey,
        category,
        description: description.trim(),
        actualAmount,
        estimatedAmount,
        incurredAt,
        note: typeof note === "string" && note.trim() ? note.trim() : undefined,
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(6_000),
      });
      const result = (await response.json()) as {
        message?: string;
        order?: StoredOrderSummary;
        workspace?: OrderWorkspace;
      };
      if (!response.ok || !result.workspace || !result.order) {
        return {
          ...previous,
          status: "error",
          operation,
          message:
            result.message ??
            (operation === "direct_expense"
              ? "Não foi possível registrar o gasto."
              : "Não foi possível estornar o gasto."),
        };
      }
      return {
        status: "success",
        operation,
        message: result.message ?? "Custo real atualizado.",
        workspace: result.workspace,
        order: result.order,
        notificationId: Date.now(),
      };
    } catch {
      return {
        ...previous,
        status: "error",
        operation,
        message: "A cozinha não respondeu. Tente novamente em instantes.",
      };
    }
  }

  if (operation === "receipt" || operation === "receipt_reversal") {
    const orderId = formData.get("orderId");
    const receiptId = formData.get("receiptId");
    const reason = formData.get("reason");
    if (typeof orderId !== "string") {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Não foi possível reconhecer a encomenda.",
      };
    }

    let endpoint = `${apiUrl}/orders/${orderId}/receipts`;
    let body: Record<string, unknown>;
    if (operation === "receipt_reversal") {
      if (typeof receiptId !== "string" || typeof reason !== "string") {
        return {
          ...previous,
          status: "error",
          operation,
          message: "Informe o recebimento e o motivo do estorno.",
        };
      }
      endpoint += `/${receiptId}/reverse`;
      body = { reason: reason.trim() };
    } else {
      const idempotencyKey = formData.get("idempotencyKey");
      const paymentMethod = formData.get("paymentMethod");
      const receivedAt = formData.get("receivedAt");
      const amount = Number(formData.get("amount"));
      const feeAmount = Number(formData.get("feeAmount") || 0);
      const note = formData.get("note");
      if (
        typeof idempotencyKey !== "string" ||
        typeof paymentMethod !== "string" ||
        typeof receivedAt !== "string" ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !Number.isFinite(feeAmount) ||
        feeAmount < 0 ||
        feeAmount > amount
      ) {
        return {
          ...previous,
          status: "error",
          operation,
          message: "Revise o valor, a taxa e a forma de recebimento.",
        };
      }
      body = {
        idempotencyKey,
        amount,
        feeAmount,
        paymentMethod,
        receivedAt,
        note: typeof note === "string" && note.trim() ? note.trim() : undefined,
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(6_000),
      });
      const result = (await response.json()) as {
        message?: string;
        order?: StoredOrderSummary;
        workspace?: OrderWorkspace;
      };
      if (!response.ok || !result.workspace || !result.order) {
        return {
          ...previous,
          status: "error",
          operation,
          message:
            result.message ??
            (operation === "receipt"
              ? "Não foi possível registrar o recebimento."
              : "Não foi possível estornar o recebimento."),
        };
      }
      return {
        status: "success",
        operation,
        message: result.message ?? "Acerto atualizado.",
        workspace: result.workspace,
        order: result.order,
        notificationId: Date.now(),
      };
    } catch {
      return {
        ...previous,
        status: "error",
        operation,
        message: "A cozinha não respondeu. Tente novamente em instantes.",
      };
    }
  }

  if (operation === "replan") {
    const orderId = formData.get("orderId");
    const deliveryAt = formData.get("deliveryAt");
    const reason = formData.get("reason");
    if (typeof orderId !== "string" || typeof deliveryAt !== "string") {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Não foi possível reconhecer o novo horário.",
      };
    }
    try {
      const response = await fetch(`${apiUrl}/orders/${orderId}/replan`, {
        method: "PUT",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          deliveryAt,
          reason:
            typeof reason === "string" && reason.trim()
              ? reason.trim()
              : undefined,
        }),
        signal: AbortSignal.timeout(6_000),
      });
      const result = (await response.json()) as {
        message?: string;
        order?: StoredOrderSummary;
        workspace?: OrderWorkspace;
      };
      if (!response.ok || !result.workspace || !result.order) {
        return {
          ...previous,
          status: "error",
          operation,
          message: result.message ?? "Não foi possível ajustar a entrega.",
        };
      }
      return {
        status: "success",
        operation,
        message: result.message ?? "Entrega e agenda ajustadas.",
        workspace: result.workspace,
        order: result.order,
        notificationId: Date.now(),
      };
    } catch {
      return {
        ...previous,
        status: "error",
        operation,
        message: "A cozinha não respondeu. Tente novamente em instantes.",
      };
    }
  }

  if (operation === "status") {
    const orderId = formData.get("orderId");
    const nextStatus = formData.get("nextStatus");
    const cancellationReason = formData.get("cancellationReason");
    if (typeof orderId !== "string" || typeof nextStatus !== "string") {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Não foi possível reconhecer o próximo passo.",
      };
    }
    try {
      const response = await fetch(`${apiUrl}/orders/${orderId}/status`, {
        method: "PUT",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          status: nextStatus,
          cancellationReason:
            typeof cancellationReason === "string" && cancellationReason.trim()
              ? cancellationReason.trim()
              : undefined,
        }),
        signal: AbortSignal.timeout(6_000),
      });
      const result = (await response.json()) as {
        message?: string;
        order?: StoredOrderSummary;
        workspace?: OrderWorkspace;
      };
      if (!response.ok || !result.workspace || !result.order) {
        return {
          ...previous,
          status: "error",
          operation,
          message: result.message ?? "Não foi possível atualizar a encomenda.",
        };
      }
      return {
        status: "success",
        operation,
        message: result.message ?? "Encomenda atualizada.",
        workspace: result.workspace,
        order: result.order,
        notificationId: Date.now(),
      };
    } catch {
      return {
        ...previous,
        status: "error",
        operation,
        message: "A cozinha não respondeu. Tente novamente em instantes.",
      };
    }
  }

  const rawPayload = formData.get("orderPayload");
  if (typeof rawPayload !== "string") {
    return {
      ...previous,
      status: "error",
      operation,
      message: "A encomenda está incompleta.",
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      ...previous,
      status: "error",
      operation,
      message: "Não foi possível ler os dados da encomenda.",
    };
  }

  const request = (baseUrl: string) =>
    fetch(`${baseUrl}/orders/confirm`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6_000),
    });

  try {
    let response = await request(apiUrl);
    if (
      response.status === 404 &&
      process.env.NODE_ENV !== "production" &&
      apiUrl === "http://localhost:3111/v1"
    ) {
      response = await request("http://localhost:3112/v1");
    }
    const result = (await response.json()) as {
      message?: string;
      order?: StoredOrderSummary;
      workspace?: OrderWorkspace;
    };
    if (!response.ok || !result.workspace || !result.order) {
      return {
        ...previous,
        status: "error",
        operation,
        message: result.message ?? "Não foi possível confirmar a encomenda.",
      };
    }
    return {
      status: "success",
      operation,
      message: result.message ?? "Encomenda confirmada.",
      workspace: result.workspace,
      order: result.order,
      notificationId: Date.now(),
    };
  } catch {
    return {
      ...previous,
      status: "error",
      operation,
      message: "A cozinha não respondeu. Tente novamente em instantes.",
    };
  }
}
