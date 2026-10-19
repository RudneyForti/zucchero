import {
  ChallengeNameType,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { NextRequest } from "next/server";
import {
  authMfaSessionCookieName,
  authMfaUsernameCookieName,
  cognitoPasswordConfiguration,
  safeReturnTo,
} from "@/lib/auth";
import {
  authenticatedResponse,
  authJson,
  cognitoClient,
  sameOrigin,
} from "@/lib/cognito-password-auth";
import {
  localAuthConfiguration,
  localAuthEnabled,
  verifyLocalMfaSession,
  verifyLocalTotp,
} from "@/lib/local-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return authJson({ message: "Origem da solicitação inválida." }, 403);
  }

  const config = cognitoPasswordConfiguration();
  const localConfig = localAuthConfiguration();
  if (!config && !localAuthEnabled()) {
    return authJson(
      { message: "O acesso protegido ainda não está configurado." },
      503,
    );
  }

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    returnTo?: unknown;
  } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const returnTo =
    typeof body?.returnTo === "string" ? safeReturnTo(body.returnTo) : "/";
  const session = request.cookies.get(authMfaSessionCookieName)?.value;
  const username = request.cookies.get(authMfaUsernameCookieName)?.value;

  if (!/^\d{6}$/.test(code)) {
    return authJson({ message: "Digite os 6 números do Authenticator." }, 400);
  }
  if (!session || !username) {
    return authJson(
      { message: "A confirmação expirou. Volte à senha e tente novamente." },
      401,
    );
  }

  if (!config) {
    if (localConfig && session.startsWith("local:")) {
      if (
        username !== localConfig.email ||
        !verifyLocalMfaSession(localConfig, session) ||
        !verifyLocalTotp(localConfig, code)
      ) {
        return authJson(
          {
            message: "Código inválido ou expirado. Confira e tente novamente.",
          },
          401,
        );
      }

      return authenticatedResponse(
        `local-development:${Date.now()}`,
        3600,
        returnTo,
      );
    }

    try {
      const apiResponse = await fetch(
        `${process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1"}/identity/local/mfa/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session, code }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      const result = (await apiResponse.json().catch(() => null)) as {
        idToken?: string;
        expiresIn?: number;
        message?: string;
      } | null;
      if (!apiResponse.ok || !result?.idToken) {
        return authJson(
          {
            message:
              result?.message ??
              "Código inválido ou expirado. Confira e tente novamente.",
          },
          apiResponse.status || 401,
        );
      }
      return authenticatedResponse(result.idToken, result.expiresIn, returnTo);
    } catch {
      return authJson(
        { message: "A bancada não respondeu agora. Tente novamente." },
        503,
      );
    }
  }

  try {
    const result = await cognitoClient(config!.region).send(
      new RespondToAuthChallengeCommand({
        ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
        ClientId: config!.clientId,
        Session: session,
        ChallengeResponses: {
          USERNAME: username,
          SOFTWARE_TOKEN_MFA_CODE: code,
        },
      }),
    );

    if (result.AuthenticationResult?.IdToken) {
      return authenticatedResponse(
        result.AuthenticationResult.IdToken,
        result.AuthenticationResult.ExpiresIn,
        returnTo,
      );
    }

    return authJson(
      { message: "O código não pôde ser confirmado. Tente novamente." },
      401,
    );
  } catch {
    return authJson(
      { message: "Código inválido ou expirado. Confira e tente novamente." },
      401,
    );
  }
}
