import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const registerPurchaseSchema = z
  .object({
    commercialItemId: z.string().uuid().optional(),
    newItem: z
      .object({
        groupName: z.string().trim().min(2).max(120),
        categoryId: z.string().uuid(),
        baseDimension: z.enum(["mass", "unit"]),
        perishable: z.boolean().default(false),
        brandName: z.string().trim().max(100).optional(),
        displayName: z.string().trim().min(2).max(180),
        gtin: z
          .string()
          .trim()
          .regex(/^\d{8,14}$/)
          .optional(),
        packageUnit: z.enum(["g", "kg", "ml", "l", "un"]),
        netContentBase: z.number().positive().max(1_000_000),
      })
      .optional(),
    quantityPackages: z.number().int().positive().max(10_000),
    totalCost: z.number().nonnegative().max(100_000_000),
    entryDate: z.string().regex(isoDate),
    expiryDate: z.string().regex(isoDate).optional(),
    supplierName: z.string().trim().max(140).optional(),
    lotCode: z.string().trim().max(80).optional(),
    forceCreate: z.boolean().default(false),
  })
  .refine(
    (value) => Boolean(value.commercialItemId) !== Boolean(value.newItem),
    "Informe um item existente ou os dados de um novo item.",
  )
  .refine(
    (value) => !value.expiryDate || value.expiryDate >= value.entryDate,
    "A validade não pode anteceder a data de entrada.",
  );

export type RegisterPurchaseInput = z.infer<typeof registerPurchaseSchema>;

export const createIngredientCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["ingredient", "packaging", "operational"]),
});
export type CreateIngredientCategoryInput = z.infer<
  typeof createIngredientCategorySchema
>;

export const adjustInventorySchema = z.object({
  idempotencyKey: z.string().uuid(),
  countedQuantityBase: z.number().nonnegative().max(1_000_000),
  reason: z.enum(["physical_count", "opening_balance", "data_correction"]),
  note: z.string().trim().min(3).max(240),
});

export const registerStockLossSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    quantityBase: z.number().positive().max(1_000_000),
    reason: z.enum(["expired", "damaged", "quality", "other"]),
    note: z.string().trim().max(240).optional(),
  })
  .refine((value) => value.reason !== "other" || Boolean(value.note), {
    message: "Conte brevemente o motivo desta perda.",
    path: ["note"],
  });

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
export type RegisterStockLossInput = z.infer<typeof registerStockLossSchema>;

export type DuplicateCandidate = {
  id: string;
  displayName: string;
  groupName: string;
  packageLabel: string;
  reason: string;
  confidence: number;
};

export type PantryItemView = {
  id: string;
  displayName: string;
  brandName: string | null;
  packageLabel: string;
  availableBase: number;
  availableLabel: string;
  lotCount: number;
  lastUnitCost: number;
  nextExpiry: string | null;
  nextExpiryLabel: string | null;
  status: "ok" | "attention" | "low";
  lots: Array<{
    id: string;
    lotCode: string | null;
    entryDate: string;
    expiryDate: string | null;
    availableBase: number;
    availableLabel: string;
    physicalBase: number;
    physicalLabel: string;
    reservedBase: number;
    reservedLabel: string;
    unitCost: number;
    inventoryValue: number;
  }>;
};

export type PantryGroupView = {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  baseUnit: string;
  minimumStock: number;
  availableBase: number;
  availableLabel: string;
  status: "ok" | "attention" | "low";
  items: PantryItemView[];
};

export type PantryView = {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  categories: Array<{
    id: string;
    name: string;
    kind: "ingredient" | "packaging" | "operational";
    groupCount: number;
  }>;
  summary: {
    groupCount: number;
    itemCount: number;
    openLotCount: number;
    inventoryValue: number;
  };
  attention: Array<{
    id: string;
    tone: "expiry" | "low";
    title: string;
    detail: string;
  }>;
  shoppingList: Array<{
    commercialItemId: string;
    displayName: string;
    packageLabel: string;
    neededBase: number;
    availableBase: number;
    remainingBase: number;
    remainingLabel: string;
    packagesToBuy: number;
    orderCount: number;
    neededBy: string;
  }>;
  groups: PantryGroupView[];
};

export type RegisterPurchaseResult = {
  message: string;
  pantry: PantryView;
};

export type PantryMutationResult = RegisterPurchaseResult & {
  repeated: boolean;
};
