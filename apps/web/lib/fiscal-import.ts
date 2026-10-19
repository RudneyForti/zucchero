import type { PantryView } from "./pantry";

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
  catalogue: Array<{
    id: string;
    displayName: string;
    packageLabel: string;
    gtin: string | null;
  }>;
};

export type FiscalImportActionState = {
  status: "idle" | "review" | "success" | "error";
  message: string;
  document: FiscalDocumentView | null;
  pantry: PantryView;
  notificationId: number | null;
};
