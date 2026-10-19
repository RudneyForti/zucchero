import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const captureFiscalDocumentSchema = z.object({
  source: z.string().trim().min(8).max(2_048),
  receiptText: z.string().trim().max(12_000).optional(),
});

export const confirmFiscalDocumentSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    entryDate: z.string().regex(isoDate),
    supplierName: z.string().trim().max(140).optional(),
    lines: z
      .array(
        z.object({
          lineId: z.string().uuid(),
          commercialItemId: z.string().uuid(),
          expiryDate: z.string().regex(isoDate).optional(),
          lotCode: z.string().trim().max(80).optional(),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (value) =>
      value.lines.every(
        (line) => !line.expiryDate || line.expiryDate >= value.entryDate,
      ),
    {
      message: "A validade não pode anteceder a data de entrada.",
      path: ["lines"],
    },
  );

export type CaptureFiscalDocumentInput = z.infer<
  typeof captureFiscalDocumentSchema
>;
export type ConfirmFiscalDocumentInput = z.infer<
  typeof confirmFiscalDocumentSchema
>;

export type FiscalCatalogueItem = {
  id: string;
  displayName: string;
  packageLabel: string;
  gtin: string | null;
};

export type FiscalDocumentView = {
  id: string;
  keyEnding: string;
  status: "requires_review" | "confirmed" | "cancelled" | "failed";
  repeated: boolean;
  issuerName: string | null;
  issuedAt: string | null;
  totalAmount: number | null;
  lines: Array<{
    id: string;
    lineNumber: number;
    originalDescription: string;
    gtin: string | null;
    quantity: number;
    unit: string;
    totalAmount: number;
    extractionConfidence: number;
    suggestedCommercialItemId: string | null;
    matchStatus: "unmatched" | "suggested" | "confirmed";
  }>;
  catalogue: FiscalCatalogueItem[];
};

export type ConfirmFiscalDocumentResult = {
  message: string;
  repeated: boolean;
  purchaseLotIds: string[];
};
