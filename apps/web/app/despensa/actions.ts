"use server";

import { apiRequestHeaders } from "@/lib/server-api";

import type { DuplicateCandidate, PantryView } from "@/lib/pantry";
import type {
  FiscalDocumentView,
  FiscalImportActionState,
} from "@/lib/fiscal-import";

export type PurchaseActionState = {
  status: "idle" | "success" | "error" | "duplicate";
  message: string;
  pantry: PantryView;
  candidates: DuplicateCandidate[];
  notificationId: number | null;
};

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(formData: FormData, name: string) {
  const value = Number(textValue(formData, name).replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function positiveInteger(formData: FormData, name: string) {
  const value = positiveNumber(formData, name);
  return value !== null && Number.isInteger(value) ? value : null;
}

export async function registerPurchaseAction(
  previous: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const resolvedItemId = textValue(formData, "resolvedItemId");
  const selectedItemId = textValue(formData, "commercialItemId");
  const commercialItemId = resolvedItemId || selectedItemId;
  const isNewItem = commercialItemId === "__new__" || !commercialItemId;
  const quantityPackages = positiveInteger(formData, "quantityPackages");
  const totalCost = positiveNumber(formData, "totalCost");
  const entryDate = textValue(formData, "entryDate");
  const expiryDate = textValue(formData, "expiryDate");

  if (
    !quantityPackages ||
    totalCost === null ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)
  ) {
    return {
      ...previous,
      status: "error",
      message: "Revise quantidade, custo e data de entrada.",
      candidates: [],
    };
  }
  if (expiryDate && expiryDate < entryDate) {
    return {
      ...previous,
      status: "error",
      message: "A validade não pode ser anterior à entrada.",
      candidates: [],
    };
  }

  const payload = {
    commercialItemId: isNewItem ? undefined : commercialItemId,
    newItem: isNewItem
      ? {
          groupName: textValue(formData, "groupName"),
          categoryId: textValue(formData, "categoryId"),
          baseDimension: "mass" as const,
          perishable: formData.get("perishable") === "on",
          brandName: textValue(formData, "brandName") || undefined,
          displayName: textValue(formData, "displayName"),
          gtin: textValue(formData, "gtin") || undefined,
          packageUnit: textValue(formData, "packageUnit") || "g",
          netContentBase: positiveNumber(formData, "netContentBase"),
        }
      : undefined,
    quantityPackages,
    totalCost,
    entryDate,
    expiryDate: expiryDate || undefined,
    supplierName: textValue(formData, "supplierName") || undefined,
    lotCode: textValue(formData, "lotCode") || undefined,
    forceCreate: textValue(formData, "forceCreate") === "true",
  };

  if (
    payload.newItem &&
    (!payload.newItem.groupName ||
      !payload.newItem.categoryId ||
      !payload.newItem.displayName ||
      !payload.newItem.netContentBase)
  ) {
    return {
      ...previous,
      status: "error",
      message:
        "Complete o ingrediente da receita, o produto comprado e o conteúdo da embalagem.",
      candidates: [],
    };
  }

  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);

  try {
    const response = await fetch(`${apiUrl}/pantry/purchases`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4_000),
    });
    const result = (await response.json()) as {
      message?: string;
      pantry?: PantryView;
      code?: string;
      candidates?: DuplicateCandidate[];
    };

    if (response.status === 409 && result.code === "POSSIBLE_DUPLICATE") {
      return {
        ...previous,
        status: "duplicate",
        message:
          result.message ?? "Encontramos um produto comprado semelhante.",
        candidates: result.candidates ?? [],
      };
    }
    if (!response.ok || !result.pantry) {
      return {
        ...previous,
        status: "error",
        message: result.message ?? "Não foi possível registrar a compra.",
        candidates: [],
      };
    }

    return {
      status: "success",
      message: result.message ?? "Compra registrada na despensa.",
      pantry: result.pantry,
      candidates: [],
      notificationId: Date.now(),
    };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A despensa não respondeu. Tente novamente em instantes.",
      candidates: [],
    };
  }
}

