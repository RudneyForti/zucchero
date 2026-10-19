"use server";

import type {
  CustomerPrivacyExport,
  CustomerProfile,
  CustomerWorkspace,
} from "@/lib/customers";
import { apiRequestHeaders } from "@/lib/server-api";

export type CustomerDuplicateCandidate = Pick<
  CustomerProfile,
  "id" | "name" | "primaryPhone"
>;

export type CustomerActionState = {
  status: "idle" | "success" | "error" | "duplicate";
  message: string;
  workspace: CustomerWorkspace;
  customer: CustomerProfile | null;
  candidate: CustomerDuplicateCandidate | null;
  notificationId: number | null;
};

export type CustomerPrivacyActionState = {
  status: "idle" | "success" | "error";
  message: string;
  workspace: CustomerWorkspace;
  notificationId: number | null;
};

async function apiContext(json = false) {
  return {
    apiUrl: process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1",
    headers: await apiRequestHeaders(json),
  };
}

export async function exportCustomerPrivacyAction(customerId: string) {
  const { apiUrl, headers } = await apiContext();
  try {
    const response = await fetch(
      `${apiUrl}/customers/${customerId}/privacy/export`,
      {
        method: "POST",
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(4_000),
      },
    );
    const result = (await response.json()) as CustomerPrivacyExport & {
      message?: string;
    };
    if (!response.ok || !result.customer) {
      return {
        status: "error" as const,
        message: result.message ?? "Não foi possível preparar a exportação.",
        content: null,
        filename: null,
      };
    }
    const safeName = result.customer.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLocaleLowerCase("pt-BR");
    return {
      status: "success" as const,
      message: "A cópia dos dados está pronta.",
      content: JSON.stringify(result, null, 2),
      filename: `dados-${safeName || "cliente"}.json`,
    };
  } catch {
    return {
      status: "error" as const,
      message: "A cozinha não respondeu. Tente novamente em instantes.",
      content: null,
      filename: null,
    };
  }
}

export async function anonymizeCustomerAction(
  previous: CustomerPrivacyActionState,
  formData: FormData,
): Promise<CustomerPrivacyActionState> {
  const customerId = formData.get("customerId");
  const confirmation = formData.get("confirmation");
  const reason = formData.get("reason");
  if (
    typeof customerId !== "string" ||
    typeof confirmation !== "string" ||
    typeof reason !== "string"
  ) {
    return { ...previous, status: "error", message: "Revise a solicitação." };
  }
  const { apiUrl, headers } = await apiContext(true);
  try {
    const response = await fetch(
      `${apiUrl}/customers/${customerId}/privacy/anonymize`,
      {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({ confirmation, reason }),
        signal: AbortSignal.timeout(4_000),
      },
    );
    const result = (await response.json()) as {
      message?: string;
      workspace?: CustomerWorkspace;
    };
    if (!response.ok || !result.workspace) {
      return {
        ...previous,
        status: "error",
        message: result.message ?? "Não foi possível anonimizar os dados.",
      };
    }
    return {
      status: "success",
      message: result.message ?? "Os dados pessoais foram anonimizados.",
      workspace: result.workspace,
      notificationId: Date.now(),
    };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A cozinha não respondeu. Tente novamente em instantes.",
    };
  }
}

export async function saveCustomerAction(
  previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const rawPayload = formData.get("customerPayload");
  if (typeof rawPayload !== "string") {
    return {
      ...previous,
      status: "error",
      message: "O cadastro está incompleto.",
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Não foi possível ler os dados da cliente.",
    };
  }

  const customerId = formData.get("customerId");
  const isEditing = typeof customerId === "string" && customerId.length > 0;
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  const request = (baseUrl: string) =>
    fetch(
      isEditing ? `${baseUrl}/customers/${customerId}` : `${baseUrl}/customers`,
      {
        method: isEditing ? "PUT" : "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4_000),
      },
    );

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
      customer?: CustomerProfile;
      workspace?: CustomerWorkspace;
      candidate?: CustomerDuplicateCandidate;
      code?: string;
    };
    if (response.status === 409 && result.candidate) {
      return {
        ...previous,
        status: "duplicate",
        message: result.message ?? "Este telefone já pertence a outra cliente.",
        candidate: result.candidate,
      };
    }
    if (!response.ok || !result.workspace || !result.customer) {
      return {
        ...previous,
        status: "error",
        message: result.message ?? "Não foi possível salvar a cliente.",
      };
    }
    return {
      status: "success",
      message: result.message ?? "Cliente salva.",
      workspace: result.workspace,
      customer: result.customer,
      candidate: null,
      notificationId: Date.now(),
    };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A cozinha não respondeu. Tente novamente em instantes.",
    };
  }
}
