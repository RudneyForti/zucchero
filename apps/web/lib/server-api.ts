import "server-only";

import { cookies } from "next/headers";
import { authCookieName, authRequired } from "@/lib/auth";

export async function apiRequestHeaders(json = false): Promise<HeadersInit> {
  const headers = new Headers();
  if (json) headers.set("content-type", "application/json");

  const token = (await cookies()).get(authCookieName)?.value;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (!authRequired() || process.env.LOCAL_AUTH_ENABLED === "true") {
    headers.set(
      "x-demo-tenant-id",
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
    );
  }

  return headers;
}
