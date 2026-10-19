import { SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { cognitoPasswordConfiguration } from "@/lib/auth";
import {
  authJson,
  cognitoClient,
  sameOrigin,
} from "@/lib/cognito-password-auth";
import { signupFailure, validNewPassword } from "@/lib/cognito-signup";
import { localAuthEnabled } from "@/lib/local-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return authJson({ message: "Origem da solicitação inválida." }, 403);
  }

  const body = (await request.json().catch(() => null)) as {
    ownerName?: unknown;
    tenantName?: unknown;
    email?: unknown;
    password?: unknown;
    logoDataUrl?: unknown;
    addressLine?: unknown;
    addressNumber?: unknown;
    addressComplement?: unknown;
    neighborhood?: unknown;
    city?: unknown;
    state?: unknown;
    postalCode?: unknown;
    isCommercialPoint?: unknown;
  } | null;
  const ownerName =
    typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  const tenantName =
    typeof body?.tenantName === "string" ? body.tenantName.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const logoDataUrl =
    typeof body?.logoDataUrl === "string" ? body.logoDataUrl : null;
  const addressLine =
    typeof body?.addressLine === "string" ? body.addressLine.trim() : null;
  const addressNumber =
    typeof body?.addressNumber === "string" ? body.addressNumber.trim() : null;
  const addressComplement =
    typeof body?.addressComplement === "string"
      ? body.addressComplement.trim()
      : null;
  const neighborhood =
    typeof body?.neighborhood === "string" ? body.neighborhood.trim() : null;
  const city = typeof body?.city === "string" ? body.city.trim() : null;
  const state =
    typeof body?.state === "string" ? body.state.trim().toUpperCase() : null;
  const postalCode =
    typeof body?.postalCode === "string" ? body.postalCode.trim() : null;
  const isCommercialPoint = body?.isCommercialPoint === true;

  if (
    ownerName.length < 2 ||
    ownerName.length > 100 ||
    tenantName.length < 2 ||
    tenantName.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return authJson(
      { message: "Revise seu nome, o nome da confeitaria e o e-mail." },
      400,
    );
  }
  if (!validNewPassword(password)) {
    return authJson(
      {
        message:
          "A senha precisa ter ao menos 8 caracteres, com maiúscula, minúscula, número e símbolo.",
      },
      400,
    );
  }

  const config = cognitoPasswordConfiguration();
  if (!config && localAuthEnabled()) {
    try {
      const response = await fetch(
        `${process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1"}/identity/local/signup`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ownerName,
            tenantName,
            email,
            password,
            logoDataUrl,
            addressLine,
            addressNumber,
            addressComplement,
            neighborhood,
            city,
            state,
            postalCode,
            isCommercialPoint,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        status?: string;
        message?: string;
      } | null;
      return authJson(
        response.ok
          ? { status: result?.status ?? "account-created" }
          : {
              code: "signup-failed",
              message:
                result?.message ??
                "Não foi possível criar a conta agora. Tente novamente.",
            },
        response.status,
      );
    } catch {
      return authJson(
        {
          code: "signup-unavailable",
          message:
            "A bancada não respondeu agora. Tente novamente em instantes.",
        },
        503,
      );
    }
  }
  if (!config) {
    return authJson(
      {
        code: "signup-unavailable",
        message: "A criação de contas ainda não está disponível.",
      },
      503,
    );
  }

  try {
    const result = await cognitoClient(config.region).send(
      new SignUpCommand({
        ClientId: config.clientId,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "name", Value: ownerName },
          { Name: "custom:tenant_id", Value: randomUUID() },
          { Name: "custom:tenant_name", Value: tenantName },
        ],
      }),
    );

    return authJson({
      status: result.UserConfirmed
        ? "account-created"
        : "verification-required",
      destination: result.CodeDeliveryDetails?.Destination,
    });
  } catch (error) {
    return signupFailure(error);
  }
}
