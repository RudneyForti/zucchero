import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../database/database.service";
import type { SaveCustomerInput } from "./customers.contract";
import { CustomersService } from "./customers.service";

const tenantId = "22222222-2222-4222-8222-222222222222";

function service() {
  return new CustomersService({
    isConfigured: false,
  } as DatabaseService);
}

describe("CustomersService", () => {
  it("cria e atualiza cliente com endereço padrão", async () => {
    const customers = service();
    const created = await customers.create(tenantId, {
      name: "Clara Martins",
      primaryPhone: "(11) 95555-1212",
      email: "clara@example.invalid",
      notes: null,
      preferredDeliveryMode: "delivery",
      preferredPaymentMethod: "pix",
      addresses: [
        {
          label: "Casa",
          recipient: "Clara Martins",
          formattedAddress: "Rua do Açúcar, 42 · Centro",
          postalCode: "11075-440",
          street: "Rua do Açúcar",
          addressNumber: "42",
          addressComplement: "Fundos",
          neighborhood: "Centro",
          city: "Santos",
          state: "SP",
          deliveryInstructions: null,
          isDefault: false,
        },
      ],
    });

    expect(created.customer.addresses[0]?.isDefault).toBe(true);
    expect(created.customer.addresses[0]?.postalCode).toBe("11075-440");
    expect(created.customer.addresses[0]?.addressComplement).toBe("Fundos");
    expect(created.workspace.summary.deliveryReadyCount).toBe(1);

    const updated = await customers.update(tenantId, created.customer.id, {
      name: "Clara M. Martins",
      primaryPhone: "(11) 95555-1212",
      email: null,
      notes: "Confirmar antes de sair para entrega.",
      preferredDeliveryMode: "pickup",
      preferredPaymentMethod: "card",
      addresses: [],
    });

    expect(updated.customer.name).toBe("Clara M. Martins");
    expect(updated.customer.addresses).toEqual([]);
    expect(updated.workspace.summary.deliveryReadyCount).toBe(0);
  });

  it("impede que o mesmo telefone crie duas clientes", async () => {
    const customers = service();
    const input: SaveCustomerInput = {
      name: "Clara Martins",
      primaryPhone: "(11) 95555-1212",
      email: null,
      notes: null,
      preferredDeliveryMode: null,
      preferredPaymentMethod: null,
      addresses: [],
    };

    await customers.create(tenantId, input);
    await expect(
      customers.create(tenantId, { ...input, name: "Outra Clara" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("exporta e depois anonimiza os dados da cliente", async () => {
    const customers = service();
    const created = await customers.create(tenantId, {
      name: "Clara Martins",
      primaryPhone: "(11) 95555-1212",
      email: "clara@example.invalid",
      notes: null,
      preferredDeliveryMode: "pickup",
      preferredPaymentMethod: "pix",
      addresses: [],
    });

    const exported = await customers.exportPrivacyData(
      tenantId,
      created.customer.id,
    );
    expect(exported.customer.email).toBe("clara@example.invalid");
    expect(exported.generatedAt).toBeTruthy();

    const anonymized = await customers.anonymize(
      tenantId,
      created.customer.id,
      {
        confirmation: "ANONIMIZAR",
        reason: "Solicitação feita pela titular.",
      },
    );
    expect(anonymized.workspace.customers).toEqual([]);
    await expect(
      customers.exportPrivacyData(tenantId, created.customer.id),
    ).rejects.toThrow("não foi encontrada");
  });
});
