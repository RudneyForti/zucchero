import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { type NextRequest, NextResponse } from "next/server";
import {
  authCookieName,
  authMfaSessionCookieName,
  authMfaUsernameCookieName,
  publicOrigin,
  safeReturnTo,
  secureAuthCookies,
} from "@/lib/auth";

export function cognitoClient(region: string) {
  return new CognitoIdentityProviderClient({ region });
}

export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === publicOrigin(request.nextUrl.origin);
}

export function authJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function authenticatedResponse(
  idToken: string,
  expiresIn: number | undefined,
  returnTo: string | null,
) {
  const destination = safeReturnTo(returnTo);
  const response = authJson({ status: "authenticated", returnTo: destination });
  response.cookies.set(authCookieName, idToken, {
    httpOnly: true,
    secure: secureAuthCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, expiresIn ?? 3600),
  });
  clearMfaCookies(response);
  return response;
}

export function setMfaCookies(
  response: NextResponse,
  session: string,
  username: string,
) {
  const options = {
    httpOnly: true,
    secure: secureAuthCookies(),
    sameSite: "strict" as const,
    path: "/auth",
    maxAge: 5 * 60,
  };
  response.cookies.set(authMfaSessionCookieName, session, options);
  response.cookies.set(authMfaUsernameCookieName, username, options);
}

export function clearMfaCookies(response: NextResponse) {
  const expired = {
    httpOnly: true,
    secure: secureAuthCookies(),
    sameSite: "strict" as const,
    path: "/auth",
    maxAge: 0,
  };
  response.cookies.set(authMfaSessionCookieName, "", expired);
  response.cookies.set(authMfaUsernameCookieName, "", expired);
}

export function cognitoFailure(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";

  if (
    name === "TooManyRequestsException" ||
    name === "LimitExceededException"
  ) {
    return authJson(
      {
        code: "try-later",
        message:
          "Houve muitas tentativas. Aguarde um instante e tente novamente.",
      },
      429,
    );
  }

  if (
    name === "PasswordResetRequiredException" ||
    name === "UserNotConfirmedException"
  ) {
    return authJson(
      {
        code: "managed-login-required",
        message: "Este acesso precisa de uma confirmação antes de continuar.",
      },
      409,
    );
  }

  return authJson(
    {
      code: "invalid-credentials",
      message:
        "E-mail ou senha não conferem. Revise os dados e tente novamente.",
    },
    401,
  );
}
