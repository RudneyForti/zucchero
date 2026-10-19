import { NextResponse, type NextRequest } from "next/server";
import {
  authReturnCookieName,
  authStateCookieName,
  authVerifierCookieName,
  cognitoConfiguration,
  pkceChallenge,
  publicOrigin,
  randomUrlSafe,
  safeReturnTo,
  secureAuthCookies,
} from "@/lib/auth";

export function GET(request: NextRequest) {
  const cognito = cognitoConfiguration();
  if (!cognito) {
    return NextResponse.redirect(
      new URL("/entrar?erro=configuracao", request.url),
    );
  }

  const origin = publicOrigin(request.nextUrl.origin);
  const state = randomUrlSafe();
  const verifier = randomUrlSafe(48);
  const authorization = new URL(`${cognito.domain}/oauth2/authorize`);
  authorization.searchParams.set("client_id", cognito.clientId);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("redirect_uri", `${origin}/auth/callback`);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("code_challenge", pkceChallenge(verifier));

  const response = NextResponse.redirect(authorization);
  const transient = {
    httpOnly: true,
    secure: secureAuthCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };
  response.cookies.set(authStateCookieName, state, transient);
  response.cookies.set(authVerifierCookieName, verifier, transient);
  response.cookies.set(
    authReturnCookieName,
    safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    transient,
  );
  return response;
}