export type CategoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
  pantry: PantryView;
  notificationId: number | null;
  createdCategoryId: string | null;
  requestKey: string | null;
};

export async function createCategoryAction(
  previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const name = textValue(formData, "categoryName");
  const kind = textValue(formData, "categoryKind");
  const requestKey = textValue(formData, "categoryRequestKey") || null;
  if (!name || !["ingredient", "packaging", "operational"].includes(kind)) {
    return {
      ...previous,
      status: "error",
      message: "Informe o nome e o tipo da categoria.",
      requestKey,
    };
  }
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  try {
    const response = await fetch(`${apiUrl}/pantry/categories`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify({ name, kind }),
      signal: AbortSignal.timeout(4_000),
    });
    const result = (await response.json()) as {
      categoryId?: string;
      message?: string;
      pantry?: PantryView;
    };
    if (!response.ok || !result.pantry)
      return {
        ...previous,
        status: "error",
        message: result.message ?? "Não foi possível criar a categoria.",
        requestKey,
      };
    return {
      status: "success",
      message: result.message ?? "Categoria criada.",
      pantry: result.pantry,
      notificationId: Date.now(),
      createdCategoryId: result.categoryId ?? null,
      requestKey,
    };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A despensa não respondeu. Tente novamente.",
      requestKey,
    };
  }
}

export type StockActionState = {
  status: "idle" | "success" | "error";
  operation: "inventory" | "loss" | null;
  message: string;
  pantry: PantryView;
  notificationId: number | null;
  commandKey: string | null;
};

export async function mutateStockAction(
  previous: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const operation = textValue(formData, "operation") as "inventory" | "loss";
  const lotId = textValue(formData, "lotId");
  const idempotencyKey = textValue(formData, "idempotencyKey");
  const quantity = Number(
    textValue(formData, "quantityBase").replace(",", "."),
  );
  const reason = textValue(formData, "reason");
  const note = textValue(formData, "note");

  if (
    !["inventory", "loss"].includes(operation) ||
    !/^[0-9a-f-]{36}$/i.test(lotId) ||
    !/^[0-9a-f-]{36}$/i.test(idempotencyKey) ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    (operation === "loss" && quantity === 0) ||
    !reason ||
    (operation === "inventory" && note.length < 3) ||
    (operation === "loss" && reason === "other" && note.length < 3)
  ) {
    return {
      ...previous,
      status: "error",
      operation,
      message: "Revise a quantidade e explique brevemente esta alteração.",
      commandKey: idempotencyKey || null,
    };
  }

  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  const endpoint =
    operation === "inventory"
      ? `${apiUrl}/pantry/lots/${lotId}/inventory-counts`
      : `${apiUrl}/pantry/lots/${lotId}/losses`;
  const body =
    operation === "inventory"
      ? { idempotencyKey, countedQuantityBase: quantity, reason, note }
      : {
          idempotencyKey,
          quantityBase: quantity,
          reason,
          note: note || undefined,
        };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4_000),
    });
    const result = (await response.json()) as {
      message?: string;
      pantry?: PantryView;
    };
    if (!response.ok || !result.pantry) {
      return {
        ...previous,
        status: "error",
        operation,
        message: result.message ?? "Não foi possível atualizar este lote.",
        commandKey: idempotencyKey,
      };
    }
    return {
      status: "success",
      operation,
      message:
        result.message ??
        (operation === "inventory"
          ? "Contagem registrada."
          : "Perda registrada."),
      pantry: result.pantry,
      notificationId: Date.now(),
      commandKey: idempotencyKey,
    };
  } catch {
    return {
      ...previous,
      status: "error",
      operation,
      message: "A despensa não respondeu. Tente novamente em instantes.",
      commandKey: idempotencyKey,
    };
  }
}

