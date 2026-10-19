import { ResendConfirmationCodeCommand } from "@aws-sdk/client-cognito-identity-provider";
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
  } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return authJson({ message: "Informe o e-mail da conta." }, 400);

  try {
    const result = await cognitoClient(config.region).send(
      new ResendConfirmationCodeCommand({
        ClientId: config.clientId,
        Username: email,
      }),
    );
    return authJson({
      status: "resent",
      destination: result.CodeDeliveryDetails?.Destination,
    });
  } catch (error) {
    return signupFailure(error);
  }
}
