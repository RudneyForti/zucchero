import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { appendOutboxEvent } from "../async/outbox";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  commercialItems,
  fiscalDocumentLines,
  fiscalDocuments,
  purchaseLots,
  stockMovements,
} from "../../database/schema";
import type {
  CaptureFiscalDocumentInput,
  ConfirmFiscalDocumentInput,
  ConfirmFiscalDocumentResult,
  FiscalCatalogueItem,
  FiscalDocumentView,
} from "./fiscal-import.contract";

type FiscalDocumentRow = typeof fiscalDocuments.$inferSelect;
type FiscalLineRow = typeof fiscalDocumentLines.$inferSelect;
type CommercialItemRow = typeof commercialItems.$inferSelect;

type ParsedLine = {
  originalDescription: string;
  gtin: string | null;
  quantity: number;
  unit: string;
  totalAmount: number;
};

type MemoryDocument = {
  document: FiscalDocumentRow;
  lines: FiscalLineRow[];
};

const demoCatalogue: CommercialItemRow[] = [
  {
    id: "51111111-1111-4111-8111-111111111111",
    tenantId: "11111111-1111-4111-8111-111111111111",
    ingredientGroupId: "31111111-1111-4111-8111-111111111111",
    brandId: "41111111-1111-4111-8111-111111111111",
    manufacturerName: null,
    displayName: "Harald Melken meio amargo 1,01 kg",
    normalizedName: "harald melken meio amargo 1 01 kg",
    gtin: "7897077821017",
    packageQuantity: 1,
    packageUnit: "kg",
    netContentBase: 1_010,
    conversionConfidence: "provided",
    active: true,
    createdAt: new Date("2026-08-24T12:00:00-03:00"),
    updatedAt: new Date("2026-08-24T12:00:00-03:00"),
  },
  {
    id: "53333333-3333-4333-8333-333333333333",
    tenantId: "11111111-1111-4111-8111-111111111111",
    ingredientGroupId: "32222222-2222-4222-8222-222222222222",
    brandId: "43333333-3333-4333-8333-333333333333",
    manufacturerName: null,
    displayName: "Chantilly Amélia 1 L",
    normalizedName: "chantilly amelia 1 l",
    gtin: "7896010401514",
    packageQuantity: 1,
    packageUnit: "l",
    netContentBase: 1_000,
    conversionConfidence: "provided",
    active: true,
    createdAt: new Date("2026-08-24T12:00:00-03:00"),
    updatedAt: new Date("2026-08-24T12:00:00-03:00"),
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseBrazilianNumber(value: string) {
  const compact = value.trim().replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function extractDocumentKey(source: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(source);
    } catch {
      return source;
    }
  })();
  return decoded.match(/\d{44}/)?.[0] ?? null;
}

export function parseAssistedReceiptText(receiptText?: string): ParsedLine[] {
  if (!receiptText?.trim()) return [];

  return receiptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/[;|]/).map((part) => part.trim());
      if (parts.length < 4) {
        throw new BadRequestException(
          `A linha ${index + 1} precisa ter descrição, quantidade, unidade e valor.`,
        );
      }
      const [description, quantityText, unitText, totalText, gtinText] = parts;
      const quantity = parseBrazilianNumber(quantityText ?? "");
      const totalAmount = parseBrazilianNumber(totalText ?? "");
      const gtin = gtinText?.replace(/\D/g, "") || null;
      if (
        !description ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(totalAmount) ||
        totalAmount < 0
      ) {
        throw new BadRequestException(
          `Revise quantidade e valor da linha ${index + 1}.`,
        );
      }
      if (gtin && !/^\d{8,14}$/.test(gtin)) {
        throw new BadRequestException(
          `O código de barras da linha ${index + 1} não parece válido.`,
        );
      }
      return {
        originalDescription: description,
        gtin,
        quantity,
        unit: (unitText || "UN").toLocaleUpperCase("pt-BR"),
        totalAmount,
      };
    });
}

