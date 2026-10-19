import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST as confirmSignup } from "@/app/auth/signup/confirm/route";
import { POST as createSignup } from "@/app/auth/signup/route";
import { validNewPassword } from "@/lib/cognito-signup";

function request(path: string, body: Record<string, string>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("criação de conta Cognito", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.AWS_REGION = "sa-east-1";
    process.env.COGNITO_CLIENT_ID = "client-id";
    process.env.WEB_PUBLIC_URL = "http://localhost";
  });

  it("exige uma senha compatível com a política do User Pool", () => {
    expect(validNewPassword("curta")).toBe(false);
    expect(validNewPassword("DoceSeguro#42")).toBe(true);
  });

  it("cria a identidade com um tenant próprio e pede confirmação", async () => {
    sendMock.mockResolvedValueOnce({
      UserConfirmed: false,
      CodeDeliveryDetails: { Destination: "s***@example.com" },
    });

    const response = await createSignup(
      request("/auth/signup", {
        ownerName: "Silvia Andrade",
        tenantName: "Doçuras da Silvia",
        email: "silvia@example.com",
        password: "DoceSeguro#42",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "verification-required",
      destination: "s***@example.com",
    });
    const attributes = sendMock.mock.calls[0]?.[0].input.UserAttributes;
    expect(attributes).toEqual(
      expect.arrayContaining([
        { Name: "email", Value: "silvia@example.com" },
        { Name: "name", Value: "Silvia Andrade" },
        { Name: "custom:tenant_name", Value: "Doçuras da Silvia" },
        expect.objectContaining({ Name: "custom:tenant_id" }),
      ]),
    );
  });

  it("confirma a conta usando o código recebido por e-mail", async () => {
    sendMock.mockResolvedValueOnce({});
    const response = await confirmSignup(
      request("/auth/signup/confirm", {
        email: "silvia@example.com",
        code: "123456",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "confirmed" });
  });
});
