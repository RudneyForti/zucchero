import { NextResponse, type NextRequest } from "next/server";
import { authCookieName, authRequired } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (!authRequired() || request.cookies.has(authCookieName)) {
    return NextResponse.next();
  }

  const login = new URL("/entrar", request.url);
  login.searchParams.set(
    "returnTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!auth|entrar|address/postal-code|offline.html|sw.js|manifest.webmanifest|brand-logo.png|zucchero-logo.svg|zucchero-mark.svg|_next/static|_next/image|favicon.ico).*)",
  ],
};
