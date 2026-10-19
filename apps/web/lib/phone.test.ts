import { describe, expect, it } from "vitest";
import { brazilianPhoneDigits, formatBrazilianPhone } from "./phone";

describe("Brazilian phone helpers", () => {
  it("aplica a máscara de celular com DDD", () => {
    expect(formatBrazilianPhone("13988080354")).toBe("(13) 98808-0354");
  });

  it("aplica a máscara de telefone fixo com DDD", () => {
    expect(formatBrazilianPhone("1338880354")).toBe("(13) 3888-0354");
  });

  it("aceita colagem formatada e limita a onze dígitos", () => {
    expect(brazilianPhoneDigits("(13) 98808-0354 ramal 99")).toBe(
      "13988080354",
    );
  });
});
