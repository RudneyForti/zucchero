import { NextResponse, type NextRequest } from "next/server";
import {
  authCookieName,
  authReturnCookieName,
  authStateCookieName,
  authVerifierCookieName,
  cognitoConfiguration,
  publicOrigin,
  safeReturnTo,
  secureAuthCookies,
} from "@/lib/auth";

type TokenResponse = {
  id_token?: string;
  expires_in?: number;
  error?: string;
};

function failure(request: NextRequest, code: string) {
  const response = NextResponse.redirect(
    new URL(`/entrar?erro=${encodeURIComponent(code)}`, request.url),
  );
  response.cookies.delete(authStateCookieName);
  response.cookies.delete(authVerifierCookieName);
  response.cookies.delete(authReturnCookieName);
  return response;
}

export async function GET(request: NextRequest) {
  const cognito = cognitoConfiguration();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(authStateCookieName)?.value;
  const verifier = request.cookies.get(authVerifierCookieName)?.value;
  if (!cognito || !code || !state || state !== expectedState || !verifier) {
    return failure(request, "retorno-invalido");
  }

  const origin = publicOrigin(request.nextUrl.origin);
  const tokenResponse = await fetch(`${cognito.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cognito.clientId,
      code,
      redirect_uri: `${origin}/auth/callback`,
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!tokenResponse?.ok) return failure(request, "troca-do-token");

  const tokens = (await tokenResponse.json()) as TokenResponse;
  if (!tokens.id_token)
    return failure(request, tokens.error ?? "token-ausente");

  const returnTo = safeReturnTo(
    request.cookies.get(authReturnCookieName)?.value ?? null,
  );
  const response = NextResponse.redirect(new URL(returnTo, origin));
  response.cookies.set(authCookieName, tokens.id_token, {
    httpOnly: true,
    secure: secureAuthCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, tokens.expires_in ?? 3600),
  });
  response.cookies.delete(authStateCookieName);
  response.cookies.delete(authVerifierCookieName);
  response.cookies.delete(authReturnCookieName);
  return response;
}
