import { UnauthorizedException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalIdentityToken,
  createLocalMfaChallenge,
  isLocalIdentityToken,
  verifyLocalIdentityToken,
  verifyLocalMfaChallenge,
} from "./local-identity-token";

const identity = {
  sub: "local:user-1",
  tenantId: "11111111-1111-4111-8111-111111111111",
  email: "dona@doce.test",
  name: "Dona da cozinha",
};

describe("local identity token", () => {
  beforeEach(() => {
    process.env.LOCAL_AUTH_SESSION_SECRET =
      "segredo-local-de-teste-com-mais-de-trinta-e-dois-caracteres";
  });

  afterEach(() => {
    delete process.env.LOCAL_AUTH_SESSION_SECRET;
  });

  it("assina e recupera a identidade e o tenant", () => {
    const token = createLocalIdentityToken(identity, 300, 1_000_000);
    expect(isLocalIdentityToken(token)).toBe(true);
    expect(verifyLocalIdentityToken(token, 1_001_000)).toMatchObject(identity);
  });

  it("recusa alteração ou expiração", () => {
    const token = createLocalIdentityToken(identity, 1, 1_000_000);
    const tampered = `${token.slice(0, -1)}x`;
    expect(() => verifyLocalIdentityToken(tampered, 1_000_000)).toThrow(
      UnauthorizedException,
    );
    expect(() => verifyLocalIdentityToken(token, 1_002_000)).toThrow(
      UnauthorizedException,
    );
  });

  it("assina um desafio curto sem transformá-lo em sessão autenticada", () => {
    const challenge = createLocalMfaChallenge(
      {
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: identity.email,
      },
      300,
      1_000_000,
    );
    expect(challenge.startsWith("mfa.")).toBe(true);
    expect(isLocalIdentityToken(challenge)).toBe(false);
    expect(verifyLocalMfaChallenge(challenge, 1_001_000)).toMatchObject({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: identity.email,
    });
    expect(() => verifyLocalMfaChallenge(challenge, 1_301_000)).toThrow(
      UnauthorizedException,
    );
  });
});
