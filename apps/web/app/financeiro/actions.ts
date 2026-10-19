"use server";

import type { FinanceWorkspace } from "@/lib/finance";
import { apiRequestHeaders } from "@/lib/server-api";

export type FinanceActionState = {
  status: "idle" | "success" | "error";
  operation:
    | "expense"
    | "category"
    | "payment"
    | "payment_reversal"
    | "instantiate"
    | null;
  message: string;
  workspace: FinanceWorkspace;
  notificationId: number | null;
};

export async function mutateFinanceAction(
  previous: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const operation = String(formData.get("operation")) as Exclude<
    FinanceActionState["operation"],
    null
  >;
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  const month = String(formData.get("month") || previous.workspace.month);
  let endpoint = "";
  let body: Record<string, unknown> = {};

  if (operation === "expense") {
    endpoint = `${apiUrl}/finance/expenses`;
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      categoryId: String(formData.get("categoryId")),
      description: String(formData.get("description") || "").trim(),
      supplier: String(formData.get("supplier") || "").trim() || undefined,
      expectedAmount: Number(formData.get("expectedAmount")),
      competence: month,
      dueDate: String(formData.get("dueDate")),
      recurring: formData.get("recurring") === "on",
    };
  } else if (operation === "category") {
    endpoint = `${apiUrl}/finance/categories?month=${month}`;
    body = {
      name: String(formData.get("name") || "").trim(),
      description:
        String(formData.get("description") || "").trim() || undefined,
    };
  } else if (operation === "payment") {
    endpoint = `${apiUrl}/finance/expenses/${String(formData.get("expenseId"))}/payments`;
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      amount: Number(formData.get("amount")),
      paidAt: String(formData.get("paidAt")),
      note: String(formData.get("note") || "").trim() || undefined,
    };
  } else if (operation === "payment_reversal") {
    endpoint = `${apiUrl}/finance/expenses/${String(formData.get("expenseId"))}/payments/${String(formData.get("paymentId"))}/reverse`;
    body = { reason: String(formData.get("reason") || "").trim() };
  } else if (operation === "instantiate") {
    endpoint = `${apiUrl}/finance/recurrences/${String(formData.get("recurrenceId"))}/instantiate`;
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      competence: month,
    };
  } else {
    return {
      ...previous,
      status: "error",
      message: "Não reconheci esta ação.",
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
      workspace?: FinanceWorkspace;
    };
    if (!response.ok || !result.workspace)
      return {
        ...previous,
        status: "error",
        operation,
        message: result.message ?? "Não foi possível guardar esta alteração.",
      };
    return {
      status: "success",
      operation,
      message: result.message ?? "Financeiro atualizado.",
      workspace: result.workspace,
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
