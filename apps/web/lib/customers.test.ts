import { describe, expect, it } from "vitest";
import { formatCustomerAddress } from "./customers";

describe("formatCustomerAddress", () => {
  it("monta um endereço de entrega legível com os dados estruturados", () => {
    expect(
      formatCustomerAddress({
        postalCode: "11075-440",
        street: "Rua Almirante Barroso",
        addressNumber: "128-A",
        addressComplement: "Fundos",
        neighborhood: "Campo Grande",
        city: "Santos",
        state: "sp",
      }),
    ).toBe(
      "Rua Almirante Barroso, 128-A · Fundos · Campo Grande · Santos - SP · CEP 11075-440",
    );
  });

  it("omite partes vazias sem deixar separadores soltos", () => {
    expect(
      formatCustomerAddress({
        postalCode: null,
        street: "Rua das Acácias",
        addressNumber: null,
        addressComplement: null,
        neighborhood: "Centro",
        city: null,
        state: null,
      }),
    ).toBe("Rua das Acácias · Centro");
  });
});
