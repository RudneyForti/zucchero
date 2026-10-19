import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  brands,
  commercialItems,
  ingredientCategories,
  ingredientGroups,
  purchaseLots,
  shoppingNeeds,
  stockMovements,
} from "../../database/schema";
import type {
  AdjustInventoryInput,
  DuplicateCandidate,
  PantryMutationResult,
  PantryGroupView,
  PantryView,
  CreateIngredientCategoryInput,
  RegisterPurchaseInput,
  RegisterPurchaseResult,
  RegisterStockLossInput,
} from "./pantry.contract";

type IngredientGroupRow = typeof ingredientGroups.$inferSelect;
type IngredientCategoryRow = typeof ingredientCategories.$inferSelect;
type BrandRow = typeof brands.$inferSelect;
type CommercialItemRow = typeof commercialItems.$inferSelect;
type PurchaseLotRow = typeof purchaseLots.$inferSelect;
type StockMovementRow = typeof stockMovements.$inferSelect;
type ShoppingNeedRow = typeof shoppingNeeds.$inferSelect;

type PantryRows = {
  categories: IngredientCategoryRow[];
  groups: IngredientGroupRow[];
  brands: BrandRow[];
  items: CommercialItemRow[];
  lots: PurchaseLotRow[];
  movements: StockMovementRow[];
  needs: ShoppingNeedRow[];
};