export async function fiscalImportAction(
  previous: FiscalImportActionState,
  formData: FormData,
): Promise<FiscalImportActionState> {
  const operation = textValue(formData, "operation");
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const jsonHeaders = await apiRequestHeaders(true);
  const readHeaders = await apiRequestHeaders();

  try {
    if (operation === "capture") {
      const source = textValue(formData, "source");
      const receiptText = textValue(formData, "receiptText");
      if (!source || !receiptText) {
        return {
          ...previous,
          status: "error",
          message:
            "Cole o endereço ou a chave da NFC-e e os itens mostrados na nota.",
        };
      }
      const response = await fetch(`${apiUrl}/fiscal-documents/capture`, {
        method: "POST",
        cache: "no-store",
        headers: jsonHeaders,
        body: JSON.stringify({ source, receiptText }),
        signal: AbortSignal.timeout(8_000),
      });
      const result = (await response.json()) as FiscalDocumentView & {
        message?: string;
      };
      if (!response.ok) {
        return {
          ...previous,
          status: "error",
          message: result.message ?? "Não foi possível ler esta NFC-e.",
        };
      }
      if (result.status === "confirmed") {
        return {
          ...previous,
          status: "error",
          message: "Esta NFC-e já foi confirmada e não será lançada novamente.",
          document: result,
        };
      }
      if (result.lines.length === 0) {
        return {
          ...previous,
          status: "error",
          message:
            "A chave foi reconhecida, mas nenhum item pôde ser lido. Cole as linhas exibidas na nota e tente novamente.",
          document: null,
        };
      }
      return {
        ...previous,
        status: "review",
        message: result.repeated
          ? "Esta captura já estava em revisão. Retomamos de onde parou."
          : "Itens lidos. Confira as associações e as validades.",
        document: result,
      };
    }

    if (operation === "confirm") {
      const documentId = textValue(formData, "documentId");
      const idempotencyKey = textValue(formData, "idempotencyKey");
      const entryDate = textValue(formData, "entryDate");
      const supplierName = textValue(formData, "supplierName");
      const lineIds = formData
        .getAll("lineId")
        .filter((value): value is string => typeof value === "string");
      const lines = lineIds.map((lineId) => ({
        lineId,
        commercialItemId: textValue(formData, `item:${lineId}`),
        expiryDate: textValue(formData, `expiry:${lineId}`) || undefined,
        lotCode: textValue(formData, `lot:${lineId}`) || undefined,
      }));
      if (
        !documentId ||
        !idempotencyKey ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) ||
        lines.length === 0 ||
        lines.some((line) => !line.commercialItemId)
      ) {
        return {
          ...previous,
          status: "error",
          message:
            "Associe cada linha a um produto e revise a data de entrada.",
        };
      }
      const response = await fetch(
        `${apiUrl}/fiscal-documents/${documentId}/confirm`,
        {
          method: "POST",
          cache: "no-store",
          headers: jsonHeaders,
          body: JSON.stringify({
            idempotencyKey,
            entryDate,
            supplierName: supplierName || undefined,
            lines,
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        return {
          ...previous,
          status: "error",
          message: result.message ?? "Não foi possível confirmar esta NFC-e.",
        };
      }
      const pantryResponse = await fetch(`${apiUrl}/pantry`, {
        cache: "no-store",
        headers: readHeaders,
        signal: AbortSignal.timeout(4_000),
      });
      const pantry = pantryResponse.ok
        ? ((await pantryResponse.json()) as PantryView)
        : previous.pantry;
      return {
        status: "success",
        message: result.message ?? "NFC-e conferida e guardada na despensa.",
        document: null,
        pantry,
        notificationId: Date.now(),
      };
    }

    return { ...previous, status: "error", message: "Operação desconhecida." };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A leitura da NFC-e não respondeu. Tente novamente.",
    };
  }
}
