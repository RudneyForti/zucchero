import { describe, expect, it } from "vitest";
import {
  confirmMfaSchema,
  deleteOwnAccountSchema,
  disableMfaSchema,
  inviteMemberSchema,
  updateBusinessHoursSchema,
  updateCompanySchema,
  updateProfileSchema,
  updateSalesPresetsSchema,
} from "./settings.contract";

const schedule = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
].map((day) => ({ day, enabled: true, start: "08:00", end: "18:00" }));

describe("settings contract", () => {
  it("aceita os combinados operacionais dentro dos limites", () => {
    expect(
      updateSalesPresetsSchema.parse({
        defaultMarginPercentage: 40,
        defaultDepositPercentage: 50,
        defaultPaymentMethod: "pix",
        defaultDeliveryMode: "delivery",
        deliveryCostPerKm: 3.5,
      }),
    ).toMatchObject({ defaultMarginPercentage: 40 });
  });

  it("recusa sinal acima do valor integral", () => {
    expect(
      updateSalesPresetsSchema.safeParse({
        defaultMarginPercentage: 40,
        defaultDepositPercentage: 110,
        defaultPaymentMethod: "pix",
        defaultDeliveryMode: "delivery",
        deliveryCostPerKm: 3.5,
      }).success,
    ).toBe(false);
  });

  it("recusa dia repetido e horário invertido", () => {
    const invalid = schedule.map((entry, index) =>
      index === 6
        ? { ...entry, day: "monday", start: "18:00", end: "08:00" }
        : entry,
    );
    expect(updateBusinessHoursSchema.safeParse({ days: invalid }).success).toBe(
      false,
    );
  });

  it("normaliza a sigla do estado e valida o e-mail", () => {
    const result = updateCompanySchema.parse({
      name: "Doce Afeto",
      email: "contato@doceafeto.com.br",
      state: "sp",
      addressLine: "Rua das Flores",
      addressNumber: "128-A",
      addressComplement: "Sala 2",
      neighborhood: "Centro",
      isCommercialPoint: true,
    });
    expect(result.state).toBe("SP");
    expect(result).toMatchObject({
      addressNumber: "128-A",
      neighborhood: "Centro",
      isCommercialPoint: true,
    });
  });

  it("aceita a identidade pessoal separada da confeitaria", () => {
    expect(
      updateProfileSchema.parse({
        displayName: " Dona Ana ",
        avatarDataUrl: null,
      }),
    ).toEqual({ displayName: "Dona Ana", avatarDataUrl: null });
  });

  it("exige ao menos um grupo no convite", () => {
    expect(
      inviteMemberSchema.safeParse({
        email: "pessoa@exemplo.com",
        operationalAccess: false,
        financialAccess: false,
      }).success,
    ).toBe(false);
  });

  it("aceita convite operacional e normaliza o e-mail", () => {
    expect(
      inviteMemberSchema.parse({
        email: " Pessoa@Exemplo.com ",
        operationalAccess: true,
        financialAccess: false,
      }).email,
    ).toBe("pessoa@exemplo.com");
  });

  it("exige confirmação literal da irreversibilidade", () => {
    expect(
      deleteOwnAccountSchema.safeParse({
        password: "segredo",
        tenantName: "Doce Afeto",
        irreversibleConfirmation: false,
      }).success,
    ).toBe(false);
  });

  it("aceita somente códigos TOTP de seis números", () => {
    expect(confirmMfaSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(confirmMfaSchema.safeParse({ code: "12345x" }).success).toBe(false);
    expect(
      disableMfaSchema.safeParse({ password: "Doce#2026", code: "654321" })
        .success,
    ).toBe(true);
  });
});
