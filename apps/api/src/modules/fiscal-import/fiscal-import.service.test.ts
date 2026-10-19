import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../database/database.service";
import {
  extractDocumentKey,
  FiscalImportService,
  parseAssistedReceiptText,
} from "./fiscal-import.service";

const tenantId = "11111111-1111-4111-8111-111111111111";
const key = "35260812345678000123650010000001231234567890";

function serviceWithoutDatabase() {
  return new FiscalImportService({ isConfigured: false } as DatabaseService);
}

describe("FiscalImportService", () => {
  it("extrai a chave de uma URL de QR Code sem persistir a origem completa", () => {
    expect(
      extractDocumentKey(`https://www.fazenda.sp.gov.br/qrcode?p=${key}|2|1`),
    ).toBe(key);
  });

  it("interpreta linhas assistidas com números no formato brasileiro", () => {
    expect(
      parseAssistedReceiptText(
        "Chantilly Amélia 1 L; 2; UN; 37,80; 7896010401514",
      ),
    ).toEqual([
      {
        originalDescription: "Chantilly Amélia 1 L",
        gtin: "7896010401514",
        quantity: 2,
        unit: "UN",
        totalAmount: 37.8,
      },
    ]);
  });

  it("sugere item conhecido, impede captura duplicada e confirma uma única vez", async () => {
    const service = serviceWithoutDatabase();
    const input = {
      source: key,
      receiptText: "Chantilly Amélia 1 L; 2; UN; 37,80; 7896010401514",
    };
    const captured = await service.capture(tenantId, input);
    expect(captured.lines[0]?.suggestedCommercialItemId).toBe(
      "53333333-3333-4333-8333-333333333333",
    );
    expect((await service.capture(tenantId, input)).repeated).toBe(true);

    const line = captured.lines[0];
    if (!line) throw new Error("Linha não capturada no teste.");
    const confirmation = {
      idempotencyKey: "77777777-7777-4777-8777-777777777777",
      entryDate: "2026-08-27",
      lines: [
        {
          lineId: line.id,
          commercialItemId: "53333333-3333-4333-8333-333333333333",
          expiryDate: "2026-09-10",
        },
      ],
    };
    expect(
      await service.confirm(tenantId, captured.id, confirmation),
    ).toMatchObject({ repeated: false });
    expect(
      await service.confirm(tenantId, captured.id, confirmation),
    ).toMatchObject({ repeated: true });
  });

  it("não aceita uma origem sem chave de 44 números", async () => {
    await expect(
      serviceWithoutDatabase().capture(tenantId, { source: "qr-incompleto" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
