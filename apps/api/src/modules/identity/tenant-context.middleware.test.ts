import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { validateCognitoClaims } from "./tenant-context.middleware";

const issuer = "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example";

describe("validateCognitoClaims", () => {
  it("aceita identidade vigente emitida para o aplicativo e tenant", () => {
    const claims = validateCognitoClaims(
      {
        sub: "owner-subject",
        iss: issuer,
        exp: Math.floor(Date.now() / 1_000) + 300,
        token_use: "access",
        client_id: "client-123",
        "custom:tenant_id": "11111111-1111-4111-8111-111111111111",
      },
      issuer,
      "client-123",
    );
    expect(claims["custom:tenant_id"]).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("recusa token expirado ou destinado a outro aplicativo", () => {
    expect(() =>
      validateCognitoClaims(
        {
          sub: "owner-subject",
          iss: issuer,
          exp: Math.floor(Date.now() / 1_000) - 1,
          token_use: "access",
          client_id: "other-client",
          "custom:tenant_id": "11111111-1111-4111-8111-111111111111",
        },
        issuer,
        "client-123",
      ),
    ).toThrow(UnauthorizedException);
  });
});
