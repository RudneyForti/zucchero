"use server";

import { apiRequestHeaders } from "@/lib/server-api";

import type { TodayView } from "@/lib/today";

export type ProductionActionState = {
  status: "idle" | "success" | "error";
  message: string;
  today: TodayView;
  notificationId: number | null;
};

const allowedActions = new Set(["start", "wait", "resume", "complete"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateProductionTaskAction(
  previous: ProductionActionState,
  formData: FormData,
): Promise<ProductionActionState> {
  const taskId = formData.get("taskId");
  const rawOperation = formData.get("operation");
  const operation =
    rawOperation === "note"
      ? "note"
      : rawOperation === "consumption"
        ? "consumption"
        : rawOperation === "consumption_correction"
          ? "consumption_correction"
          : "task";
  const action = formData.get("taskAction");
  const rawNote = formData.get("note");
  const rawCorrectionReason = formData.get("correctionReason");
  if (typeof taskId !== "string") {
    return {
      ...previous,
      status: "error",
      message: "Não foi possível reconhecer este preparo.",
    };
  }
  if (
    operation === "task" &&
    (typeof action !== "string" || !allowedActions.has(action))
  )
    return {
      ...previous,
      status: "error",
      message: "Não foi possível reconhecer o próximo passo do preparo.",
    };
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  const correctionReason =
    typeof rawCorrectionReason === "string" ? rawCorrectionReason.trim() : "";
  if (operation === "note" && (note.length < 1 || note.length > 1000))
    return {
      ...previous,
      status: "error",
      message: "Escreva uma observação de até 1.000 caracteres.",
    };
  const requirementIds = formData.getAll("requirementId");
  const actualUsedValues = formData.getAll("actualUsedG");
  const lossValues = formData.getAll("lossG");
  const consumptionLines = requirementIds.map((requirementId, index) => ({
    requirementId,
    actualUsedG: Number(actualUsedValues[index]),
    lossG: Number(lossValues[index]),
  }));
  if (
    operation === "consumption_correction" &&
    (correctionReason.length < 5 || correctionReason.length > 500)
  )
    return {
      ...previous,
      status: "error",
      message: "Conte brevemente o motivo da correção.",
    };
  const isConsumptionOperation =
    operation === "consumption" || operation === "consumption_correction";
  const invalidConsumption =
    isConsumptionOperation &&
    (consumptionLines.length === 0 ||
      actualUsedValues.length !== consumptionLines.length ||
      lossValues.length !== consumptionLines.length ||
      consumptionLines.some(
        (line) =>
          typeof line.requirementId !== "string" ||
          !uuidPattern.test(line.requirementId) ||
          !Number.isFinite(line.actualUsedG) ||
          !Number.isFinite(line.lossG) ||
          line.actualUsedG < 0 ||
          line.lossG < 0 ||
          (operation === "consumption" && line.actualUsedG + line.lossG <= 0) ||
          line.actualUsedG + line.lossG > 1_000_000,
      ));
  if (invalidConsumption)
    return {
      ...previous,
      status: "error",
      message: "Revise as quantidades usadas e as perdas antes de confirmar.",
    };
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const jsonHeaders = await apiRequestHeaders(true);
  const readHeaders = await apiRequestHeaders();
  try {
    const response = await fetch(
      `${apiUrl}/production/tasks/${taskId}${operation === "note" ? "/note" : operation === "consumption" ? "/consumption" : operation === "consumption_correction" ? "/consumption/corrections" : ""}`,
      {
        method: "PUT",
        cache: "no-store",
        headers: jsonHeaders,
        body: JSON.stringify(
          operation === "note"
            ? { note }
            : operation === "consumption"
              ? { lines: consumptionLines }
              : operation === "consumption_correction"
                ? { reason: correctionReason, lines: consumptionLines }
                : { action },
        ),
        signal: AbortSignal.timeout(6_000),
      },
    );
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      return {
        ...previous,
        status: "error",
        message: result.message ?? "Não foi possível atualizar o preparo.",
      };
    }
    const todayResponse = await fetch(`${apiUrl}/today`, {
      cache: "no-store",
      headers: readHeaders,
      signal: AbortSignal.timeout(6_000),
    });
    if (!todayResponse.ok) {
      return {
        ...previous,
        status: "error",
        message:
          "O preparo foi salvo, mas a bancada não conseguiu se atualizar.",
      };
    }
    return {
      status: "success",
      message: result.message ?? "Preparo atualizado.",
      today: (await todayResponse.json()) as TodayView,
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
