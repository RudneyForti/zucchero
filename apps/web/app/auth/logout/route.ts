import { NextResponse, type NextRequest } from "next/server";
import { authCookieName, cognitoConfiguration, publicOrigin } from "@/lib/auth";

export function GET(request: NextRequest) {
  const origin = publicOrigin(request.nextUrl.origin);
  const cognito = cognitoConfiguration();
  const destination = cognito
    ? `${cognito.domain}/logout?${new URLSearchParams({
        client_id: cognito.clientId,
        logout_uri: `${origin}/entrar`,
      })}`
    : `${origin}/entrar`;
  const response = NextResponse.redirect(destination);
  response.cookies.delete(authCookieName);
  return response;
}
