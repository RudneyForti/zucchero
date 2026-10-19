import { describe, expect, it } from "vitest";
import {
  hashLocalPassword,
  localSignupSchema,
  verifyLocalPasswordHash,
} from "./local-identity.service";

describe("local identity password", () => {
  it("deriva a senha com salt e valida sem guardar o texto original", async () => {
    const hash = await hashLocalPassword("Doce#2026");
    expect(hash).not.toContain("Doce#2026");
    await expect(verifyLocalPasswordHash(hash, "Doce#2026")).resolves.toBe(
      true,
    );
    await expect(verifyLocalPasswordHash(hash, "errada")).resolves.toBe(false);
  });

  it("aplica a política de senha do cadastro", () => {
    const base = {
      ownerName: "Stefanie",
      tenantName: "Doces da Stefanie",
      email: "stefanie@example.test",
    };
    expect(
      localSignupSchema.safeParse({
        ...base,
        password: "Doce#2026",
        addressLine: "Rua das Flores",
        addressNumber: "128",
        addressComplement: "Fundos",
        neighborhood: "Centro",
        isCommercialPoint: true,
      }).success,
    ).toBe(true);
    expect(
      localSignupSchema.safeParse({ ...base, password: "apenasletras" })
        .success,
    ).toBe(false);
  });
});
