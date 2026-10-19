"use server";

import { apiRequestHeaders } from "@/lib/server-api";

import type { BusinessDay, SettingsWorkspace } from "@/lib/settings";

type Operation = "company" | "sales" | "schedule" | "profile";

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  operation: Operation | null;
  message: string;
  workspace: SettingsWorkspace;
  notificationId: number | null;
};

const dayKeys: BusinessDay["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function optional(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim() || undefined;
}

export async function mutateSettingsAction(
  previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const operation = String(formData.get("operation")) as Operation;
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  let endpoint: string;
  let body: Record<string, unknown>;

  if (operation === "company") {
    const name = String(formData.get("name") ?? "").trim();
    const email = optional(formData, "email");
    const state = optional(formData, "state")?.toUpperCase();
    const logoDataUrl = String(formData.get("logoDataUrl") ?? "") || null;
    if (name.length < 2)
      return {
        ...previous,
        status: "error",
        operation,
        message: "Informe o nome da confeitaria.",
      };
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      return {
        ...previous,
        status: "error",
        operation,
        message: "Revise o e-mail informado.",
      };
    if (state && !/^[A-Z]{2}$/.test(state))
      return {
        ...previous,
        status: "error",
        operation,
        message: "Use a sigla do estado com duas letras.",
      };
    if (
      logoDataUrl &&
      (logoDataUrl.length > 700_000 ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
          logoDataUrl,
        ))
    )
      return {
        ...previous,
        status: "error",
        operation,
        message: "Escolha uma imagem PNG, JPG ou WebP de até 512 KB.",
      };
    endpoint = "company";
    body = {
      name,
      phone: optional(formData, "phone"),
      email,
      taxDocument: optional(formData, "taxDocument"),
      addressLine: optional(formData, "addressLine"),
      addressNumber: optional(formData, "addressNumber"),
      addressComplement: optional(formData, "addressComplement"),
      neighborhood: optional(formData, "neighborhood"),
      city: optional(formData, "city"),
      state,
      postalCode: optional(formData, "postalCode"),
      isCommercialPoint: formData.get("isCommercialPoint") === "on",
      logoDataUrl,
    };
  } else if (operation === "profile") {
    const displayName = String(formData.get("displayName") ?? "").trim();
    const avatarDataUrl = String(formData.get("avatarDataUrl") ?? "") || null;
    if (displayName.length < 2) {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Informe como podemos chamar você.",
      };
    }
    if (
      avatarDataUrl &&
      (avatarDataUrl.length > 700_000 ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
          avatarDataUrl,
        ))
    ) {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Escolha uma imagem PNG, JPG ou WebP de até 512 KB.",
      };
    }
    endpoint = "profile";
    body = { displayName, avatarDataUrl };
  } else if (operation === "sales") {
    const defaultMarginPercentage = Number(
      formData.get("defaultMarginPercentage"),
    );
    const defaultDepositPercentage = Number(
      formData.get("defaultDepositPercentage"),
    );
    const defaultPaymentMethod = String(formData.get("defaultPaymentMethod"));
    const defaultDeliveryMode = String(formData.get("defaultDeliveryMode"));
    const deliveryCostPerKm = Number(formData.get("deliveryCostPerKm"));
    if (
      !Number.isFinite(defaultMarginPercentage) ||
      defaultMarginPercentage < 0 ||
      defaultMarginPercentage > 90 ||
      !Number.isFinite(defaultDepositPercentage) ||
      defaultDepositPercentage < 0 ||
      defaultDepositPercentage > 100 ||
      !Number.isFinite(deliveryCostPerKm) ||
      deliveryCostPerKm < 0 ||
      deliveryCostPerKm > 10_000
    ) {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Margem e sinal precisam estar dentro dos limites indicados.",
      };
    }
    if (
      !["pix", "card", "cash"].includes(defaultPaymentMethod) ||
      !["delivery", "pickup"].includes(defaultDeliveryMode)
    ) {
      return {
        ...previous,
        status: "error",
        operation,
        message: "Escolha os combinados de pagamento e entrega.",
      };
    }
    endpoint = "sales";
    body = {
      defaultMarginPercentage,
      defaultDepositPercentage,
      defaultPaymentMethod,
      defaultDeliveryMode,
      deliveryCostPerKm,
    };
  } else if (operation === "schedule") {
    const days = dayKeys.map((day) => ({
      day,
      enabled: formData.get(`${day}_enabled`) === "on",
      start: String(formData.get(`${day}_start`) ?? ""),
      end: String(formData.get(`${day}_end`) ?? ""),
    }));
    const invalid = days.some(
      (day) =>
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.end) ||
        (day.enabled && day.start >= day.end),
    );
    if (invalid)
      return {
        ...previous,
        status: "error",
        operation,
        message: "Revise os horários: o fim deve acontecer depois do início.",
      };
    endpoint = "schedule";
    body = { days };
  } else {
    return {
      ...previous,
      status: "error",
      operation: null,
      message: "Não reconheci este ajuste.",
    };
  }

  try {
    const response = await fetch(`${apiUrl}/settings/${endpoint}`, {
      method: "PATCH",
      cache: "no-store",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6_000),
    });
    const result = (await response.json()) as {
      message?: string;
      workspace?: SettingsWorkspace;
    };
    if (!response.ok || !result.workspace)
      return {
        ...previous,
        status: "error",
        operation,
        message: result.message ?? "Não foi possível guardar este ajuste.",
      };
    return {
      status: "success",
      operation,
      message: result.message ?? "Ajuste guardado.",
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
