"use server";

import { cookies } from "next/headers";
import { authCookieName } from "@/lib/auth";
import { apiRequestHeaders } from "@/lib/server-api";
import type { SettingsWorkspace } from "@/lib/settings";

export type TeamActionState = {
  status: "idle" | "success" | "error";
  operation: "invite" | "update" | "remove" | "revoke" | null;
  message: string;
  workspace: SettingsWorkspace;
  invitePath: string | null;
  notificationId: number | null;
};

export type DeleteAccountState = {
  status: "idle" | "success" | "error";
  message: string;
  deleted: boolean;
};

async function responseBody(response: Response) {
  return (await response.json().catch(() => null)) as {
    message?: string | string[];
    workspace?: SettingsWorkspace;
    token?: string;
  } | null;
}

function messageOf(
  body: Awaited<ReturnType<typeof responseBody>>,
  fallback: string,
) {
  return Array.isArray(body?.message)
    ? (body.message[0] ?? fallback)
    : (body?.message ?? fallback);
}

export async function mutateTeamAction(
  previous: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const operation = String(
    formData.get("operation"),
  ) as TeamActionState["operation"];
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  let endpoint = "";
  let method = "POST";
  let body: Record<string, unknown> | undefined;

  if (operation === "invite") {
    endpoint = "settings/people/invitations";
    body = {
      email: String(formData.get("email") ?? "")
        .trim()
        .toLowerCase(),
      operationalAccess: formData.get("operationalAccess") === "on",
      financialAccess: formData.get("financialAccess") === "on",
    };
  } else if (operation === "update") {
    const userId = String(formData.get("userId") ?? "");
    endpoint = `settings/people/${encodeURIComponent(userId)}/access`;
    method = "PUT";
    body = {
      operationalAccess: formData.get("operationalAccess") === "on",
      financialAccess: formData.get("financialAccess") === "on",
    };
  } else if (operation === "remove") {
    const userId = String(formData.get("userId") ?? "");
    endpoint = `settings/people/${encodeURIComponent(userId)}`;
    method = "DELETE";
  } else if (operation === "revoke") {
    const invitationId = String(formData.get("invitationId") ?? "");
    endpoint = `settings/people/invitations/${encodeURIComponent(invitationId)}`;
    method = "DELETE";
  } else {
    return { ...previous, status: "error", message: "Ação não reconhecida." };
  }

  try {
    const response = await fetch(`${apiUrl}/${endpoint}`, {
      method,
      cache: "no-store",
      headers: await apiRequestHeaders(Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    const result = await responseBody(response);
    if (!response.ok) {
      return {
        ...previous,
        status: "error",
        operation,
        message: messageOf(result, "Não foi possível concluir esta ação."),
        invitePath: null,
      };
    }

    const workspace = result?.workspace ?? previous.workspace;
    const token = result?.token;
    return {
      status: "success",
      operation,
      message: messageOf(result, "Alteração concluída."),
      workspace,
      invitePath: token ? `/entrar?convite=${encodeURIComponent(token)}` : null,
      notificationId: Date.now(),
    };
  } catch {
    return {
      ...previous,
      status: "error",
      operation,
      message: "A cozinha não respondeu. Tente novamente em instantes.",
      invitePath: null,
    };
  }
}

export async function deleteOwnAccountAction(
  _previous: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  try {
    const response = await fetch(`${apiUrl}/settings/profile`, {
      method: "DELETE",
      cache: "no-store",
      headers: await apiRequestHeaders(true),
      body: JSON.stringify({
        password: String(formData.get("password") ?? ""),
        tenantName: String(formData.get("tenantName") ?? "").trim(),
        irreversibleConfirmation:
          formData.get("irreversibleConfirmation") === "on",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const result = await responseBody(response);
    if (!response.ok) {
      return {
        status: "error",
        message: messageOf(result, "Não foi possível excluir a conta."),
        deleted: false,
      };
    }
    (await cookies()).delete(authCookieName);
    return {
      status: "success",
      message: messageOf(result, "Conta excluída."),
      deleted: true,
    };
  } catch {
    return {
      status: "error",
      message: "A cozinha não respondeu. Nada foi excluído.",
      deleted: false,
    };
  }
}
