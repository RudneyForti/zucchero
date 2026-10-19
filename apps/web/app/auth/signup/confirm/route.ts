import { ConfirmSignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import type { NextRequest } from "next/server";
import { cognitoPasswordConfiguration } from "@/lib/auth";
import {
  authJson,
  cognitoClient,
  sameOrigin,
} from "@/lib/cognito-password-auth";
import { signupFailure } from "@/lib/cognito-signup";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return authJson({ message: "Origem da solicitação inválida." }, 403);
  }
  const config = cognitoPasswordConfiguration();
  if (!config) {
    return authJson(
      { message: "A criação de contas não está disponível." },
      503,
    );
  }
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    code?: unknown;
  } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) {
    return authJson(
      { message: "Digite os 6 números enviados por e-mail." },
      400,
    );
  }

  try {
    await cognitoClient(config.region).send(
      new ConfirmSignUpCommand({
        ClientId: config.clientId,
        Username: email,
        ConfirmationCode: code,
      }),
    );
    return authJson({ status: "confirmed" });
  } catch (error) {
    return signupFailure(error);
  }
}