function packageLabel(item: CommercialItemRow) {
  const amount = ["kg", "l"].includes(item.packageUnit)
    ? item.netContentBase / 1_000
    : item.netContentBase;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(amount)} ${item.packageUnit}`;
}

function catalogueView(items: CommercialItemRow[]): FiscalCatalogueItem[] {
  return items.map((item) => ({
    id: item.id,
    displayName: item.displayName,
    packageLabel: packageLabel(item),
    gtin: item.gtin,
  }));
}

function suggestItem(line: ParsedLine, items: CommercialItemRow[]) {
  if (line.gtin) {
    const exact = items.find((item) => item.gtin === line.gtin);
    if (exact) return { item: exact, confidence: 1 };
  }
  const description = normalize(line.originalDescription);
  const tokens = new Set(
    description.split(" ").filter((token) => token.length > 2),
  );
  let best: { item: CommercialItemRow; confidence: number } | null = null;
  for (const item of items) {
    const itemTokens = normalize(item.displayName).split(" ");
    const matches = itemTokens.filter((token) => tokens.has(token)).length;
    const confidence = matches / Math.max(tokens.size, itemTokens.length, 1);
    if (!best || confidence > best.confidence) best = { item, confidence };
  }
  return best && best.confidence >= 0.34 ? best : null;
}

function documentView(
  document: FiscalDocumentRow,
  lines: FiscalLineRow[],
  items: CommercialItemRow[],
  repeated: boolean,
): FiscalDocumentView {
  return {
    id: document.id,
    keyEnding: document.documentKey.slice(-8),
    status: document.status,
    repeated,
    issuerName: document.issuerName,
    issuedAt: document.issuedAt?.toISOString() ?? null,
    totalAmount: document.totalAmount,
    lines: lines
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        originalDescription: line.originalDescription,
        gtin: line.gtin,
        quantity: line.quantity,
        unit: line.unit,
        totalAmount: line.totalAmount,
        extractionConfidence: line.extractionConfidence,
        suggestedCommercialItemId: line.commercialItemId,
        matchStatus: line.matchStatus,
      })),
    catalogue: catalogueView(items),
  };
}

@Injectable()
export class FiscalImportService {
  private readonly memory = new Map<string, MemoryDocument[]>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async capture(tenantId: string, input: CaptureFiscalDocumentInput) {
    const documentKey = extractDocumentKey(input.source);
    if (!documentKey) {
      throw new BadRequestException(
        "Não encontrei a chave de 44 números. Cole o endereço completo do QR Code ou a chave da NFC-e.",
      );
    }
    const parsedLines = parseAssistedReceiptText(input.receiptText);
    if (!this.database.isConfigured) {
      return this.captureInMemory(
        tenantId,
        documentKey,
        input.source,
        parsedLines,
      );
    }
    return this.database.withTenant(tenantId, (transaction) =>
      this.captureInDatabase(
        transaction,
        tenantId,
        documentKey,
        input.source,
        parsedLines,
      ),
    );
  }

  async confirm(
    tenantId: string,
    documentId: string,
    input: ConfirmFiscalDocumentInput,
  ): Promise<ConfirmFiscalDocumentResult> {
    if (!this.database.isConfigured) {
      return this.confirmInMemory(tenantId, documentId, input);
    }
    return this.database.withTenant(tenantId, (transaction) =>
      this.confirmInDatabase(transaction, tenantId, documentId, input),
    );
  }

  private itemsForMemory(tenantId: string) {
    return demoCatalogue.map((item) => ({ ...item, tenantId }));
  }

  private captureInMemory(
    tenantId: string,
    documentKey: string,
    source: string,
    parsedLines: ParsedLine[],
  ) {
    const documents = this.memory.get(tenantId) ?? [];
    this.memory.set(tenantId, documents);
    const existing = documents.find(
      (entry) => entry.document.documentKey === documentKey,
    );
    const items = this.itemsForMemory(tenantId);
    if (existing) {
      return documentView(existing.document, existing.lines, items, true);
    }
    const now = new Date();
    const document: FiscalDocumentRow = {
      id: randomUUID(),
      tenantId,
      documentKey,
      sourceHash: createHash("sha256").update(source).digest("hex"),
      captureMethod: "qr_code",
      issuerName: null,
      issuedAt: null,
      totalAmount: parsedLines.reduce((sum, line) => sum + line.totalAmount, 0),
      status: "requires_review",
      adapterName: "assisted_text",
      adapterVersion: "1",
      capturedAt: now,
      confirmedAt: null,
    };
    const lines: FiscalLineRow[] = parsedLines.map((line, index) => {
      const suggestion = suggestItem(line, items);
      return {
        id: randomUUID(),
        tenantId,
        fiscalDocumentId: document.id,
        lineNumber: index + 1,
        ...line,
        commercialItemId: suggestion?.item.id ?? null,
        extractionConfidence: suggestion?.confidence ?? 0.7,
        matchStatus: suggestion ? "suggested" : "unmatched",
        createdAt: now,
      };
    });
    documents.push({ document, lines });
    return documentView(document, lines, items, false);
  }

  private confirmInMemory(
    tenantId: string,
    documentId: string,
    input: ConfirmFiscalDocumentInput,
  ): ConfirmFiscalDocumentResult {
    const entry = this.memory
      .get(tenantId)
      ?.find((item) => item.document.id === documentId);
    if (!entry) throw new NotFoundException("NFC-e não encontrada.");
    if (entry.document.status === "confirmed") {
      return {
        message: "Esta NFC-e já havia sido confirmada.",
        repeated: true,
        purchaseLotIds: [],
      };
    }
    if (entry.lines.length === 0 || input.lines.length !== entry.lines.length) {
      throw new BadRequestException(
        "Revise e associe todas as linhas da nota.",
      );
    }
    entry.document.status = "confirmed";
    entry.document.confirmedAt = new Date();
    return {
      message: "NFC-e conferida e produtos guardados na despensa.",
      repeated: false,
      purchaseLotIds: entry.lines.map(() => randomUUID()),
    };
  }

  private async loadItems(transaction: AppTransaction) {
    return transaction
      .select()
      .from(commercialItems)
      .where(eq(commercialItems.active, true));
  }

  private async captureInDatabase(
    transaction: AppTransaction,
    tenantId: string,
    documentKey: string,
    source: string,
    parsedLines: ParsedLine[],
  ) {
    const items = await this.loadItems(transaction);
    const [existing] = await transaction
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.documentKey, documentKey));
    if (existing) {
      let lines = await transaction
        .select()
        .from(fiscalDocumentLines)
        .where(eq(fiscalDocumentLines.fiscalDocumentId, existing.id));

      if (
        existing.status === "requires_review" &&
        lines.length === 0 &&
        parsedLines.length > 0
      ) {
        const values = parsedLines.map((line, index) => {
          const suggestion = suggestItem(line, items);
          return {
            tenantId,
            fiscalDocumentId: existing.id,
            lineNumber: index + 1,
            ...line,
            commercialItemId: suggestion?.item.id,
            extractionConfidence: suggestion?.confidence ?? 0.7,
            matchStatus: suggestion
              ? ("suggested" as const)
              : ("unmatched" as const),
          };
        });
        lines = await transaction
          .insert(fiscalDocumentLines)
          .values(values)
          .returning();
        await transaction
          .update(fiscalDocuments)
          .set({
            totalAmount: parsedLines.reduce(
              (sum, line) => sum + line.totalAmount,
              0,
            ),
          })
          .where(eq(fiscalDocuments.id, existing.id));
        existing.totalAmount = parsedLines.reduce(
          (sum, line) => sum + line.totalAmount,
          0,
        );
      }
      return documentView(existing, lines, items, true);
    }
    const [document] = await transaction
      .insert(fiscalDocuments)
      .values({
        tenantId,
        documentKey,
        sourceHash: createHash("sha256").update(source).digest("hex"),
        totalAmount:
          parsedLines.length > 0
            ? parsedLines.reduce((sum, line) => sum + line.totalAmount, 0)
            : null,
      })
      .returning();
    if (!document)
      throw new ConflictException("Não foi possível guardar a NFC-e.");

    const values = parsedLines.map((line, index) => {
      const suggestion = suggestItem(line, items);
      return {
        tenantId,
        fiscalDocumentId: document.id,
        lineNumber: index + 1,
        ...line,
        commercialItemId: suggestion?.item.id,
        extractionConfidence: suggestion?.confidence ?? 0.7,
        matchStatus: suggestion
          ? ("suggested" as const)
          : ("unmatched" as const),
      };
    });
    const lines =
      values.length > 0
        ? await transaction
            .insert(fiscalDocumentLines)
            .values(values)
            .returning()
        : [];
    await transaction.insert(auditEvents).values({
      tenantId,
      eventType: "fiscal_document.captured",
      correlationId: randomUUID(),
      payload: {
        fiscalDocumentId: document.id,
        lineCount: lines.length,
        adapter: "assisted_text:1",
      },
    });
    return documentView(document, lines, items, false);
  }

  private async confirmInDatabase(
    transaction: AppTransaction,
    tenantId: string,
    documentId: string,
    input: ConfirmFiscalDocumentInput,
  ): Promise<ConfirmFiscalDocumentResult> {
    const [document] = await transaction
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.id, documentId))
      .for("update");
    if (!document) throw new NotFoundException("NFC-e não encontrada.");
    if (document.status === "confirmed") {
      const lots = await transaction
        .select({ id: purchaseLots.id })
        .from(purchaseLots)
        .where(eq(purchaseLots.sourceDocumentId, document.id));
      return {
        message: "Esta NFC-e já havia sido confirmada.",
        repeated: true,
        purchaseLotIds: lots.map((lot) => lot.id),
      };
    }
    if (document.status !== "requires_review") {
      throw new ConflictException(
        "Esta NFC-e não está disponível para revisão.",
      );
    }
    const lines = await transaction
      .select()
      .from(fiscalDocumentLines)
      .where(eq(fiscalDocumentLines.fiscalDocumentId, document.id));
    if (lines.length === 0 || input.lines.length !== lines.length) {
      throw new BadRequestException(
        "Revise e associe todas as linhas da nota.",
      );
    }
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const itemIds = new Set(input.lines.map((line) => line.commercialItemId));
    const items = await this.loadItems(transaction);
    const itemById = new Map(
      items
        .filter((item) => itemIds.has(item.id))
        .map((item) => [item.id, item]),
    );
    if (itemById.size !== itemIds.size) {
      throw new BadRequestException(
        "Um dos produtos associados não existe mais.",
      );
    }

    const purchaseLotIds: string[] = [];
    for (const confirmation of input.lines) {
      const line = lineById.get(confirmation.lineId);
      const item = itemById.get(confirmation.commercialItemId);
      if (!line || !item) {
        throw new BadRequestException(
          "Revise a associação de todas as linhas.",
        );
      }
      const quantityInitialBase = line.quantity * item.netContentBase;
      const [lot] = await transaction
        .insert(purchaseLots)
        .values({
          tenantId,
          commercialItemId: item.id,
          supplierName: input.supplierName ?? document.issuerName,
          sourceDocumentId: document.id,
          entryDate: input.entryDate,
          expiryDate: confirmation.expiryDate,
          quantityInitialBase,
          totalCost: line.totalAmount,
          unitCostBase: line.totalAmount / quantityInitialBase,
          lotCode: confirmation.lotCode,
          source: "nfce",
        })
        .returning();
      if (!lot)
        throw new ConflictException("Não foi possível criar um dos lotes.");
      purchaseLotIds.push(lot.id);
      await transaction.insert(stockMovements).values({
        tenantId,
        lotId: lot.id,
        type: "PURCHASE_IN",
        quantityBase: quantityInitialBase,
        referenceType: "fiscal_document",
        referenceId: document.id,
        idempotencyKey: `fiscal:${document.id}:${line.id}`,
      });
      await transaction
        .update(fiscalDocumentLines)
        .set({
          commercialItemId: item.id,
          matchStatus: "confirmed",
        })
        .where(
          and(
            eq(fiscalDocumentLines.id, line.id),
            eq(fiscalDocumentLines.fiscalDocumentId, document.id),
          ),
        );
    }
    await transaction
      .update(fiscalDocuments)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(fiscalDocuments.id, document.id));
    await transaction.insert(auditEvents).values({
      tenantId,
      eventType: "fiscal_document.confirmed",
      correlationId: input.idempotencyKey,
      payload: {
        fiscalDocumentId: document.id,
        purchaseLotIds,
        lineCount: lines.length,
      },
    });
    await appendOutboxEvent(transaction, {
      tenantId,
      eventType: "fiscal-document.confirmed",
      aggregateType: "fiscal_document",
      aggregateId: document.id,
      correlationId: input.idempotencyKey,
      payload: { purchaseLotIds, lineCount: lines.length },
    });
    return {
      message: "NFC-e conferida e produtos guardados na despensa.",
      repeated: false,
      purchaseLotIds,
    };
  }
}
