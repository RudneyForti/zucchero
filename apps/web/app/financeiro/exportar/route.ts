import { NextResponse } from "next/server";
import { apiRequestHeaders } from "@/lib/server-api";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? "";
  if (!monthPattern.test(month)) {
    return NextResponse.json(
      { message: "Informe o mês no formato AAAA-MM." },
      { status: 400 },
    );
  }
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = await apiRequestHeaders();
  try {
    const response = await fetch(`${apiUrl}/finance/export?month=${month}`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { message: "Não foi possível preparar o arquivo." },
        { status: response.status },
      );
    }
    return new Response(await response.text(), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="financeiro-${month}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "A cozinha não respondeu. Tente novamente." },
      { status: 503 },
    );
  }
}
