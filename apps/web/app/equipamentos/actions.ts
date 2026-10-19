"use server";

import type { EquipmentWorkspace } from "@/lib/equipment";
import { apiRequestHeaders } from "@/lib/server-api";

export type EquipmentActionState = {
  status: "idle" | "success" | "error";
  operation:
    "create" | "maintenance" | "usage" | "unavailability" | "status" | null;
  message: string;
  workspace: EquipmentWorkspace;
  notificationId: number | null;
};

export async function mutateEquipmentAction(
  previous: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  const operation = String(formData.get("operation")) as Exclude<
    EquipmentActionState["operation"],
    null
  >;
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  const equipmentId = String(formData.get("equipmentId") || "");
  let endpoint = `${apiUrl}/equipment`;
  let method = "POST";
  let body: Record<string, unknown> = {};
  if (operation === "create") {
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      name: String(formData.get("name") || "").trim(),
      kind: String(formData.get("kind")),
      brand: String(formData.get("brand") || "").trim() || undefined,
      model: String(formData.get("model") || "").trim() || undefined,
      purchaseDate: String(formData.get("purchaseDate") || "") || undefined,
      purchaseValue: Number(formData.get("purchaseValue") || 0),
      capacityUnits: Number(formData.get("capacityUnits") || 1),
      notes: String(formData.get("notes") || "").trim() || undefined,
    };
  } else if (operation === "maintenance") {
    endpoint += `/${equipmentId}/maintenance`;
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      performedAt: String(formData.get("performedAt")),
      description: String(formData.get("description") || "").trim(),
      cost: Number(formData.get("cost") || 0),
      provider: String(formData.get("provider") || "").trim() || undefined,
      nextDueDate: String(formData.get("nextDueDate") || "") || undefined,
      notes: String(formData.get("notes") || "").trim() || undefined,
    };
  } else if (operation === "usage") {
    endpoint += `/${equipmentId}/usages`;
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      orderId: String(formData.get("orderId") || "") || undefined,
      usedAt: String(formData.get("usedAt")),
      durationMinutes: Number(formData.get("durationMinutes")) || undefined,
      notes: String(formData.get("notes") || "").trim() || undefined,
    };
  } else if (operation === "unavailability") {
    endpoint += `/${equipmentId}/unavailability`;
    const startsAt = String(formData.get("startsAt") || "");
    const endsAt = String(formData.get("endsAt") || "");
    const startsDate = new Date(`${startsAt}:00-03:00`);
    const endsDate = new Date(`${endsAt}:00-03:00`);
    body = {
      idempotencyKey: String(formData.get("idempotencyKey")),
      startsAt: Number.isNaN(startsDate.getTime())
        ? ""
        : startsDate.toISOString(),
      endsAt: Number.isNaN(endsDate.getTime()) ? "" : endsDate.toISOString(),
      reason: String(formData.get("reason") || "").trim(),
    };
  } else if (operation === "status") {
    endpoint += `/${equipmentId}/status`;
    method = "PUT";
    body = { status: String(formData.get("assetStatus")) };
  } else
    return {
      ...previous,
      status: "error",
      message: "Não reconheci esta ação.",
    };

  try {
    const response = await fetch(endpoint, {
      method,
      cache: "no-store",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6_000),
    });
    const result = (await response.json()) as {
      message?: string;
      workspace?: EquipmentWorkspace;
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
      message: result.message ?? "Equipamentos atualizados.",
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
