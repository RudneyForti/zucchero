import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createLocalMfaSession,
  localTotpCode,
  verifyLocalMfaSession,
  verifyLocalPassword,
  verifyLocalTotp,
  type LocalAuthConfiguration,
} from "./local-auth";

const salt = Buffer.from("0123456789abcdef", "utf8");
const password = "senha-local-segura";
const passwordHash = `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
const config: LocalAuthConfiguration = {
  email: "stefanie@example.invalid",
  passwordHash,
  totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  sessionSecret: "session-test-secret",
};

describe("autenticação local de desenvolvimento", () => {
  it("valida e-mail e senha com scrypt sem armazenar a senha", () => {
    expect(
      verifyLocalPassword(config, "stefanie@example.invalid", password),
    ).toBe(true);
    expect(verifyLocalPassword(config, config.email, "senha-errada")).toBe(
      false,
    );
  });

  it("assina o desafio temporário e rejeita sessões expiradas", () => {
    const issuedAt = 1_700_000_000_000;
    const session = createLocalMfaSession(config, issuedAt);
    expect(verifyLocalMfaSession(config, session, issuedAt + 60_000)).toBe(
      true,
    );
    expect(verifyLocalMfaSession(config, session, issuedAt + 301_000)).toBe(
      false,
    );
  });

  it("valida TOTP compatível com aplicativos Authenticator", () => {
    const instant = 59_000;
    expect(localTotpCode(config.totpSecret, instant)).toBe("287082");
    expect(verifyLocalTotp(config, "287082", instant)).toBe(true);
    expect(verifyLocalTotp(config, "000000", instant)).toBe(false);
  });
});