const demoTenantId = "11111111-1111-4111-8111-111111111111";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function packageLabel(item: CommercialItemRow) {
  const amount = ["kg", "l"].includes(item.packageUnit)
    ? item.netContentBase / 1_000
    : item.netContentBase;
  const unit = item.packageUnit;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(amount)} ${unit}`;
}

function quantityLabel(value: number, unit: string) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value)} ${unit}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(new Date(`${value}T12:00:00-03:00`))
    .replace(".", "");
}

function movementFactor(type: StockMovementRow["type"]) {
  if (["PURCHASE_IN", "ADJUSTMENT_IN", "RETURN_IN", "RELEASE"].includes(type)) {
    return 1;
  }
  if (
    ["ADJUSTMENT_OUT", "CONSUME", "LOSS", "RETURN_OUT", "RESERVE"].includes(
      type,
    )
  ) {
    return -1;
  }
  return 0;
}

function physicalMovementFactor(type: StockMovementRow["type"]) {
  if (["PURCHASE_IN", "ADJUSTMENT_IN", "RETURN_IN"].includes(type)) return 1;
  if (["ADJUSTMENT_OUT", "CONSUME", "LOSS", "RETURN_OUT"].includes(type))
    return -1;
  return 0;
}

function balancesForLot(rows: PantryRows, lotId: string) {
  return balancesFromMovements(
    rows.movements.filter((entry) => entry.lotId === lotId),
  );
}

function balancesFromMovements(lotMovements: StockMovementRow[]) {
  const availableBase = lotMovements.reduce(
    (sum, entry) => sum + entry.quantityBase * movementFactor(entry.type),
    0,
  );
  const physicalBase = lotMovements.reduce(
    (sum, entry) =>
      sum + entry.quantityBase * physicalMovementFactor(entry.type),
    0,
  );
  return {
    availableBase: Math.max(0, availableBase),
    physicalBase: Math.max(0, physicalBase),
    reservedBase: Math.max(0, physicalBase - availableBase),
  };
}

function makeDemoRows(tenantId: string): PantryRows {
  const createdAt = new Date("2026-08-24T12:00:00-03:00");
  const groupChocolate = "31111111-1111-4111-8111-111111111111";
  const groupChantilly = "32222222-2222-4222-8222-222222222222";
  const groupMorango = "33333333-3333-4333-8333-333333333333";
  const categoryChocolate = "21111111-1111-4111-8111-111111111111";
  const categoryDairy = "22222222-2222-4222-8222-222222222223";
  const categoryFruit = "23333333-3333-4333-8333-333333333333";
  const brandHarald = "41111111-1111-4111-8111-111111111111";
  const brandSicao = "42222222-2222-4222-8222-222222222222";
  const brandAmelia = "43333333-3333-4333-8333-333333333333";
  const itemHarald = "51111111-1111-4111-8111-111111111111";
  const itemSicao = "52222222-2222-4222-8222-222222222222";
  const itemAmelia = "53333333-3333-4333-8333-333333333333";
  const itemMorango = "54444444-4444-4444-8444-444444444444";

  const categories: IngredientCategoryRow[] = [
    {
      id: categoryChocolate,
      tenantId,
      name: "Chocolates e cacaus",
      normalizedName: "chocolates e cacaus",
      kind: "ingredient",
      active: true,
      createdAt,
    },
    {
      id: categoryDairy,
      tenantId,
      name: "Cremes e laticínios",
      normalizedName: "cremes e laticinios",
      kind: "ingredient",
      active: true,
      createdAt,
    },
    {
      id: categoryFruit,
      tenantId,
      name: "Frutas",
      normalizedName: "frutas",
      kind: "ingredient",
      active: true,
      createdAt,
    },
  ];
  const groups: IngredientGroupRow[] = [
    {
      id: groupChocolate,
      tenantId,
      name: "Chocolate meio amargo",
      normalizedName: "chocolate meio amargo",
      categoryId: categoryChocolate,
      category: "Chocolates e cacaus",
      baseDimension: "mass",
      baseUnit: "g",
      perishable: false,
      defaultDensityGml: null,
      minimumStock: 1_500,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: groupChantilly,
      tenantId,
      name: "Chantilly",
      normalizedName: "chantilly",
      categoryId: categoryDairy,
      category: "Cremes e laticínios",
      baseDimension: "mass",
      baseUnit: "g",
      perishable: true,
      defaultDensityGml: 1,
      minimumStock: 1_000,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: groupMorango,
      tenantId,
      name: "Morango",
      normalizedName: "morango",
      categoryId: categoryFruit,
      category: "Frutas",
      baseDimension: "mass",
      baseUnit: "g",
      perishable: true,
      defaultDensityGml: null,
      minimumStock: 600,
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const demoBrands: BrandRow[] = [
    {
      id: brandHarald,
      tenantId,
      name: "Harald",
      normalizedName: "harald",
      createdAt,
    },
    {
      id: brandSicao,
      tenantId,
      name: "Sicao",
      normalizedName: "sicao",
      createdAt,
    },
    {
      id: brandAmelia,
      tenantId,
      name: "Amélia",
      normalizedName: "amelia",
      createdAt,
    },
  ];

  const items: CommercialItemRow[] = [
    {
      id: itemHarald,
      tenantId,
      ingredientGroupId: groupChocolate,
      brandId: brandHarald,
      manufacturerName: null,
      displayName: "Harald Melken meio amargo 1,01 kg",
      normalizedName: "harald melken meio amargo 1 01 kg",
      gtin: "7897077821017",
      packageQuantity: 1,
      packageUnit: "kg",
      netContentBase: 1_010,
      conversionConfidence: "provided",
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: itemSicao,
      tenantId,
      ingredientGroupId: groupChocolate,
      brandId: brandSicao,
      manufacturerName: null,
      displayName: "Sicao Nobre meio amargo 1,01 kg",
      normalizedName: "sicao nobre meio amargo 1 01 kg",
      gtin: "7891118001017",
      packageQuantity: 1,
      packageUnit: "kg",
      netContentBase: 1_010,
      conversionConfidence: "provided",
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: itemAmelia,
      tenantId,
      ingredientGroupId: groupChantilly,
      brandId: brandAmelia,
      manufacturerName: null,
      displayName: "Chantilly Amélia 1 L",
      normalizedName: "chantilly amelia 1 l",
      gtin: "7896010401514",
      packageQuantity: 1,
      packageUnit: "l",
      netContentBase: 1_000,
      conversionConfidence: "provided",
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: itemMorango,
      tenantId,
      ingredientGroupId: groupMorango,
      brandId: null,
      manufacturerName: null,
      displayName: "Morango fresco bandeja 250 g",
      normalizedName: "morango fresco bandeja 250 g",
      gtin: null,
      packageQuantity: 1,
      packageUnit: "g",
      netContentBase: 250,
      conversionConfidence: "provided",
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const lots: PurchaseLotRow[] = [
    {
      id: "61111111-1111-4111-8111-111111111111",
      tenantId,
      commercialItemId: itemHarald,
      supplierName: "Atacadão",
      sourceDocumentId: null,
      entryDate: "2026-08-18",
      expiryDate: "2027-02-20",
      quantityInitialBase: 2_020,
      totalCost: 67.8,
      unitCostBase: 67.8 / 2_020,
      lotCode: "HML-0826",
      source: "manual",
      status: "available",
      createdAt,
    },
    {
      id: "62222222-2222-4222-8222-222222222222",
      tenantId,
      commercialItemId: itemSicao,
      supplierName: "Loja do Confeiteiro",
      sourceDocumentId: null,
      entryDate: "2026-08-10",
      expiryDate: "2026-12-15",
      quantityInitialBase: 1_010,
      totalCost: 31.9,
      unitCostBase: 31.9 / 1_010,
      lotCode: "SIC-401",
      source: "manual",
      status: "available",
      createdAt,
    },
    {
      id: "63333333-3333-4333-8333-333333333333",
      tenantId,
      commercialItemId: itemAmelia,
      supplierName: "Assaí",
      sourceDocumentId: null,
      entryDate: "2026-08-22",
      expiryDate: "2026-09-03",
      quantityInitialBase: 1_000,
      totalCost: 19.9,
      unitCostBase: 19.9 / 1_000,
      lotCode: "AME-228",
      source: "manual",
      status: "available",
      createdAt,
    },
  ];

  const movements: StockMovementRow[] = lots.map((lot) => ({
    id: randomUUID(),
    tenantId,
    lotId: lot.id,
    type: "PURCHASE_IN",
    quantityBase: lot.quantityInitialBase,
    occurredAt: createdAt,
    referenceType: "purchase_lot",
    referenceId: lot.id,
    reasonCode: null,
    note: null,
    actorUserId: null,
    reversesMovementId: null,
    idempotencyKey: null,
  }));

  const needs: ShoppingNeedRow[] = [
    {
      id: "71111111-1111-4111-8111-111111111111",
      tenantId,
      orderId: "81111111-1111-4111-8111-111111111111",
      requirementId: "91111111-1111-4111-8111-111111111111",
      commercialItemId: itemMorango,
      itemNameSnapshot: "Morango fresco bandeja 250 g",
      shortageBase: 600,
      packageContentBase: 250,
      packagesToBuy: 3,
      purchaseQuantityBase: 750,
      neededBy: new Date("2026-08-28T17:30:00-03:00"),
      status: "open",
      createdAt,
    },
  ];

  return {
    categories,
    groups,
    brands: demoBrands,
    items,
    lots,
    movements,
    needs,
  };
}

function cloneDemoRows(tenantId: string) {
  return structuredClone(makeDemoRows(tenantId));
}

function itemSimilarity(
  input: RegisterPurchaseInput["newItem"] & {},
  item: CommercialItemRow,
  brand: BrandRow | undefined,
) {
  if (input.gtin && item.gtin === input.gtin) return 1;
  const incoming = new Set(
    normalize(`${input.brandName ?? ""} ${input.displayName}`).split(" "),
  );
  const existing = new Set(
    normalize(`${brand?.name ?? ""} ${item.displayName}`).split(" "),
  );
  const shared = [...incoming].filter((token) => existing.has(token)).length;
  const union = new Set([...incoming, ...existing]).size || 1;
  const overlap = shared / union;
  if (normalize(input.displayName) === item.normalizedName) return 0.98;
  if (input.brandName && normalize(input.brandName) === brand?.normalizedName) {
    return Math.min(0.95, overlap + 0.28);
  }
  return overlap;
}

function duplicateCandidates(
  input: RegisterPurchaseInput["newItem"] & {},
  rows: PantryRows,
): DuplicateCandidate[] {
  return rows.items
    .map((item) => {
      const group = rows.groups.find(
        (entry) => entry.id === item.ingredientGroupId,
      );
      const brand = rows.brands.find((entry) => entry.id === item.brandId);
      const confidence = itemSimilarity(input, item, brand);
      return {
        id: item.id,
        displayName: item.displayName,
        groupName: group?.name ?? "Ingrediente não encontrado",
        packageLabel: packageLabel(item),
        reason:
          input.gtin && item.gtin === input.gtin
            ? "Mesmo código de barras"
            : brand && normalize(input.brandName ?? "") === brand.normalizedName
              ? "Mesma marca e descrição semelhante"
              : "Descrição semelhante",
        confidence,
      };
    })
    .filter((candidate) => candidate.confidence >= 0.58)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function buildPantryView(tenantId: string, rows: PantryRows): PantryView {
  const brandById = new Map(rows.brands.map((brand) => [brand.id, brand]));
  const lotBalance = new Map<string, number>();

  for (const movement of rows.movements) {
    lotBalance.set(
      movement.lotId,
      (lotBalance.get(movement.lotId) ?? 0) +
        movement.quantityBase * movementFactor(movement.type),
    );
  }

  const today = new Date();
  const attention: PantryView["attention"] = [];

  const groupsView: PantryGroupView[] = rows.groups
    .filter((group) => group.active)
    .map((group) => {
      const groupItems = rows.items.filter(
        (item) => item.active && item.ingredientGroupId === group.id,
      );
      const itemViews = groupItems.map((item) => {
        const itemLots = rows.lots.filter(
          (lot) =>
            lot.commercialItemId === item.id &&
            balancesForLot(rows, lot.id).physicalBase > 0,
        );
        const availableBase = itemLots.reduce(
          (sum, lot) => sum + balancesForLot(rows, lot.id).availableBase,
          0,
        );
        const nextLot = [...itemLots]
          .filter((lot) => lot.expiryDate)
          .sort((left, right) =>
            (left.expiryDate ?? "9999").localeCompare(
              right.expiryDate ?? "9999",
            ),
          )[0];
        const nextExpiry = nextLot?.expiryDate ?? null;
        const daysUntilExpiry = nextExpiry
          ? Math.ceil(
              (new Date(`${nextExpiry}T12:00:00-03:00`).getTime() -
                today.getTime()) /
                86_400_000,
            )
          : null;
        const status =
          daysUntilExpiry !== null && daysUntilExpiry <= 14
            ? "attention"
            : "ok";
        const latestLot = [...itemLots].sort((left, right) =>
          right.entryDate.localeCompare(left.entryDate),
        )[0];
        const lots = [...itemLots]
          .sort((left, right) => {
            const expiry = (left.expiryDate ?? "9999").localeCompare(
              right.expiryDate ?? "9999",
            );
            return expiry || left.entryDate.localeCompare(right.entryDate);
          })
          .map((lot) => {
            const balance = balancesForLot(rows, lot.id);
            return {
              id: lot.id,
              lotCode: lot.lotCode,
              entryDate: lot.entryDate,
              expiryDate: lot.expiryDate,
              availableBase: balance.availableBase,
              availableLabel: quantityLabel(
                balance.availableBase,
                group.baseUnit,
              ),
              physicalBase: balance.physicalBase,
              physicalLabel: quantityLabel(
                balance.physicalBase,
                group.baseUnit,
              ),
              reservedBase: balance.reservedBase,
              reservedLabel: quantityLabel(
                balance.reservedBase,
                group.baseUnit,
              ),
              unitCost: lot.unitCostBase,
              inventoryValue: balance.physicalBase * lot.unitCostBase,
            };
          });

        if (
          nextLot?.expiryDate &&
          daysUntilExpiry !== null &&
          daysUntilExpiry <= 14
        ) {
          attention.push({
            id: `expiry-${nextLot.id}`,
            tone: "expiry",
            title: `${item.displayName} vence em ${daysUntilExpiry} dias`,
            detail: `${quantityLabel(lotBalance.get(nextLot.id) ?? 0, group.baseUnit)} · validade ${dateLabel(nextLot.expiryDate)}`,
          });
        }

        return {
          id: item.id,
          displayName: item.displayName,
          brandName: item.brandId
            ? (brandById.get(item.brandId)?.name ?? null)
            : null,
          packageLabel: packageLabel(item),
          availableBase,
          availableLabel: quantityLabel(availableBase, group.baseUnit),
          lotCount: itemLots.length,
          lastUnitCost: latestLot?.unitCostBase ?? 0,
          nextExpiry,
          nextExpiryLabel: nextExpiry ? dateLabel(nextExpiry) : null,
          status,
          lots,
        } as const;
      });

      const availableBase = itemViews.reduce(
        (sum, item) => sum + item.availableBase,
        0,
      );
      const status = availableBase < group.minimumStock ? "low" : "ok";
      if (status === "low") {
        attention.push({
          id: `low-${group.id}`,
          tone: "low",
          title: `${group.name} está abaixo do mínimo`,
          detail: `${quantityLabel(availableBase, group.baseUnit)} disponíveis · mínimo ${quantityLabel(group.minimumStock, group.baseUnit)}`,
        });
      }

      return {
        id: group.id,
        name: group.name,
        categoryId: group.categoryId,
        category: group.category,
        baseUnit: group.baseUnit,
        minimumStock: group.minimumStock,
        availableBase,
        availableLabel: quantityLabel(availableBase, group.baseUnit),
        status,
        items: itemViews,
      } as const;
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  const inventoryValue = rows.lots.reduce(
    (sum, lot) =>
      sum + balancesForLot(rows, lot.id).physicalBase * lot.unitCostBase,
    0,
  );

  const itemViewById = new Map(
    groupsView.flatMap((group) => group.items).map((item) => [item.id, item]),
  );
  const shoppingList = [
    ...new Set(
      rows.needs
        .filter((need) => need.status === "open" && need.commercialItemId)
        .map((need) => need.commercialItemId as string),
    ),
  ]
    .map((commercialItemId) => {
      const needs = rows.needs.filter(
        (need) =>
          need.status === "open" && need.commercialItemId === commercialItemId,
      );
      const item = rows.items.find((entry) => entry.id === commercialItemId);
      const group = rows.groups.find(
        (entry) => entry.id === item?.ingredientGroupId,
      );
      const neededBase = needs.reduce(
        (sum, need) => sum + need.shortageBase,
        0,
      );
      const availableBase =
        itemViewById.get(commercialItemId)?.availableBase ?? 0;
      const remainingBase = Math.max(0, neededBase - availableBase);
      const packageContentBase =
        item?.netContentBase ?? needs[0]?.packageContentBase ?? 1;
      return {
        commercialItemId,
        displayName:
          item?.displayName ?? needs[0]?.itemNameSnapshot ?? "Item da lista",
        packageLabel: item ? packageLabel(item) : "embalagem conhecida",
        neededBase,
        availableBase,
        remainingBase,
        remainingLabel: quantityLabel(remainingBase, group?.baseUnit ?? "g"),
        packagesToBuy: Math.ceil(remainingBase / packageContentBase),
        orderCount: new Set(needs.map((need) => need.orderId)).size,
        neededBy: needs.map((need) => need.neededBy.toISOString()).sort()[0]!,
      };
    })
    .filter((entry) => entry.remainingBase > 0)
    .sort((left, right) => left.neededBy.localeCompare(right.neededBy));

  return {
    tenantId,
    tenantName:
      tenantId === demoTenantId
        ? "Stefanie Dellavolpe Doces"
        : "Confeitaria Vizinha",
    ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
    categories: rows.categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      groupCount: rows.groups.filter(
        (group) => group.categoryId === category.id,
      ).length,
    })),
    summary: {
      groupCount: groupsView.length,
      itemCount: rows.items.filter((item) => item.active).length,
      openLotCount: rows.lots.filter(
        (lot) => balancesForLot(rows, lot.id).physicalBase > 0,
      ).length,
      inventoryValue,
    },
    attention: attention.slice(0, 4),
    shoppingList,
    groups: groupsView,
  };
}

@Injectable()
export class PantryService {
  private readonly memory = new Map<string, PantryRows>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getForTenant(tenantId: string) {
    if (!this.database.isConfigured) {
      const rows = this.memory.get(tenantId) ?? cloneDemoRows(tenantId);
      this.memory.set(tenantId, rows);
      return buildPantryView(tenantId, rows);
    }

    const rows = await this.database.withTenant(tenantId, (transaction) =>
      this.loadRows(transaction),
    );
    return buildPantryView(tenantId, rows);
  }

  async registerPurchase(
    tenantId: string,
    input: RegisterPurchaseInput,
  ): Promise<RegisterPurchaseResult> {
    if (!this.database.isConfigured) {
      this.registerInMemory(tenantId, input);
    } else {
      await this.database.withTenant(tenantId, (transaction) =>
        this.registerInDatabase(transaction, tenantId, input),
      );
    }

    return {
      message: "Compra registrada. O novo lote já está disponível na despensa.",
      pantry: await this.getForTenant(tenantId),
    };
  }

  async adjustInventory(
    tenantId: string,
    lotId: string,
    input: AdjustInventoryInput,
  ): Promise<PantryMutationResult> {
    let repeated = false;
    if (!this.database.isConfigured) {
      const rows = this.memory.get(tenantId) ?? cloneDemoRows(tenantId);
      this.memory.set(tenantId, rows);
      if (
        rows.movements.some(
          (movement) => movement.idempotencyKey === input.idempotencyKey,
        )
      ) {
        repeated = true;
      } else {
        const lot = rows.lots.find((entry) => entry.id === lotId);
        if (!lot) throw new NotFoundException("Este lote não foi encontrado.");
        const balance = balancesForLot(rows, lotId);
        if (input.countedQuantityBase < balance.reservedBase) {
          throw new ConflictException(
            `Há ${balance.reservedBase.toLocaleString("pt-BR")} já reservados. Revise os pedidos antes de reduzir a contagem abaixo disso.`,
          );
        }
        const delta =
          Math.round(
            (input.countedQuantityBase - balance.physicalBase) * 1000,
          ) / 1000;
        if (Math.abs(delta) < 0.001) {
          throw new ConflictException(
            "A contagem informada já é igual ao saldo físico deste lote.",
          );
        }
        rows.movements.push({
          id: randomUUID(),
          tenantId,
          lotId,
          type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantityBase: Math.abs(delta),
          occurredAt: new Date(),
          referenceType: "inventory_count",
          referenceId: input.idempotencyKey,
          reasonCode: input.reason.toUpperCase(),
          note: input.note,
          actorUserId: null,
          reversesMovementId: null,
          idempotencyKey: input.idempotencyKey,
        });
        lot.status = input.countedQuantityBase === 0 ? "depleted" : "available";
      }
    } else {
      repeated = await this.database.withTenant(
        tenantId,
        async (transaction) => {
          const [existing] = await transaction
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing) return true;
          const [lot] = await transaction
            .select()
            .from(purchaseLots)
            .where(eq(purchaseLots.id, lotId))
            .for("update")
            .limit(1);
          if (!lot)
            throw new NotFoundException("Este lote não foi encontrado.");
          const movements = await transaction
            .select()
            .from(stockMovements)
            .where(eq(stockMovements.lotId, lotId));
          const balance = balancesFromMovements(movements);
          if (input.countedQuantityBase < balance.reservedBase) {
            throw new ConflictException(
              `Há ${balance.reservedBase.toLocaleString("pt-BR")} já reservados. Revise os pedidos antes de reduzir a contagem abaixo disso.`,
            );
          }
          const delta =
            Math.round(
              (input.countedQuantityBase - balance.physicalBase) * 1000,
            ) / 1000;
          if (Math.abs(delta) < 0.001) {
            throw new ConflictException(
              "A contagem informada já é igual ao saldo físico deste lote.",
            );
          }
          await transaction.insert(stockMovements).values({
            tenantId,
            lotId,
            type: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantityBase: Math.abs(delta),
            referenceType: "inventory_count",
            referenceId: input.idempotencyKey,
            reasonCode: input.reason.toUpperCase(),
            note: input.note,
            idempotencyKey: input.idempotencyKey,
          });
          await transaction
            .update(purchaseLots)
            .set({
              status:
                input.countedQuantityBase === 0 ? "depleted" : "available",
            })
            .where(eq(purchaseLots.id, lotId));
          await transaction.insert(auditEvents).values({
            tenantId,
            eventType: "pantry.inventory_adjusted",
            correlationId: input.idempotencyKey,
            payload: {
              lotId,
              previousPhysicalBase: balance.physicalBase,
              countedQuantityBase: input.countedQuantityBase,
              delta,
              reason: input.reason,
            },
          });
          return false;
        },
      );
    }
    return {
      message: repeated
        ? "Esta contagem já havia sido registrada."
        : "Contagem conferida. A diferença ficou registrada no histórico do lote.",
      pantry: await this.getForTenant(tenantId),
      repeated,
    };
  }

  async registerLoss(
    tenantId: string,
    lotId: string,
    input: RegisterStockLossInput,
  ): Promise<PantryMutationResult> {
    let repeated = false;
    if (!this.database.isConfigured) {
      const rows = this.memory.get(tenantId) ?? cloneDemoRows(tenantId);
      this.memory.set(tenantId, rows);
      if (
        rows.movements.some(
          (movement) => movement.idempotencyKey === input.idempotencyKey,
        )
      ) {
        repeated = true;
      } else {
        const lot = rows.lots.find((entry) => entry.id === lotId);
        if (!lot) throw new NotFoundException("Este lote não foi encontrado.");
        const balance = balancesForLot(rows, lotId);
        if (input.quantityBase > balance.availableBase) {
          throw new ConflictException(
            `Há somente ${balance.availableBase.toLocaleString("pt-BR")} livres neste lote; o restante está reservado.`,
          );
        }
        rows.movements.push({
          id: randomUUID(),
          tenantId,
          lotId,
          type: "LOSS",
          quantityBase: input.quantityBase,
          occurredAt: new Date(),
          referenceType: "pantry_loss",
          referenceId: input.idempotencyKey,
          reasonCode: input.reason.toUpperCase(),
          note: input.note ?? null,
          actorUserId: null,
          reversesMovementId: null,
          idempotencyKey: input.idempotencyKey,
        });
        if (balance.physicalBase - input.quantityBase <= 0)
          lot.status = "depleted";
      }
    } else {
      repeated = await this.database.withTenant(
        tenantId,
        async (transaction) => {
          const [existing] = await transaction
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing) return true;
          const [lot] = await transaction
            .select()
            .from(purchaseLots)
            .where(eq(purchaseLots.id, lotId))
            .for("update")
            .limit(1);
          if (!lot)
            throw new NotFoundException("Este lote não foi encontrado.");
          const movements = await transaction
            .select()
            .from(stockMovements)
            .where(eq(stockMovements.lotId, lotId));
          const balance = balancesFromMovements(movements);
          if (input.quantityBase > balance.availableBase) {
            throw new ConflictException(
              `Há somente ${balance.availableBase.toLocaleString("pt-BR")} livres neste lote; o restante está reservado.`,
            );
          }
          await transaction.insert(stockMovements).values({
            tenantId,
            lotId,
            type: "LOSS",
            quantityBase: input.quantityBase,
            referenceType: "pantry_loss",
            referenceId: input.idempotencyKey,
            reasonCode: input.reason.toUpperCase(),
            note: input.note,
            idempotencyKey: input.idempotencyKey,
          });
          if (balance.physicalBase - input.quantityBase <= 0) {
            await transaction
              .update(purchaseLots)
              .set({ status: "depleted" })
              .where(eq(purchaseLots.id, lotId));
          }
          await transaction.insert(auditEvents).values({
            tenantId,
            eventType: "pantry.loss_registered",
            correlationId: input.idempotencyKey,
            payload: {
              lotId,
              quantityBase: input.quantityBase,
              reason: input.reason,
            },
          });
          return false;
        },
      );
    }
    return {
      message: repeated
        ? "Esta perda já havia sido registrada."
        : "Perda registrada. O saldo livre do lote já foi atualizado.",
      pantry: await this.getForTenant(tenantId),
      repeated,
    };
  }

  async createCategory(tenantId: string, input: CreateIngredientCategoryInput) {
    const normalizedName = normalize(input.name);
    let categoryId: string | null = null;
    if (!this.database.isConfigured) {
      const rows = this.memory.get(tenantId) ?? cloneDemoRows(tenantId);
      this.memory.set(tenantId, rows);
      if (
        rows.categories.some(
          (category) => category.normalizedName === normalizedName,
        )
      ) {
        throw new ConflictException("Esta categoria já existe.");
      }
      categoryId = randomUUID();
      rows.categories.push({
        id: categoryId,
        tenantId,
        name: input.name,
        normalizedName,
        kind: input.kind,
        active: true,
        createdAt: new Date(),
      });
    } else {
      await this.database.withTenant(tenantId, async (transaction) => {
        const existing = await transaction.select().from(ingredientCategories);
        if (
          existing.some(
            (category) => category.normalizedName === normalizedName,
          )
        ) {
          throw new ConflictException("Esta categoria já existe.");
        }
        const [created] = await transaction
          .insert(ingredientCategories)
          .values({
            tenantId,
            name: input.name,
            normalizedName,
            kind: input.kind,
          })
          .returning({ id: ingredientCategories.id });
        if (!created) throw new Error("Categoria não criada.");
        categoryId = created.id;
      });
    }
    if (!categoryId) throw new Error("Categoria não criada.");
    return {
      categoryId,
      message: "Categoria criada e pronta para organizar a despensa.",
      pantry: await this.getForTenant(tenantId),
    };
  }

  private async loadRows(transaction: AppTransaction): Promise<PantryRows> {
    const categories = await transaction
      .select()
      .from(ingredientCategories)
      .orderBy(asc(ingredientCategories.name));
    const groups = await transaction
      .select()
      .from(ingredientGroups)
      .orderBy(asc(ingredientGroups.name));
    const allBrands = await transaction
      .select()
      .from(brands)
      .orderBy(asc(brands.name));
    const items = await transaction
      .select()
      .from(commercialItems)
      .orderBy(asc(commercialItems.displayName));
    const lots = await transaction.select().from(purchaseLots);
    const movements = await transaction.select().from(stockMovements);
    const needs = await transaction.select().from(shoppingNeeds);
    return {
      categories,
      groups,
      brands: allBrands,
      items,
      lots,
      movements,
      needs,
    };
  }

  private registerInMemory(tenantId: string, input: RegisterPurchaseInput) {
    const rows = this.memory.get(tenantId) ?? cloneDemoRows(tenantId);
    this.memory.set(tenantId, rows);

    let item = input.commercialItemId
      ? rows.items.find((entry) => entry.id === input.commercialItemId)
      : undefined;

    if (input.commercialItemId && !item) {
      throw new NotFoundException("Item comercial não encontrado.");
    }

    if (!item && input.newItem) {
      const candidates = duplicateCandidates(input.newItem, rows);
      if (candidates.length > 0 && !input.forceCreate) {
        throw new ConflictException({
          code: "POSSIBLE_DUPLICATE",
          message: "Encontramos um item que pode ser o mesmo produto.",
          candidates,
        });
      }

      let group = rows.groups.find(
        (entry) => entry.normalizedName === normalize(input.newItem!.groupName),
      );
      if (!group) {
        const category = rows.categories.find(
          (entry) => entry.id === input.newItem!.categoryId,
        );
        if (!category) throw new NotFoundException("Categoria não encontrada.");
        group = {
          id: randomUUID(),
          tenantId,
          name: input.newItem.groupName,
          normalizedName: normalize(input.newItem.groupName),
          categoryId: category.id,
          category: category.name,
          baseDimension: input.newItem.baseDimension,
          baseUnit: input.newItem.baseDimension === "mass" ? "g" : "un",
          perishable: input.newItem.perishable,
          defaultDensityGml: null,
          minimumStock: 0,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.groups.push(group);
      }

      let brand = input.newItem.brandName
        ? rows.brands.find(
            (entry) =>
              entry.normalizedName === normalize(input.newItem!.brandName!),
          )
        : undefined;
      if (input.newItem.brandName && !brand) {
        brand = {
          id: randomUUID(),
          tenantId,
          name: input.newItem.brandName,
          normalizedName: normalize(input.newItem.brandName),
          createdAt: new Date(),
        };
        rows.brands.push(brand);
      }

      item = {
        id: randomUUID(),
        tenantId,
        ingredientGroupId: group.id,
        brandId: brand?.id ?? null,
        manufacturerName: null,
        displayName: input.newItem.displayName,
        normalizedName: normalize(input.newItem.displayName),
        gtin: input.newItem.gtin ?? null,
        packageQuantity: 1,
        packageUnit: input.newItem.packageUnit,
        netContentBase: input.newItem.netContentBase,
        conversionConfidence: "provided",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.items.push(item);
    }

    if (!item) throw new NotFoundException("Item comercial não encontrado.");
    const lotId = randomUUID();
    const quantityInitialBase = input.quantityPackages * item.netContentBase;
    const lot: PurchaseLotRow = {
      id: lotId,
      tenantId,
      commercialItemId: item.id,
      supplierName: input.supplierName ?? null,
      sourceDocumentId: null,
      entryDate: input.entryDate,
      expiryDate: input.expiryDate ?? null,
      quantityInitialBase,
      totalCost: input.totalCost,
      unitCostBase: input.totalCost / quantityInitialBase,
      lotCode: input.lotCode ?? null,
      source: "manual",
      status: "available",
      createdAt: new Date(),
    };
    rows.lots.push(lot);
    rows.movements.push({
      id: randomUUID(),
      tenantId,
      lotId,
      type: "PURCHASE_IN",
      quantityBase: quantityInitialBase,
      occurredAt: new Date(),
      referenceType: "purchase_lot",
      referenceId: lotId,
      reasonCode: null,
      note: null,
      actorUserId: null,
      reversesMovementId: null,
      idempotencyKey: null,
    });
  }

  private async registerInDatabase(
    transaction: AppTransaction,
    tenantId: string,
    input: RegisterPurchaseInput,
  ) {
    const rows = await this.loadRows(transaction);
    let item = input.commercialItemId
      ? rows.items.find((entry) => entry.id === input.commercialItemId)
      : undefined;

    if (input.commercialItemId && !item) {
      throw new NotFoundException("Item comercial não encontrado.");
    }

    if (!item && input.newItem) {
      const candidates = duplicateCandidates(input.newItem, rows);
      if (candidates.length > 0 && !input.forceCreate) {
        throw new ConflictException({
          code: "POSSIBLE_DUPLICATE",
          message: "Encontramos um item que pode ser o mesmo produto.",
          candidates,
        });
      }

      let group = rows.groups.find(
        (entry) => entry.normalizedName === normalize(input.newItem!.groupName),
      );
      if (!group) {
        const category = rows.categories.find(
          (entry) => entry.id === input.newItem!.categoryId,
        );
        if (!category) throw new NotFoundException("Categoria não encontrada.");
        [group] = await transaction
          .insert(ingredientGroups)
          .values({
            tenantId,
            name: input.newItem.groupName,
            normalizedName: normalize(input.newItem.groupName),
            categoryId: category.id,
            category: category.name,
            baseDimension: input.newItem.baseDimension,
            baseUnit: input.newItem.baseDimension === "mass" ? "g" : "un",
            perishable: input.newItem.perishable,
          })
          .returning();
      }
      if (!group)
        throw new NotFoundException("Ingrediente da receita não encontrado.");

      let brand = input.newItem.brandName
        ? rows.brands.find(
            (entry) =>
              entry.normalizedName === normalize(input.newItem!.brandName!),
          )
        : undefined;
      if (input.newItem.brandName && !brand) {
        [brand] = await transaction
          .insert(brands)
          .values({
            tenantId,
            name: input.newItem.brandName,
            normalizedName: normalize(input.newItem.brandName),
          })
          .returning();
      }

      [item] = await transaction
        .insert(commercialItems)
        .values({
          tenantId,
          ingredientGroupId: group.id,
          brandId: brand?.id,
          displayName: input.newItem.displayName,
          normalizedName: normalize(input.newItem.displayName),
          gtin: input.newItem.gtin,
          packageUnit: input.newItem.packageUnit,
          netContentBase: input.newItem.netContentBase,
        })
        .returning();
    }

    if (!item) throw new NotFoundException("Item comercial não encontrado.");
    const quantityInitialBase = input.quantityPackages * item.netContentBase;
    const [lot] = await transaction
      .insert(purchaseLots)
      .values({
        tenantId,
        commercialItemId: item.id,
        supplierName: input.supplierName,
        entryDate: input.entryDate,
        expiryDate: input.expiryDate,
        quantityInitialBase,
        totalCost: input.totalCost,
        unitCostBase: input.totalCost / quantityInitialBase,
        lotCode: input.lotCode,
      })
      .returning();
    if (!lot) throw new NotFoundException("Não foi possível criar o lote.");
    await transaction.insert(stockMovements).values({
      tenantId,
      lotId: lot.id,
      type: "PURCHASE_IN",
      quantityBase: quantityInitialBase,
      referenceType: "purchase_lot",
      referenceId: lot.id,
    });
    await transaction.insert(auditEvents).values({
      tenantId,
      eventType: "pantry.purchase_registered",
      correlationId: randomUUID(),
      payload: {
        commercialItemId: item.id,
        purchaseLotId: lot.id,
        quantityInitialBase,
        totalCost: input.totalCost,
      },
    });
  }
}
