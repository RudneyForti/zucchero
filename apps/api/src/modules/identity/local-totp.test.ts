import { describe, expect, it } from "vitest";
import {
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  totpCode,
  totpProvisioningUri,
  verifyTotp,
} from "./local-totp";

describe("local authenticator TOTP", () => {
  it("gera e valida códigos compatíveis com RFC 6238", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const instant = 59_000;
    expect(totpCode(secret, instant)).toBe("287082");
    expect(verifyTotp(secret, "287082", instant)).toBe(true);
    expect(verifyTotp(secret, "000000", instant)).toBe(false);
  });

  it("protege o segredo antes de persistir", () => {
    process.env.LOCAL_MFA_ENCRYPTION_KEY =
      "mfa-test-key-with-more-than-thirty-two-characters";
    const secret = createTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it("cria uma URI que identifica o Zucchero e a conta", () => {
    const uri = totpProvisioningUri(
      "Dona.Ana@example.com",
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    );
    expect(uri).toContain("otpauth://totp/Zucchero%3Adona.ana%40example.com");
    expect(uri).toContain("issuer=Zucchero");
  });
});
