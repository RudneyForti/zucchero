"use server";

import type { RecipeImportPreview, RecipeWorkspace } from "@/lib/recipes";
import { apiRequestHeaders } from "@/lib/server-api";

export type RecipeActionState = {
  status: "idle" | "success" | "error";
  message: string;
  workspace: RecipeWorkspace;
  notificationId: number | null;
};

export type RecipeImportPreviewState = {
  status: "idle" | "success" | "error";
  message: string;
  preview: RecipeImportPreview | null;
};

export type RecipeImportActionState = {
  status: "idle" | "success" | "error";
  message: string;
  workspace: RecipeWorkspace;
  notificationId: number | null;
};

async function recipeImportRequest(
  endpoint: string,
  url: string,
  name?: string,
) {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);
  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({ url, name: name?.trim() || undefined }),
    signal: AbortSignal.timeout(210_000),
  });
  const result = (await response.json()) as {
    message?: string | string[];
    workspace?: RecipeWorkspace;
  };
  return { response, result };
}

export async function previewRecipeImportAction(
  previous: RecipeImportPreviewState,
  formData: FormData,
): Promise<RecipeImportPreviewState> {
  const url = formData.get("recipeSourceUrl");
  if (typeof url !== "string" || !url.trim()) {
    return {
      status: "error",
      message: "Cole o endereço completo da receita.",
      preview: null,
    };
  }
  try {
    const { response, result } = await recipeImportRequest(
      "/recipes/import/preview",
      url,
    );
    if (!response.ok) {
      return {
        status: "error",
        message: Array.isArray(result.message)
          ? result.message.join(" ")
          : (result.message ?? "Não foi possível interpretar esta página."),
        preview: null,
      };
    }
    return {
      status: "success",
      message: "Prévia pronta para revisão.",
      preview: result as unknown as RecipeImportPreview,
    };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A página demorou demais ou não pôde ser acessada.",
      preview: null,
    };
  }
}

export async function confirmRecipeImportAction(
  previous: RecipeImportActionState,
  formData: FormData,
): Promise<RecipeImportActionState> {
  const url = formData.get("recipeSourceUrl");
  const name = formData.get("recipeImportName");
  if (typeof url !== "string" || !url.trim()) {
    return {
      ...previous,
      status: "error",
      message: "A fonte se perdeu. Analise o link novamente.",
    };
  }
  try {
    const { response, result } = await recipeImportRequest(
      "/recipes/import",
      url,
      typeof name === "string" ? name : undefined,
    );
    if (!response.ok || !result.workspace) {
      return {
        ...previous,
        status: "error",
        message: Array.isArray(result.message)
          ? result.message.join(" ")
          : (result.message ?? "Não foi possível abrir a receita para edição."),
      };
    }
    return {
      status: "success",
      message: Array.isArray(result.message)
        ? result.message.join(" ")
        : (result.message ?? "Receita importada e aberta para edição."),
      workspace: result.workspace,
      notificationId: Date.now(),
    };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "A cozinha não respondeu durante a importação.",
    };
  }
}

export async function createRecipeAction(
  previous: RecipeActionState,
  formData: FormData,
): Promise<RecipeActionState> {
  const rawPayload = formData.get("recipePayload");
  if (typeof rawPayload !== "string") {
    return {
      ...previous,
      status: "error",
      message: "A receita está incompleta.",
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Não foi possível ler a receita.",
    };
  }

  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders(true);

  try {
    const operation = formData.get("recipeOperation");
    const recipeId = formData.get("recipeId");
    const isExistingRecipe =
      typeof recipeId === "string" && recipeId.length > 0;
    const endpointFor = (baseUrl: string) =>
      operation === "new-version" && isExistingRecipe
        ? `${baseUrl}/recipes/${recipeId}/versions`
        : operation === "edit-draft" && isExistingRecipe
          ? `${baseUrl}/recipes/${recipeId}/draft`
          : `${baseUrl}/recipes`;
    const request = (baseUrl: string) =>
      fetch(endpointFor(baseUrl), {
        method: operation === "edit-draft" ? "PUT" : "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4_000),
      });
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
      workspace?: RecipeWorkspace;
    };
    if (!response.ok || !result.workspace) {
      return {
        ...previous,
        status: "error",
        message: result.message ?? "Não foi possível salvar a receita.",
      };
    }
    return {
      status: "success",
      message: result.message ?? "Receita salva.",
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
