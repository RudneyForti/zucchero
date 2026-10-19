import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/cognito-password-auth";
import { apiRequestHeaders } from "@/lib/server-api";

export const runtime = "nodejs";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function proxy(
  request: NextRequest,
  endpoint: string,
  method: "POST" | "DELETE",
  body?: Record<string, unknown>,
) {
  if (!sameOrigin(request)) {
    return response({ message: "Origem da solicitação inválida." }, 403);
  }
  try {
    const upstream = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1"}/settings/profile/mfa/${endpoint}`.replace(
        /\/$/,
        "",
      ),
      {
        method,
        headers: await apiRequestHeaders(true),
        body: JSON.stringify(body ?? {}),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    const result = await upstream.json().catch(() => ({
      message: "Não foi possível concluir esta configuração.",
    }));
    return response(result, upstream.status);
  } catch {
    return response(
      { message: "A bancada não respondeu agora. Tente novamente." },
      503,
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    code?: unknown;
  } | null;
  if (body?.action === "setup") {
    return proxy(request, "setup", "POST");
  }
  if (body?.action === "confirm") {
    return proxy(request, "confirm", "POST", { code: body.code });
  }
  return response({ message: "Configuração não reconhecida." }, 400);
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
    code?: unknown;
  } | null;
  return proxy(request, "", "DELETE", {
    password: body?.password,
    code: body?.code,
  });
}
