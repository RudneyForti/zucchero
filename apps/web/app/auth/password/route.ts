import {
  ChallengeNameType,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { NextRequest } from "next/server";
import { cognitoPasswordConfiguration, safeReturnTo } from "@/lib/auth";
import {
  authenticatedResponse,
  authJson,
  cognitoClient,
  cognitoFailure,
  sameOrigin,
  setMfaCookies,
} from "@/lib/cognito-password-auth";
import {
  createLocalMfaSession,
  localAuthConfiguration,
  localAuthEnabled,
  verifyLocalPassword,
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
    email?: unknown;
    password?: unknown;
    returnTo?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const returnTo =
    typeof body?.returnTo === "string" ? safeReturnTo(body.returnTo) : "/";

  if (!email || email.length > 254 || !password || password.length > 256) {
    return authJson(
      { message: "Preencha o e-mail e a senha para continuar." },
      400,
    );
  }

  if (!config) {
    if (localConfig && email.toLowerCase() === localConfig.email) {
      if (!verifyLocalPassword(localConfig, email, password)) {
        return cognitoFailure(null);
      }
      const response = authJson({ status: "mfa-required" });
      setMfaCookies(
        response,
        createLocalMfaSession(localConfig),
        localConfig.email,
      );
      return response;
    }
    try {
      const apiResponse = await fetch(
        `${process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1"}/identity/local/login`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      const result = (await apiResponse.json().catch(() => null)) as {
        status?: "authenticated" | "mfa-required";
        idToken?: string;
        mfaSession?: string;
        expiresIn?: number;
        message?: string;
      } | null;
      if (
        apiResponse.ok &&
        result?.status === "mfa-required" &&
        result.mfaSession
      ) {
        const response = authJson({ status: "mfa-required" });
        setMfaCookies(response, result.mfaSession, email.toLowerCase());
        return response;
      }
      if (!apiResponse.ok || !result?.idToken) {
        return authJson(
          {
            code: "invalid-credentials",
            message:
              result?.message ??
              "E-mail ou senha não conferem. Revise os dados e tente novamente.",
          },
          apiResponse.status || 401,
        );
      }
      return authenticatedResponse(result.idToken, result.expiresIn, returnTo);
    } catch {
      return authJson(
        {
          code: "login-unavailable",
          message:
            "A bancada não respondeu agora. Tente novamente em instantes.",
        },
        503,
      );
    }
  }

  try {
    const result = await cognitoClient(config!.region).send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: config!.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    );

    if (result.AuthenticationResult?.IdToken) {
      return authenticatedResponse(
        result.AuthenticationResult.IdToken,
        result.AuthenticationResult.ExpiresIn,
        returnTo,
      );
    }

    if (
      result.ChallengeName === ChallengeNameType.SOFTWARE_TOKEN_MFA &&
      result.Session
    ) {
      const response = authJson({ status: "mfa-required" });
      setMfaCookies(
        response,
        result.Session,
        result.ChallengeParameters?.USER_ID_FOR_SRP ?? email,
      );
      return response;
    }

    if (
      result.ChallengeName === ChallengeNameType.MFA_SETUP ||
      result.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED
    ) {
      return authJson(
        {
          code: "managed-login-required",
          message:
            "Este acesso precisa concluir uma configuração antes de entrar.",
        },
        409,
      );
    }

    return authJson(
      { message: "O provedor pediu uma confirmação ainda não suportada." },
      409,
    );
  } catch (error) {
    return cognitoFailure(error);
  }
}
