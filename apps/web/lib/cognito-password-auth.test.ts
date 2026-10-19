import { NextRequest } from "next/server";
import { scryptSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authCookieName,
  authMfaSessionCookieName,
  authMfaUsernameCookieName,
} from "./auth";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-cognito-identity-provider", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@aws-sdk/client-cognito-identity-provider")
    >();
  return {
    ...actual,
    CognitoIdentityProviderClient: class {
      send = sendMock;
    },
  };
});

import { POST as confirmMfa } from "@/app/auth/mfa/route";
import { POST as submitPassword } from "@/app/auth/password/route";
import { localTotpCode } from "@/lib/local-auth";

function request(path: string, body: Record<string, string>, cookie?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Cognito password + TOTP", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.AWS_REGION = "sa-east-1";
    process.env.COGNITO_CLIENT_ID = "client-id";
    process.env.WEB_PUBLIC_URL = "http://localhost";
    delete process.env.LOCAL_AUTH_ENABLED;
  });

  it("autentica sem terceiro passo quando o Cognito já retorna tokens", async () => {
    sendMock.mockResolvedValueOnce({
      AuthenticationResult: { IdToken: "id-token", ExpiresIn: 3600 },
    });

    const response = await submitPassword(
      request("/auth/password", {
        email: "stefanie@example.com",
        password: "senha-segura",
        returnTo: "/pedidos",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "authenticated",
      returnTo: "/pedidos",
    });
    expect(response.cookies.get(authCookieName)?.value).toBe("id-token");
  });

  it("preserva a sessão opaca em cookie HttpOnly quando MFA é exigido", async () => {
    sendMock.mockResolvedValueOnce({
      ChallengeName: "SOFTWARE_TOKEN_MFA",
      Session: "opaque-session",
      ChallengeParameters: { USER_ID_FOR_SRP: "canonical-user" },
    });

    const response = await submitPassword(
      request("/auth/password", {
        email: "stefanie@example.com",
        password: "senha-segura",
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      status: "mfa-required",
    });
    expect(response.cookies.get(authMfaSessionCookieName)?.value).toBe(
      "opaque-session",
    );
    expect(response.cookies.get(authMfaSessionCookieName)?.httpOnly).toBe(true);
    expect(response.cookies.get(authMfaUsernameCookieName)?.value).toBe(
      "canonical-user",
    );
  });

  it("troca código TOTP válido pelo token de identidade", async () => {
    sendMock.mockResolvedValueOnce({
      AuthenticationResult: { IdToken: "mfa-id-token", ExpiresIn: 3600 },
    });
    const cookie = [
      `${authMfaSessionCookieName}=opaque-session`,
      `${authMfaUsernameCookieName}=canonical-user`,
    ].join("; ");

    const response = await confirmMfa(
      request("/auth/mfa", { code: "123456", returnTo: "/" }, cookie),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(authCookieName)?.value).toBe("mfa-id-token");
  });
});

describe("senha + TOTP local de desenvolvimento", () => {
  beforeEach(() => {
    sendMock.mockReset();
    delete process.env.COGNITO_CLIENT_ID;
    process.env.WEB_PUBLIC_URL = "http://localhost";
    process.env.LOCAL_AUTH_ENABLED = "true";
    process.env.LOCAL_AUTH_EMAIL = "stefanie@example.invalid";
    const salt = Buffer.from("0123456789abcdef", "utf8");
    process.env.LOCAL_AUTH_PASSWORD_HASH = `scrypt:${salt.toString("hex")}:${scryptSync("senha-local-segura", salt, 32).toString("hex")}`;
    process.env.LOCAL_AUTH_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    process.env.LOCAL_AUTH_SESSION_SECRET = "session-test-secret";
  });

  it("exige e valida o Authenticator antes de criar a sessão", async () => {
    const challenge = await submitPassword(
      request("/auth/password", {
        email: "stefanie@example.invalid",
        password: "senha-local-segura",
      }),
    );
    expect(challenge.status).toBe(200);
    await expect(challenge.json()).resolves.toMatchObject({
      status: "mfa-required",
    });

    const session = challenge.cookies.get(authMfaSessionCookieName)?.value;
    const username = challenge.cookies.get(authMfaUsernameCookieName)?.value;
    const cookie = [
      `${authMfaSessionCookieName}=${session}`,
      `${authMfaUsernameCookieName}=${username}`,
    ].join("; ");
    const response = await confirmMfa(
      request(
        "/auth/mfa",
        { code: localTotpCode(process.env.LOCAL_AUTH_TOTP_SECRET!) },
        cookie,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(authCookieName)?.value).toMatch(
      /^local-development:/,
    );
  });
});
