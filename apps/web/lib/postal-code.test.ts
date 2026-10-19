import { describe, expect, it } from "vitest";
import {
  addressLineFromPostalCode,
  formatPostalCode,
  preserveTypedAddressDetail,
  postalCodeDigits,
} from "./postal-code";

describe("postal code helpers", () => {
  it("mantém apenas oito números e aplica a máscara brasileira", () => {
    expect(postalCodeDigits("11.075-4409")).toBe("11075440");
    expect(formatPostalCode("11075440")).toBe("11075-440");
  });

  it("combina logradouro e bairro sem inventar dados", () => {
    expect(
      addressLineFromPostalCode({
        postalCode: "11075-440",
        street: "Rua Exemplo",
        neighborhood: "Centro",
        complement: "",
        city: "Santos",
        state: "SP",
      }),
    ).toBe("Rua Exemplo, Centro");
  });

  it("não apaga o complemento digitado enquanto o CEP é consultado", () => {
    expect(preserveTypedAddressDetail("Ap 11", "")).toBe("Ap 11");
    expect(preserveTypedAddressDetail("", "Fundos")).toBe("Fundos");
  });
});
