import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/lib/cognito-password-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1"}/identity/local/invitations/inspect?token=${encodeURIComponent(token)}`,
      { cache: "no-store", signal: AbortSignal.timeout(5_000) },
    );
    const body = await response.json().catch(() => ({
      message: "Não foi possível ler este convite.",
    }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "A bancada não respondeu agora." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1"}/identity/local/invitations/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    const result = await response.json().catch(() => ({
      message: "Não foi possível aceitar este convite.",
    }));
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "A bancada não respondeu agora." },
      { status: 503 },
    );
  }
}
