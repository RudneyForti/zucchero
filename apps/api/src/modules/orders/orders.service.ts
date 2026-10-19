import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { appendOutboxEvent } from "../async/outbox";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  commercialItems,
  customerAddresses,
  customers,
  equipmentAssets,
  equipmentUnavailability,
  ingredientGroups,
  inventoryReservations,
  orderDirectExpenses,
  orderItems,
  orderReceipts,
  orderRequirements,
  orders,
  purchaseLots,
  productionMoments,
  productionPlans,
  productionConsumptionCorrectionLines,
  productionTaskConsumptions,
  productionTasks,
  recipeLines,
  recipes,
  recipeSubrecipeLines,
  recipeVersions,
  shoppingNeeds,
  stockMovements,
  tenantOrderSequences,
  tenants,
  tenantSettings,
} from "../../database/schema";
import {
  buildRemainingProductionSchedule,
  instantiateProductionPlan,
} from "../production/production.planning";
import { summarizeConsumptionVariance } from "../production/production.variance";
import { buildOrderCostResult } from "./orders.cost-result";
import { buildOrderDirectExpenseResult } from "./orders.direct-expense-result";
import { buildOrderPaymentResult } from "./orders.payment-result";
import type {
  ConfirmOrderInput,
  ConfirmOrderResult,
  DeliveryQuote,
  DeliveryQuoteRequest,
  OrderAvailability,
  OrderLifecycleStatus,
  OrderSummary,
  OrderWorkspace,
  MutateDirectExpenseResult,
  MutateReceiptResult,
  RegisterDirectExpenseInput,
  RegisterReceiptInput,
  ReplanOrderInput,
  ReplanOrderResult,
  ReverseReceiptInput,
  ReverseDirectExpenseInput,
  UpdateOrderStatusInput,
  UpdateOrderStatusResult,
} from "./orders.contract";
import {
  DeliveryRoutingError,
  GoogleRoutesService,
} from "./google-routes.service";

type RecipeRow = typeof recipes.$inferSelect;
type VersionRow = typeof recipeVersions.$inferSelect;
type LineRow = typeof recipeLines.$inferSelect;
type GroupRow = typeof ingredientGroups.$inferSelect;
type CommercialItemRow = typeof commercialItems.$inferSelect;
type LotRow = typeof purchaseLots.$inferSelect;
type MovementRow = typeof stockMovements.$inferSelect;
type SubrecipeRow = typeof recipeSubrecipeLines.$inferSelect;

type CalculatedRequirement = {
  line: LineRow;
  ingredientName: string;
  requiredBase: number;
  availableBase: number;
  shortageBase: number;
  status: OrderAvailability;
  purchaseItem: CommercialItemRow | null;
  packagesToBuy: number;
  purchaseQuantityBase: number;
  reservations: Array<{ lotId: string; quantityBase: number }>;
  ingredientCost: number;
};

type Calculation = {
  productionMassG: number;
  factor: number;
  ingredientCost: number;
  totalCost: number;
  price: number;
  availability: OrderAvailability;
  requirements: CalculatedRequirement[];
};

type MemoryOrder = OrderSummary & { idempotencyKey: string };

const activeStatuses = new Set<OrderLifecycleStatus>([
  "confirmed",
  "in_production",
  "ready",
]);

const allowedTransitions: Record<OrderLifecycleStatus, OrderLifecycleStatus[]> =
  {
    confirmed: ["in_production", "cancelled"],
    in_production: ["ready", "cancelled"],
    ready: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };

function publicOrder(entry: MemoryOrder): OrderSummary {
  return {
    id: entry.id,
    orderNumber: entry.orderNumber,
    status: entry.status,
    customerName: entry.customerName,
    recipeName: entry.recipeName,
    recipeVersionNumber: entry.recipeVersionNumber,
    requestedMassG: entry.requestedMassG,
    deliveryMode: entry.deliveryMode,
    deliveryArrangement: entry.deliveryArrangement,
    deliveryProvider: entry.deliveryProvider,
    paymentMethod: entry.paymentMethod,
    deliveryAt: entry.deliveryAt,
    price: entry.price,
    availability: entry.availability,
    purchaseNeedCount: entry.purchaseNeedCount,
    confirmedAt: entry.confirmedAt,
    startedAt: entry.startedAt,
    readyAt: entry.readyAt,
    completedAt: entry.completedAt,
    cancelledAt: entry.cancelledAt,
    cancellationReason: entry.cancellationReason,
    deliveryCost: entry.deliveryCost,
    costResult: entry.costResult,
    paymentResult: entry.paymentResult,
    directExpenseResult: entry.directExpenseResult,
    productionVariance: entry.productionVariance,
  };
}

const demoRecipeId = "81111111-1111-4111-8111-111111111111";
const demoRecipeVersionId = "82111111-1111-4111-8111-111111111111";

function movementFactor(type: MovementRow["type"]) {
  if (["PURCHASE_IN", "ADJUSTMENT_IN", "RETURN_IN", "RELEASE"].includes(type))
    return 1;
  if (
    ["ADJUSTMENT_OUT", "CONSUME", "LOSS", "RETURN_OUT", "RESERVE"].includes(
      type,
    )
  )
    return -1;
  return 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function completeAddress(parts: Array<string | null | undefined>) {
  return [...parts.filter((part) => part?.trim()), "Brasil"].join(", ");
}

function overallAvailability(
  requirements: CalculatedRequirement[],
): OrderAvailability {
  if (requirements.some((entry) => entry.status === "unavailable"))
    return "unavailable";
  if (requirements.some((entry) => entry.status === "partial"))
    return "partial";
  if (requirements.some((entry) => entry.status === "substitution"))
    return "substitution";
  return "available";
}

export function explodeRecipeLines(
  rootRecipeVersionId: string,
  lines: LineRow[],
  versions: VersionRow[],
  subrecipes: SubrecipeRow[],
) {
  const result: LineRow[] = [];

  function visit(versionId: string, multiplier: number, trail: Set<string>) {
    if (trail.has(versionId)) {
      throw new ConflictException(
        "As sub-receitas formam um ciclo e não podem ser calculadas.",
      );
    }
    const nextTrail = new Set(trail).add(versionId);
    lines
      .filter((line) => line.recipeVersionId === versionId)
      .forEach((line) =>
        result.push({ ...line, quantityG: line.quantityG * multiplier }),
      );
    subrecipes
      .filter((line) => line.recipeVersionId === versionId)
      .sort((left, right) => left.position - right.position)
      .forEach((line) => {
        const referenced = versions.find(
          (version) => version.id === line.referencedRecipeVersionId,
        );
        if (!referenced || referenced.status !== "published") {
          throw new ConflictException(
            "Uma sub-receita publicada não está mais disponível.",
          );
        }
        visit(
          referenced.id,
          multiplier * (line.requiredYieldG / referenced.yieldMassG),
          nextTrail,
        );
      });
  }

  visit(rootRecipeVersionId, 1, new Set());
  return result;
}

async function loadExplodedRecipeLines(
  transaction: AppTransaction,
  rootRecipeVersionId: string,
) {
  const [allLines, allVersions, allSubrecipes] = await Promise.all([
    transaction.select().from(recipeLines),
    transaction.select().from(recipeVersions),
    transaction.select().from(recipeSubrecipeLines),
  ]);
  return explodeRecipeLines(
    rootRecipeVersionId,
    allLines,
    allVersions,
    allSubrecipes,
  );
}

function calculate(
  input: ConfirmOrderInput,
  version: VersionRow,
  lines: LineRow[],
  groups: GroupRow[],
  items: CommercialItemRow[],
  lots: LotRow[],
  movements: MovementRow[],
): Calculation {
  const productionMassG =
    Math.ceil(input.requestedMassG / input.productionIncrementG) *
    input.productionIncrementG;
  const factor = productionMassG / version.yieldMassG;
  const lotBalance = new Map<string, number>();
  for (const movement of movements) {
    lotBalance.set(
      movement.lotId,
      (lotBalance.get(movement.lotId) ?? 0) +
        movement.quantityBase * movementFactor(movement.type),
    );
  }

  const requirements = lines
    .sort((left, right) => left.position - right.position)
    .map((line): CalculatedRequirement => {
      const group = groups.find((entry) => entry.id === line.ingredientGroupId);
      const groupItems = items.filter(
        (item) =>
          item.active && item.ingredientGroupId === line.ingredientGroupId,
      );
      const preferredItem = groupItems.find(
        (item) => item.id === line.preferredCommercialItemId,
      );
      const eligibleItems =
        line.selectionPolicy === "required"
          ? groupItems.filter(
              (item) => item.id === line.preferredCommercialItemId,
            )
          : [...groupItems].sort((left, right) => {
              if (left.id === line.preferredCommercialItemId) return -1;
              if (right.id === line.preferredCommercialItemId) return 1;
              return 0;
            });
      const eligibleIds = new Set(eligibleItems.map((item) => item.id));
      const eligibleLots = lots
        .filter(
          (lot) =>
            eligibleIds.has(lot.commercialItemId) &&
            (lotBalance.get(lot.id) ?? 0) > 0,
        )
        .sort((left, right) => {
          const expiry = (left.expiryDate ?? "9999-12-31").localeCompare(
            right.expiryDate ?? "9999-12-31",
          );
          return expiry || left.entryDate.localeCompare(right.entryDate);
        });
      const availableBase = eligibleLots.reduce(
        (total, lot) => total + (lotBalance.get(lot.id) ?? 0),
        0,
      );
      const preferredAvailable = preferredItem
        ? lots
            .filter((lot) => lot.commercialItemId === preferredItem.id)
            .reduce(
              (total, lot) => total + Math.max(0, lotBalance.get(lot.id) ?? 0),
              0,
            )
        : 0;
      const requiredBase = Math.ceil(
        line.quantityG * factor * (1 + line.wastePercentage / 100),
      );
      const shortageBase = Math.max(0, requiredBase - availableBase);
      let status: OrderAvailability = "available";
      if (
        line.selectionPolicy === "preferred" &&
        preferredAvailable < requiredBase &&
        availableBase >= requiredBase
      ) {
        status = "substitution";
      } else if (shortageBase > 0) {
        status = availableBase > 0 ? "partial" : "unavailable";
      }

      const purchaseItem = preferredItem ?? groupItems[0] ?? null;
      const packageContentBase = purchaseItem?.netContentBase ?? 0;
      const packagesToBuy =
        shortageBase > 0
          ? packageContentBase > 0
            ? Math.ceil(shortageBase / packageContentBase)
            : 1
          : 0;
      const reservations: CalculatedRequirement["reservations"] = [];
      let remaining = Math.min(requiredBase, availableBase);
      for (const lot of eligibleLots) {
        if (remaining <= 0) break;
        const quantityBase = Math.min(remaining, lotBalance.get(lot.id) ?? 0);
        if (quantityBase > 0) {
          reservations.push({ lotId: lot.id, quantityBase });
          lotBalance.set(
            lot.id,
            Math.max(0, (lotBalance.get(lot.id) ?? 0) - quantityBase),
          );
          remaining -= quantityBase;
        }
      }

      const referenceItem = preferredItem ?? eligibleItems[0];
      const latestReferenceLot = lots
        .filter((lot) => lot.commercialItemId === referenceItem?.id)
        .sort((left, right) =>
          right.entryDate.localeCompare(left.entryDate),
        )[0];

      return {
        line,
        ingredientName: group?.name ?? "Ingrediente",
        requiredBase,
        availableBase,
        shortageBase,
        status,
        purchaseItem,
        packagesToBuy,
        purchaseQuantityBase:
          packageContentBase > 0
            ? packagesToBuy * packageContentBase
            : shortageBase,
        reservations,
        ingredientCost: requiredBase * (latestReferenceLot?.unitCostBase ?? 0),
      };
    });

  const ingredientCost = roundMoney(
    requirements.reduce((total, entry) => total + entry.ingredientCost, 0),
  );
  const totalCost = roundMoney(ingredientCost + input.additionalCost);
  const price = roundMoney(
    totalCost / (1 - input.targetMarginPercentage / 100),
  );

  return {
    productionMassG,
    factor,
    ingredientCost,
    totalCost,
    price,
    availability: overallAvailability(requirements),
    requirements,
  };
}

function demoRows(tenantId: string) {
  const createdAt = new Date("2026-08-24T12:00:00-03:00");
  const recipe: RecipeRow = {
    id: demoRecipeId,
    tenantId,
    name: "Bolo de chocolate",
    normalizedName: "bolo de chocolate",
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
  const version: VersionRow = {
    id: demoRecipeVersionId,
    tenantId,
    recipeId: recipe.id,
    versionNumber: 1,
    status: "published",
    yieldMassG: 1_200,
    yieldUnits: 12,
    expectedLossPercentage: 3,
    minimumBatchFactor: 0.25,
    roundingRule: "proportional",
    sourceName: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceAccessedAt: null,
    importMethod: null,
    importWarnings: [],
    publishedAt: createdAt,
    createdAt,
  };
  const groups = [
    ["31111111-1111-4111-8111-111111111111", "Chocolate meio amargo"],
    ["32222222-2222-4222-8222-222222222222", "Chantilly"],
  ].map(([id, name], index): GroupRow => ({
    id: id!,
    tenantId,
    name: name!,
    normalizedName: name!.toLocaleLowerCase("pt-BR"),
    categoryId:
      index === 0
        ? "21111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222223",
    category: index === 0 ? "Chocolates e cacaus" : "Cremes e laticínios",
    baseDimension: "mass",
    baseUnit: "g",
    perishable: index === 1,
    defaultDensityGml: index === 1 ? 1 : null,
    minimumStock: index === 0 ? 1_500 : 1_000,
    active: true,
    createdAt,
    updatedAt: createdAt,
  }));
  const items: CommercialItemRow[] = [
    {
      id: "51111111-1111-4111-8111-111111111111",
      tenantId,
      ingredientGroupId: groups[0]!.id,
      brandId: null,
      manufacturerName: null,
      displayName: "Harald Melken meio amargo 1,01 kg",
      normalizedName: "harald melken meio amargo 1 01 kg",
      gtin: null,
      packageQuantity: 1,
      packageUnit: "kg",
      netContentBase: 1_010,
      conversionConfidence: "provided",
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "53333333-3333-4333-8333-333333333333",
      tenantId,
      ingredientGroupId: groups[1]!.id,
      brandId: null,
      manufacturerName: null,
      displayName: "Chantilly Amélia 1 L",
      normalizedName: "chantilly amelia 1 l",
      gtin: null,
      packageQuantity: 1,
      packageUnit: "l",
      netContentBase: 1_000,
      conversionConfidence: "provided",
      active: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const lines: LineRow[] = [
    {
      id: randomUUID(),
      tenantId,
      recipeVersionId: version.id,
      recipeStepId: null,
      ingredientGroupId: groups[0]!.id,
      quantityG: 500,
      inputQuantity: 500,
      inputUnit: "g",
      conversionFactorToG: 1,
      conversionSource: null,
      conversionConfidence: "provided",
      notes: null,
      selectionPolicy: "preferred",
      preferredCommercialItemId: items[0]!.id,
      wastePercentage: 2,
      position: 0,
    },
    {
      id: randomUUID(),
      tenantId,
      recipeVersionId: version.id,
      recipeStepId: null,
      ingredientGroupId: groups[1]!.id,
      quantityG: 300,
      inputQuantity: 300,
      inputUnit: "g",
      conversionFactorToG: 1,
      conversionSource: null,
      conversionConfidence: "provided",
      notes: null,
      selectionPolicy: "preferred",
      preferredCommercialItemId: items[1]!.id,
      wastePercentage: 0,
      position: 1,
    },
  ];
  const lots: LotRow[] = [
    {
      id: "61111111-1111-4111-8111-111111111111",
      tenantId,
      commercialItemId: items[0]!.id,
      supplierName: null,
      sourceDocumentId: null,
      entryDate: "2026-08-18",
      expiryDate: "2027-02-20",
      quantityInitialBase: 3_030,
      totalCost: 99.7,
      unitCostBase: 67.8 / 2_020,
      lotCode: null,
      source: "manual",
      status: "available",
      createdAt,
    },
    {
      id: "63333333-3333-4333-8333-333333333333",
      tenantId,
      commercialItemId: items[1]!.id,
      supplierName: null,
      sourceDocumentId: null,
      entryDate: "2026-08-22",
      expiryDate: "2026-09-03",
      quantityInitialBase: 1_000,
      totalCost: 19.9,
      unitCostBase: 19.9 / 1_000,
      lotCode: null,
      source: "manual",
      status: "available",
      createdAt,
    },
  ];
  const movements = lots.map((lot): MovementRow => ({
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
  return { recipe, version, lines, groups, items, lots, movements };
}

@Injectable()
export class OrdersService {
  private readonly memory = new Map<string, MemoryOrder[]>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GoogleRoutesService)
    private readonly googleRoutes: GoogleRoutesService = new GoogleRoutesService(),
  ) {}

  async getForTenant(tenantId: string): Promise<OrderWorkspace> {
    if (!this.database.isConfigured) {
      return this.workspaceFrom(
        this.memory.get(tenantId)?.map(publicOrder) ?? [],
      );
    }
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadWorkspace(transaction),
    );
  }

  async quoteDelivery(
    tenantId: string,
    input: DeliveryQuoteRequest,
  ): Promise<DeliveryQuote> {
    if (!this.database.isConfigured) {
      throw new ServiceUnavailableException(
        "O cálculo de entrega precisa do banco da confeitaria configurado.",
      );
    }

    const context = await this.loadDeliveryContext(tenantId, input);
    try {
      return await this.googleRoutes.calculate({
        tenantId,
        customerId: input.customerId,
        customerAddressId: input.customerAddressId,
        origin: context.origin,
        destination: context.destination,
        costPerKm: context.costPerKm,
      });
    } catch (error) {
      if (error instanceof DeliveryRoutingError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  async confirm(
    tenantId: string,
    input: ConfirmOrderInput,
  ): Promise<ConfirmOrderResult> {
    if (!this.database.isConfigured)
      return this.confirmInMemory(tenantId, input);

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [repeated] = await transaction
          .select()
          .from(orders)
          .where(eq(orders.idempotencyKey, input.idempotencyKey));
        if (repeated) {
          return { repeated: true, orderId: repeated.id };
        }

        const [recipe] = await transaction
          .select()
          .from(recipes)
          .where(eq(recipes.id, input.recipeId));
        if (!recipe)
          throw new NotFoundException("A receita não foi encontrada.");
        const [version] = await transaction
          .select()
          .from(recipeVersions)
          .where(
            and(
              eq(recipeVersions.recipeId, recipe.id),
              eq(recipeVersions.versionNumber, input.recipeVersionNumber),
            ),
          );
        if (
          !version ||
          version.versionNumber !== input.recipeVersionNumber ||
          version.status !== "published"
        ) {
          throw new ConflictException(
            "A versão escolhida não é mais a publicada. Revise a encomenda.",
          );
        }

        const [customer] = await transaction
          .select()
          .from(customers)
          .where(eq(customers.id, input.customerId));
        if (!customer)
          throw new NotFoundException(
            "A cliente escolhida não foi encontrada.",
          );

        const deliveryArrangement =
          input.deliveryMode === "delivery"
            ? (input.deliveryArrangement ?? "own")
            : null;
        const deliveryProvider =
          deliveryArrangement === "integrated_partner"
            ? (input.deliveryProvider ?? null)
            : null;
        if (deliveryArrangement === "integrated_partner") {
          throw new ConflictException(
            "A plataforma escolhida ainda não está conectada à Zucchero.",
          );
        }

        let deliveryCost = 0;
        let deliveryAddress:
          | Awaited<ReturnType<typeof this.loadDeliveryContextFromTransaction>>
          | undefined;
        if (input.deliveryMode === "delivery") {
          if (!input.customerAddressId) {
            throw new ConflictException(
              "Escolha um endereço cadastrado da cliente para calcular a entrega.",
            );
          }
          deliveryAddress = await this.loadDeliveryContextFromTransaction(
            transaction,
            tenantId,
            {
              customerId: customer.id,
              customerAddressId: input.customerAddressId,
            },
          );
          if (deliveryArrangement === "own" && deliveryAddress.costPerKm > 0) {
            if (!input.deliveryQuoteToken) {
              throw new ConflictException(
                "Calcule a rota da entrega antes de confirmar a encomenda.",
              );
            }
            const verifiedQuote = this.googleRoutes.verifyQuote(
              input.deliveryQuoteToken,
              {
                tenantId,
                customerId: customer.id,
                customerAddressId: input.customerAddressId,
                origin: deliveryAddress.origin,
                destination: deliveryAddress.destination,
                costPerKm: deliveryAddress.costPerKm,
              },
            );
            if (!verifiedQuote) {
              throw new ConflictException(
                "O cálculo da entrega venceu ou os endereços mudaram. Calcule a rota novamente.",
              );
            }
            deliveryCost = verifiedQuote.deliveryCost;
          }
        }

        const pricedAdditionalCost = roundMoney(
          input.additionalCost + deliveryCost,
        );

        const [lines, groups, items, lots, movements] = await Promise.all([
          loadExplodedRecipeLines(transaction, version.id),
          transaction.select().from(ingredientGroups),
          transaction.select().from(commercialItems),
          transaction.select().from(purchaseLots),
          transaction.select().from(stockMovements),
        ]);
        const calculation = calculate(
          { ...input, additionalCost: pricedAdditionalCost },
          version,
          lines,
          groups,
          items,
          lots,
          movements,
        );

        await transaction
          .insert(tenantOrderSequences)
          .values({ tenantId, nextNumber: 1 })
          .onConflictDoNothing();
        const [sequence] = await transaction
          .update(tenantOrderSequences)
          .set({ nextNumber: sql`${tenantOrderSequences.nextNumber} + 1` })
          .where(eq(tenantOrderSequences.tenantId, tenantId))
          .returning({ nextNumber: tenantOrderSequences.nextNumber });
        const orderNumber = (sequence?.nextNumber ?? 2) - 1;

        const [storedOrder] = await transaction
          .insert(orders)
          .values({
            tenantId,
            orderNumber,
            idempotencyKey: input.idempotencyKey,
            status: "confirmed",
            customerId: customer.id,
            customerNameSnapshot: customer.name,
            customerPhoneSnapshot: customer.primaryPhone,
            deliveryMode: input.deliveryMode,
            deliveryArrangement,
            deliveryProvider,
            addressSnapshot:
              input.deliveryMode === "delivery"
                ? {
                    label: deliveryAddress?.address.label ?? input.addressLabel,
                    formatted:
                      deliveryAddress?.address.formattedAddress ??
                      input.address,
                  }
                : null,
            deliveryAt: new Date(input.deliveryAt),
            notes: input.notes,
            ingredientCost: calculation.ingredientCost,
            additionalCost: pricedAdditionalCost,
            deliveryCost,
            totalCost: calculation.totalCost,
            targetMarginBasisPoints: Math.round(
              input.targetMarginPercentage * 100,
            ),
            price: calculation.price,
            depositBasisPoints: Math.round(input.depositPercentage * 100),
            paymentMethod: input.paymentMethod,
            availability: calculation.availability,
          })
          .returning();
        if (!storedOrder)
          throw new ConflictException(
            "Não foi possível confirmar a encomenda.",
          );

        const [storedItem] = await transaction
          .insert(orderItems)
          .values({
            tenantId,
            orderId: storedOrder.id,
            recipeId: recipe.id,
            recipeVersionId: version.id,
            recipeNameSnapshot: recipe.name,
            recipeVersionNumber: version.versionNumber,
            requestedMassG: input.requestedMassG,
            productionMassG: calculation.productionMassG,
            scaleFactor: calculation.factor,
            ingredientCost: calculation.ingredientCost,
            price: calculation.price,
          })
          .returning();
        if (!storedItem)
          throw new ConflictException("Não foi possível preservar o item.");

        await instantiateProductionPlan(transaction, {
          tenantId,
          orderId: storedOrder.id,
          orderItemId: storedItem.id,
          recipeVersionId: version.id,
          productName: recipe.name,
          scaleFactor: calculation.factor,
          productionMassG: calculation.productionMassG,
          deliveryAt: new Date(input.deliveryAt),
        });

        for (const requirement of calculation.requirements) {
          const [storedRequirement] = await transaction
            .insert(orderRequirements)
            .values({
              tenantId,
              orderId: storedOrder.id,
              orderItemId: storedItem.id,
              sourceRecipeLineId: requirement.line.id,
              ingredientGroupId: requirement.line.ingredientGroupId,
              ingredientNameSnapshot: requirement.ingredientName,
              preferredCommercialItemId:
                requirement.line.preferredCommercialItemId,
              selectionPolicy: requirement.line.selectionPolicy,
              requiredBase: requirement.requiredBase,
              availableAtConfirmationBase: requirement.availableBase,
              shortageBase: requirement.shortageBase,
              status: requirement.status,
            })
            .returning();
          if (!storedRequirement) continue;

          if (requirement.shortageBase > 0 && requirement.purchaseItem) {
            await transaction.insert(shoppingNeeds).values({
              tenantId,
              orderId: storedOrder.id,
              requirementId: storedRequirement.id,
              commercialItemId: requirement.purchaseItem.id,
              itemNameSnapshot: requirement.purchaseItem.displayName,
              shortageBase: requirement.shortageBase,
              packageContentBase: requirement.purchaseItem.netContentBase,
              packagesToBuy: requirement.packagesToBuy,
              purchaseQuantityBase: requirement.purchaseQuantityBase,
              neededBy: new Date(input.deliveryAt),
            });
          }

          for (const reservation of requirement.reservations) {
            await transaction.insert(inventoryReservations).values({
              tenantId,
              orderId: storedOrder.id,
              requirementId: storedRequirement.id,
              lotId: reservation.lotId,
              quantityBase: reservation.quantityBase,
            });
            await transaction.insert(stockMovements).values({
              tenantId,
              lotId: reservation.lotId,
              type: "RESERVE",
              quantityBase: reservation.quantityBase,
              referenceType: "order",
              referenceId: storedOrder.id,
              note: `Reserva do pedido #${orderNumber}`,
            });
          }
        }

        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "ORDER_CONFIRMED",
          correlationId: input.idempotencyKey,
          payload: {
            orderId: storedOrder.id,
            orderNumber,
            recipeVersionId: version.id,
            price: calculation.price,
            deliveryCost,
          },
        });
        await appendOutboxEvent(transaction, {
          tenantId,
          eventType: "order.confirmed",
          aggregateType: "order",
          aggregateId: storedOrder.id,
          correlationId: input.idempotencyKey,
          payload: {
            orderNumber,
            recipeVersionId: version.id,
            deliveryAt: input.deliveryAt,
          },
        });
        return { repeated: false, orderId: storedOrder.id };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === result.orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: result.repeated
        ? `O pedido #${order.orderNumber} já estava confirmado.`
        : `Pedido #${order.orderNumber} confirmado e reservado.`,
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    input: UpdateOrderStatusInput,
  ): Promise<UpdateOrderStatusResult> {
    if (!this.database.isConfigured) {
      return this.updateStatusInMemory(tenantId, orderId, input);
    }

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [storedOrder] = await transaction
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for("update");
        if (!storedOrder) {
          throw new NotFoundException("A encomenda não foi encontrada.");
        }

        if (storedOrder.status === input.status) {
          return { repeated: true };
        }
        if (!allowedTransitions[storedOrder.status].includes(input.status)) {
          throw new ConflictException(
            "Esse passo não combina com o momento atual da encomenda.",
          );
        }

        const occurredAt = new Date();
        if (input.status === "cancelled" || input.status === "completed") {
          const [reservations, reserveMovements] = await Promise.all([
            transaction
              .select()
              .from(inventoryReservations)
              .where(
                and(
                  eq(inventoryReservations.orderId, storedOrder.id),
                  isNull(inventoryReservations.releasedAt),
                ),
              ),
            transaction
              .select()
              .from(stockMovements)
              .where(
                and(
                  eq(stockMovements.type, "RESERVE"),
                  eq(stockMovements.referenceType, "order"),
                  eq(stockMovements.referenceId, storedOrder.id),
                ),
              ),
          ]);
          const reversedMovementIds = new Set<string>();
          for (const reservation of reservations) {
            const reserveMovement = reserveMovements.find(
              (movement) =>
                !reversedMovementIds.has(movement.id) &&
                movement.lotId === reservation.lotId &&
                Math.abs(movement.quantityBase - reservation.quantityBase) <
                  0.001,
            );
            if (reserveMovement) reversedMovementIds.add(reserveMovement.id);
            await transaction.insert(stockMovements).values({
              tenantId,
              lotId: reservation.lotId,
              type: "RELEASE",
              quantityBase: reservation.quantityBase,
              occurredAt,
              referenceType:
                input.status === "cancelled"
                  ? "order_cancellation"
                  : "order_completion",
              referenceId: storedOrder.id,
              reasonCode:
                input.status === "cancelled"
                  ? "ORDER_CANCELLED"
                  : "ORDER_COMPLETED",
              note:
                input.status === "cancelled"
                  ? `Liberação do pedido #${storedOrder.orderNumber}: ${input.cancellationReason}`
                  : `Reserva conciliada ao concluir o pedido #${storedOrder.orderNumber}`,
              reversesMovementId: reserveMovement?.id,
            });
            if (input.status === "completed") {
              await transaction.insert(stockMovements).values({
                tenantId,
                lotId: reservation.lotId,
                type: "CONSUME",
                quantityBase: reservation.quantityBase,
                occurredAt,
                referenceType: "order",
                referenceId: storedOrder.id,
                reasonCode: "ORDER_COMPLETED",
                note: `Consumo consolidado do pedido #${storedOrder.orderNumber}`,
              });
            }
          }
          if (reservations.length > 0) {
            await transaction
              .update(inventoryReservations)
              .set({ releasedAt: occurredAt })
              .where(
                and(
                  eq(inventoryReservations.orderId, storedOrder.id),
                  isNull(inventoryReservations.releasedAt),
                ),
              );
          }
          await transaction
            .update(shoppingNeeds)
            .set({ status: "cancelled" })
            .where(
              and(
                eq(shoppingNeeds.orderId, storedOrder.id),
                eq(shoppingNeeds.status, "open"),
              ),
            );
        }

        const statusUpdate: Partial<typeof orders.$inferInsert> = {
          status: input.status,
        };
        if (input.status === "in_production") {
          statusUpdate.startedAt = occurredAt;
        } else if (input.status === "ready") {
          statusUpdate.readyAt = occurredAt;
        } else if (input.status === "completed") {
          statusUpdate.completedAt = occurredAt;
        } else {
          statusUpdate.cancelledAt = occurredAt;
          statusUpdate.cancellationReason = input.cancellationReason;
        }
        await transaction
          .update(orders)
          .set(statusUpdate)
          .where(eq(orders.id, storedOrder.id));

        const storedPlans = await transaction
          .select()
          .from(productionPlans)
          .where(eq(productionPlans.orderId, storedOrder.id));
        for (const plan of storedPlans) {
          if (input.status === "cancelled") {
            await Promise.all([
              transaction
                .update(productionTasks)
                .set({ status: "cancelled", updatedAt: occurredAt })
                .where(
                  and(
                    eq(productionTasks.productionPlanId, plan.id),
                    ne(productionTasks.status, "completed"),
                  ),
                ),
              transaction
                .update(productionMoments)
                .set({ status: "cancelled", updatedAt: occurredAt })
                .where(
                  and(
                    eq(productionMoments.productionPlanId, plan.id),
                    ne(productionMoments.status, "completed"),
                  ),
                ),
              transaction
                .update(productionPlans)
                .set({
                  status: "cancelled",
                  cancelledAt: occurredAt,
                  updatedAt: occurredAt,
                })
                .where(eq(productionPlans.id, plan.id)),
            ]);
          } else if (input.status === "completed") {
            await transaction
              .update(productionPlans)
              .set({
                status: "completed",
                completedAt: occurredAt,
                updatedAt: occurredAt,
              })
              .where(eq(productionPlans.id, plan.id));
          } else if (input.status === "in_production") {
            await transaction
              .update(productionPlans)
              .set({
                status: "in_progress",
                startedAt: plan.startedAt ?? occurredAt,
                updatedAt: occurredAt,
              })
              .where(eq(productionPlans.id, plan.id));
          } else if (input.status === "ready") {
            await transaction
              .update(productionPlans)
              .set({
                status: "ready",
                readyAt: occurredAt,
                updatedAt: occurredAt,
              })
              .where(eq(productionPlans.id, plan.id));
          }
        }

        await transaction.insert(auditEvents).values({
          tenantId,
          eventType:
            input.status === "cancelled"
              ? "ORDER_CANCELLED"
              : "ORDER_STATUS_CHANGED",
          correlationId: randomUUID(),
          payload: {
            orderId: storedOrder.id,
            orderNumber: storedOrder.orderNumber,
            from: storedOrder.status,
            to: input.status,
            cancellationReason: input.cancellationReason,
          },
        });
        return { repeated: false };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: this.statusMessage(order, result.repeated),
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  async replan(
    tenantId: string,
    orderId: string,
    input: ReplanOrderInput,
  ): Promise<ReplanOrderResult> {
    if (!this.database.isConfigured) {
      const stored = this.memory.get(tenantId) ?? [];
      const order = stored.find((entry) => entry.id === orderId);
      if (!order)
        throw new NotFoundException("A encomenda não foi encontrada.");
      if (order.status !== "confirmed" && order.status !== "in_production") {
        throw new ConflictException(
          "Somente pedidos confirmados ou em produção podem mudar de horário.",
        );
      }
      const repeated = order.deliveryAt === input.deliveryAt;
      order.deliveryAt = input.deliveryAt;
      const summary = publicOrder(order);
      return {
        message: repeated
          ? `O pedido #${order.orderNumber} já estava nesse horário.`
          : `Entrega do pedido #${order.orderNumber} ajustada e agenda recalculada.`,
        order: summary,
        workspace: this.workspaceFrom(stored.map(publicOrder)),
        repeated,
      };
    }

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [storedOrder] = await transaction
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for("update");
        if (!storedOrder) {
          throw new NotFoundException("A encomenda não foi encontrada.");
        }
        if (
          storedOrder.status !== "confirmed" &&
          storedOrder.status !== "in_production"
        ) {
          throw new ConflictException(
            "Somente pedidos confirmados ou em produção podem mudar de horário.",
          );
        }

        const deliveryAt = new Date(input.deliveryAt);
        if (deliveryAt.getTime() === storedOrder.deliveryAt.getTime()) {
          return { repeated: true };
        }

        const occurredAt = new Date();
        const storedPlans = await transaction
          .select()
          .from(productionPlans)
          .where(eq(productionPlans.orderId, storedOrder.id))
          .for("update");
        if (storedPlans.length === 0) {
          throw new ConflictException(
            "Este pedido ainda não possui um plano de produção para recalcular.",
          );
        }

        const revisions: Array<{
          planId: string;
          fromVersion: number;
          toVersion: number;
          movedTaskCount: number;
        }> = [];
        const [allProductionTasks, assets, unavailablePeriods] =
          await Promise.all([
            transaction.select().from(productionTasks),
            transaction.select().from(equipmentAssets),
            transaction.select().from(equipmentUnavailability),
          ]);
        for (const plan of storedPlans) {
          if (plan.status === "cancelled" || plan.status === "completed") {
            continue;
          }
          const [storedTasks, storedMoments] = await Promise.all([
            transaction
              .select()
              .from(productionTasks)
              .where(eq(productionTasks.productionPlanId, plan.id))
              .orderBy(asc(productionTasks.plannedStartAt)),
            transaction
              .select()
              .from(productionMoments)
              .where(eq(productionMoments.productionPlanId, plan.id)),
          ]);
          const schedule = buildRemainingProductionSchedule(
            deliveryAt,
            storedTasks,
            plan.bufferMinutes,
            occurredAt,
          );
          if (!schedule.feasible) {
            throw new ConflictException(
              schedule.reason === "NO_REMAINING_TASKS"
                ? "Não há mais etapas pendentes para replanejar."
                : "O novo horário não comporta as etapas restantes. Escolha um prazo um pouco mais tarde.",
            );
          }

          const movableIds = new Set(schedule.tasks.map((task) => task.id));
          for (const moved of schedule.tasks) {
            const original = storedTasks.find((task) => task.id === moved.id);
            if (!original?.equipmentId) continue;
            const asset = assets.find(
              (entry) => entry.id === original.equipmentId,
            );
            if (!asset || asset.status !== "active") {
              throw new ConflictException(
                "Um equipamento necessário não estará disponível. Ajuste a cozinha antes de confirmar o novo prazo.",
              );
            }
            const unavailable = unavailablePeriods.some(
              (period) =>
                period.equipmentId === asset.id &&
                moved.plannedStartAt < period.endsAt &&
                period.startsAt < moved.plannedEndAt,
            );
            const concurrent = allProductionTasks.filter(
              (other) =>
                !movableIds.has(other.id) &&
                other.equipmentId === asset.id &&
                other.status !== "completed" &&
                other.status !== "cancelled" &&
                moved.plannedStartAt < other.plannedEndAt &&
                other.plannedStartAt < moved.plannedEndAt,
            ).length;
            if (unavailable || concurrent >= asset.capacityUnits) {
              throw new ConflictException(
                `${asset.name} não comporta o novo horário. Escolha outro prazo ou ajuste sua indisponibilidade.`,
              );
            }
          }

          const movedById = new Map(
            schedule.tasks.map((task) => [task.id, task]),
          );
          for (const task of schedule.tasks) {
            await transaction
              .update(productionTasks)
              .set({
                plannedStartAt: task.plannedStartAt,
                plannedEndAt: task.plannedEndAt,
                updatedAt: occurredAt,
              })
              .where(eq(productionTasks.id, task.id));
          }

          for (const moment of storedMoments) {
            const momentTasks = storedTasks.filter(
              (task) => task.productionMomentId === moment.id,
            );
            if (momentTasks.length === 0) continue;
            const starts = momentTasks.map(
              (task) =>
                movedById.get(task.id)?.plannedStartAt ?? task.plannedStartAt,
            );
            const ends = momentTasks.map(
              (task) =>
                movedById.get(task.id)?.plannedEndAt ?? task.plannedEndAt,
            );
            await transaction
              .update(productionMoments)
              .set({
                plannedStartAt: new Date(
                  Math.min(...starts.map((value) => value.getTime())),
                ),
                plannedEndAt: new Date(
                  Math.max(...ends.map((value) => value.getTime())),
                ),
                updatedAt: occurredAt,
              })
              .where(eq(productionMoments.id, moment.id));
          }

          await transaction
            .update(productionPlans)
            .set({
              deliveryAt,
              recommendedStartAt: schedule.recommendedStartAt,
              plannedFinishAt: schedule.plannedFinishAt,
              planningVersion: plan.planningVersion + 1,
              updatedAt: occurredAt,
            })
            .where(eq(productionPlans.id, plan.id));
          revisions.push({
            planId: plan.id,
            fromVersion: plan.planningVersion,
            toVersion: plan.planningVersion + 1,
            movedTaskCount: schedule.tasks.length,
          });
        }

        if (revisions.length === 0) {
          throw new ConflictException(
            "Não há um plano ativo que possa ser replanejado.",
          );
        }
        await transaction
          .update(orders)
          .set({ deliveryAt })
          .where(eq(orders.id, storedOrder.id));
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "ORDER_PRODUCTION_REPLANNED",
          correlationId: randomUUID(),
          payload: {
            orderId: storedOrder.id,
            orderNumber: storedOrder.orderNumber,
            previousDeliveryAt: storedOrder.deliveryAt.toISOString(),
            deliveryAt: deliveryAt.toISOString(),
            reason: input.reason,
            revisions,
          },
        });
        return { repeated: false };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: result.repeated
        ? `O pedido #${order.orderNumber} já estava nesse horário.`
        : `Entrega do pedido #${order.orderNumber} ajustada e agenda recalculada.`,
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  async registerReceipt(
    tenantId: string,
    orderId: string,
    input: RegisterReceiptInput,
  ): Promise<MutateReceiptResult> {
    if (!this.database.isConfigured) {
      throw new ConflictException(
        "Recebimentos precisam do banco configurado para preservar a trilha financeira.",
      );
    }

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [repeated] = await transaction
          .select()
          .from(orderReceipts)
          .where(eq(orderReceipts.idempotencyKey, input.idempotencyKey));
        if (repeated) return { repeated: true };

        const [storedOrder] = await transaction
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for("update");
        if (!storedOrder) {
          throw new NotFoundException("A encomenda não foi encontrada.");
        }
        if (storedOrder.status === "cancelled") {
          throw new ConflictException(
            "Um pedido cancelado não recebe novas entradas. Estorne ou ajuste os lançamentos existentes.",
          );
        }

        const existingRows = await transaction
          .select()
          .from(orderReceipts)
          .where(eq(orderReceipts.orderId, orderId));
        const payment = buildOrderPaymentResult(
          storedOrder.price,
          existingRows,
        );
        if (payment.balanceDue <= 0) {
          throw new ConflictException(
            "Este pedido já está integralmente pago.",
          );
        }
        if (input.amount > payment.balanceDue + 0.001) {
          throw new ConflictException(
            `O saldo deste pedido é ${payment.balanceDue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Revise o valor recebido.`,
          );
        }

        await transaction.insert(orderReceipts).values({
          tenantId,
          orderId,
          idempotencyKey: input.idempotencyKey,
          kind: "receipt",
          amount: roundMoney(input.amount),
          feeAmount: roundMoney(input.feeAmount),
          paymentMethod: input.paymentMethod,
          receivedAt: new Date(input.receivedAt),
          note: input.note,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "ORDER_RECEIPT_REGISTERED",
          correlationId: input.idempotencyKey,
          payload: {
            orderId,
            orderNumber: storedOrder.orderNumber,
            amount: roundMoney(input.amount),
            feeAmount: roundMoney(input.feeAmount),
            paymentMethod: input.paymentMethod,
          },
        });
        return { repeated: false };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: result.repeated
        ? `Este recebimento do pedido #${order.orderNumber} já estava registrado.`
        : `${input.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} recebidos no pedido #${order.orderNumber}.`,
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  async reverseReceipt(
    tenantId: string,
    orderId: string,
    receiptId: string,
    input: ReverseReceiptInput,
  ): Promise<MutateReceiptResult> {
    if (!this.database.isConfigured) {
      throw new ConflictException(
        "Estornos precisam do banco configurado para preservar a trilha financeira.",
      );
    }

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [receipt] = await transaction
          .select()
          .from(orderReceipts)
          .where(
            and(
              eq(orderReceipts.id, receiptId),
              eq(orderReceipts.orderId, orderId),
              eq(orderReceipts.kind, "receipt"),
            ),
          )
          .for("update");
        if (!receipt) {
          throw new NotFoundException("O recebimento não foi encontrado.");
        }
        const [existingReversal] = await transaction
          .select()
          .from(orderReceipts)
          .where(eq(orderReceipts.reversesReceiptId, receipt.id));
        if (existingReversal) return { repeated: true };

        const occurredAt = new Date();
        const inserted = await transaction
          .insert(orderReceipts)
          .values({
            tenantId,
            orderId,
            idempotencyKey: randomUUID(),
            kind: "reversal",
            amount: receipt.amount,
            feeAmount: receipt.feeAmount,
            paymentMethod: receipt.paymentMethod,
            receivedAt: occurredAt,
            note: input.reason,
            reversesReceiptId: receipt.id,
          })
          .onConflictDoNothing()
          .returning({ id: orderReceipts.id });
        if (inserted.length === 0) return { repeated: true };

        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "ORDER_RECEIPT_REVERSED",
          correlationId: randomUUID(),
          payload: {
            orderId,
            receiptId: receipt.id,
            amount: receipt.amount,
            feeAmount: receipt.feeAmount,
            reason: input.reason,
          },
        });
        return { repeated: false };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: result.repeated
        ? `O recebimento do pedido #${order.orderNumber} já estava estornado.`
        : `Recebimento estornado. O saldo do pedido #${order.orderNumber} foi recalculado.`,
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  async registerDirectExpense(
    tenantId: string,
    orderId: string,
    input: RegisterDirectExpenseInput,
  ): Promise<MutateDirectExpenseResult> {
    if (!this.database.isConfigured) {
      throw new ConflictException(
        "Despesas diretas precisam do banco configurado para preservar o histórico.",
      );
    }

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [repeated] = await transaction
          .select()
          .from(orderDirectExpenses)
          .where(eq(orderDirectExpenses.idempotencyKey, input.idempotencyKey));
        if (repeated) return { repeated: true };

        const [storedOrder] = await transaction
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for("update");
        if (!storedOrder) {
          throw new NotFoundException("A encomenda não foi encontrada.");
        }

        const existingRows = await transaction
          .select()
          .from(orderDirectExpenses)
          .where(eq(orderDirectExpenses.orderId, orderId));
        const current = buildOrderDirectExpenseResult(
          storedOrder.additionalCost,
          existingRows,
        );
        if (
          current.estimatedReconciled + input.estimatedAmount >
          storedOrder.additionalCost + 0.001
        ) {
          throw new ConflictException(
            `Restam ${current.remainingEstimate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} do orçamento de custos extras para conciliar.`,
          );
        }

        await transaction.insert(orderDirectExpenses).values({
          tenantId,
          orderId,
          idempotencyKey: input.idempotencyKey,
          kind: "expense",
          category: input.category,
          description: input.description,
          actualAmount: roundMoney(input.actualAmount),
          estimatedAmount: roundMoney(input.estimatedAmount),
          incurredAt: new Date(`${input.incurredAt}T12:00:00Z`),
          note: input.note,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "ORDER_DIRECT_EXPENSE_REGISTERED",
          correlationId: input.idempotencyKey,
          payload: {
            orderId,
            orderNumber: storedOrder.orderNumber,
            category: input.category,
            actualAmount: roundMoney(input.actualAmount),
            estimatedAmount: roundMoney(input.estimatedAmount),
          },
        });
        return { repeated: false };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: result.repeated
        ? `Este gasto do pedido #${order.orderNumber} já estava registrado.`
        : `${input.description} entrou no custo real do pedido #${order.orderNumber}.`,
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  async reverseDirectExpense(
    tenantId: string,
    orderId: string,
    expenseId: string,
    input: ReverseDirectExpenseInput,
  ): Promise<MutateDirectExpenseResult> {
    if (!this.database.isConfigured) {
      throw new ConflictException(
        "Estornos precisam do banco configurado para preservar o histórico.",
      );
    }

    const result = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [expense] = await transaction
          .select()
          .from(orderDirectExpenses)
          .where(
            and(
              eq(orderDirectExpenses.id, expenseId),
              eq(orderDirectExpenses.orderId, orderId),
              eq(orderDirectExpenses.kind, "expense"),
            ),
          )
          .for("update");
        if (!expense) {
          throw new NotFoundException("O gasto direto não foi encontrado.");
        }
        const [existingReversal] = await transaction
          .select()
          .from(orderDirectExpenses)
          .where(eq(orderDirectExpenses.reversesExpenseId, expense.id));
        if (existingReversal) return { repeated: true };

        const inserted = await transaction
          .insert(orderDirectExpenses)
          .values({
            tenantId,
            orderId,
            idempotencyKey: randomUUID(),
            kind: "reversal",
            category: expense.category,
            description: expense.description,
            actualAmount: expense.actualAmount,
            estimatedAmount: expense.estimatedAmount,
            incurredAt: expense.incurredAt,
            note: input.reason,
            reversesExpenseId: expense.id,
          })
          .onConflictDoNothing()
          .returning({ id: orderDirectExpenses.id });
        if (inserted.length === 0) return { repeated: true };

        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "ORDER_DIRECT_EXPENSE_REVERSED",
          correlationId: randomUUID(),
          payload: {
            orderId,
            expenseId: expense.id,
            actualAmount: expense.actualAmount,
            estimatedAmount: expense.estimatedAmount,
            reason: input.reason,
          },
        });
        return { repeated: false };
      },
    );

    const workspace = await this.getForTenant(tenantId);
    const order = workspace.orders.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi projetada.");
    return {
      message: result.repeated
        ? `O gasto do pedido #${order.orderNumber} já estava estornado.`
        : `Gasto estornado. O resultado do pedido #${order.orderNumber} foi recalculado.`,
      order,
      workspace,
      repeated: result.repeated,
    };
  }

  private updateStatusInMemory(
    tenantId: string,
    orderId: string,
    input: UpdateOrderStatusInput,
  ): UpdateOrderStatusResult {
    const stored = this.memory.get(tenantId) ?? [];
    const order = stored.find((entry) => entry.id === orderId);
    if (!order) throw new NotFoundException("A encomenda não foi encontrada.");
    if (order.status === input.status) {
      return {
        message: this.statusMessage(order, true),
        order: publicOrder(order),
        workspace: this.workspaceFrom(stored.map(publicOrder)),
        repeated: true,
      };
    }
    if (!allowedTransitions[order.status].includes(input.status)) {
      throw new ConflictException(
        "Esse passo não combina com o momento atual da encomenda.",
      );
    }

    const occurredAt = new Date().toISOString();
    order.status = input.status;
    if (input.status === "in_production") order.startedAt = occurredAt;
    if (input.status === "ready") order.readyAt = occurredAt;
    if (input.status === "completed") order.completedAt = occurredAt;
    if (input.status === "cancelled") {
      order.cancelledAt = occurredAt;
      order.cancellationReason = input.cancellationReason ?? null;
    }
    if (input.status === "cancelled" || input.status === "completed") {
      order.purchaseNeedCount = 0;
    }
    return {
      message: this.statusMessage(order, false),
      order: publicOrder(order),
      workspace: this.workspaceFrom(stored.map(publicOrder)),
      repeated: false,
    };
  }

  private statusMessage(order: OrderSummary, repeated: boolean) {
    const prefix = repeated ? "Tudo certo: " : "";
    if (order.status === "in_production") {
      return `${prefix}o pedido #${order.orderNumber} está na bancada.`;
    }
    if (order.status === "ready") {
      return `${prefix}o pedido #${order.orderNumber} está pronto para ${order.deliveryMode === "delivery" ? "entrega" : "retirada"}.`;
    }
    if (order.status === "completed") {
      return `${prefix}o pedido #${order.orderNumber} foi concluído.`;
    }
    if (order.status === "cancelled") {
      return `${prefix}o pedido #${order.orderNumber} foi cancelado e as reservas foram liberadas.`;
    }
    return `${prefix}o pedido #${order.orderNumber} está confirmado.`;
  }

  private confirmInMemory(
    tenantId: string,
    input: ConfirmOrderInput,
  ): ConfirmOrderResult {
    if (
      input.deliveryMode === "delivery" &&
      input.deliveryArrangement === "integrated_partner"
    ) {
      throw new ConflictException(
        "A plataforma escolhida ainda não está conectada à Zucchero.",
      );
    }
    const stored = this.memory.get(tenantId) ?? [];
    const repeated = stored.find(
      (entry) => entry.idempotencyKey === input.idempotencyKey,
    );
    if (repeated) {
      const order = publicOrder(repeated);
      return {
        message: `O pedido #${order.orderNumber} já estava confirmado.`,
        order,
        workspace: this.workspaceFrom(stored.map(publicOrder)),
        repeated: true,
      };
    }
    if (input.recipeId !== demoRecipeId || input.recipeVersionNumber !== 1)
      throw new NotFoundException("A receita não foi encontrada.");
    const rows = demoRows(tenantId);
    const calculation = calculate(
      input,
      rows.version,
      rows.lines,
      rows.groups,
      rows.items,
      rows.lots,
      rows.movements,
    );
    const order: MemoryOrder = {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      orderNumber: 1043 + stored.length,
      status: "confirmed",
      customerName: input.customerName,
      recipeName: rows.recipe.name,
      recipeVersionNumber: 1,
      requestedMassG: input.requestedMassG,
      deliveryMode: input.deliveryMode,
      deliveryArrangement:
        input.deliveryMode === "delivery"
          ? (input.deliveryArrangement ?? "own")
          : null,
      deliveryProvider:
        input.deliveryMode === "delivery" &&
        input.deliveryArrangement === "integrated_partner"
          ? (input.deliveryProvider ?? null)
          : null,
      paymentMethod: input.paymentMethod,
      deliveryAt: input.deliveryAt,
      price: calculation.price,
      availability: calculation.availability,
      purchaseNeedCount: calculation.requirements.filter(
        (entry) => entry.shortageBase > 0,
      ).length,
      confirmedAt: new Date().toISOString(),
      startedAt: null,
      readyAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      deliveryCost: 0,
      costResult: buildOrderCostResult({
        order: {
          id: "memory-order-pending",
          status: "confirmed",
          ingredientCost: calculation.ingredientCost,
          additionalCost: input.additionalCost,
          totalCost: calculation.totalCost,
          price: calculation.price,
        },
        requirements: [],
        consumptions: [],
        correctionLines: [],
        lots: [],
        movements: [],
      }),
      paymentResult: buildOrderPaymentResult(calculation.price, []),
      directExpenseResult: buildOrderDirectExpenseResult(
        input.additionalCost,
        [],
      ),
      productionVariance: null,
    };
    stored.unshift(order);
    this.memory.set(tenantId, stored);
    const summary = publicOrder(order);
    return {
      message: `Pedido #${order.orderNumber} confirmado e reservado.`,
      order: summary,
      workspace: this.workspaceFrom(stored.map(publicOrder)),
      repeated: false,
    };
  }

  private async loadDeliveryContext(
    tenantId: string,
    input: DeliveryQuoteRequest,
  ) {
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadDeliveryContextFromTransaction(transaction, tenantId, input),
    );
  }

  private async loadDeliveryContextFromTransaction(
    transaction: AppTransaction,
    tenantId: string,
    input: DeliveryQuoteRequest,
  ) {
    const [[tenant], [settings], [address]] = await Promise.all([
      transaction
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1),
      transaction
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1),
      transaction
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, input.customerAddressId),
            eq(customerAddresses.customerId, input.customerId),
            eq(customerAddresses.active, true),
          ),
        )
        .limit(1),
    ]);

    if (!tenant) throw new NotFoundException("Confeitaria não encontrada.");
    if (!address) {
      throw new NotFoundException(
        "O endereço escolhido não pertence a esta cliente.",
      );
    }
    if (
      !tenant.addressLine ||
      !tenant.addressNumber ||
      !tenant.city ||
      !tenant.state
    ) {
      throw new ConflictException(
        "Complete logradouro, número, cidade e estado da confeitaria nos Ajustes.",
      );
    }
    if (
      !address.street ||
      !address.addressNumber ||
      !address.city ||
      !address.state
    ) {
      throw new ConflictException(
        "Complete logradouro, número, cidade e estado deste endereço da cliente.",
      );
    }

    return {
      costPerKm: settings?.deliveryCostPerKm ?? 0,
      origin: completeAddress([
        tenant.addressLine,
        tenant.addressNumber,
        tenant.addressComplement,
        tenant.neighborhood,
        tenant.city,
        tenant.state,
        tenant.postalCode,
      ]),
      destination: completeAddress([
        address.street,
        address.addressNumber,
        address.addressComplement,
        address.neighborhood,
        address.city,
        address.state,
        address.postalCode,
      ]),
      address,
    };
  }

  private async loadWorkspace(
    transaction: AppTransaction,
  ): Promise<OrderWorkspace> {
    const [
      storedOrders,
      items,
      needs,
      requirements,
      consumptions,
      correctionLines,
      lots,
      movements,
      receiptRows,
      directExpenseRows,
    ] = await Promise.all([
      transaction.select().from(orders).orderBy(asc(orders.deliveryAt)),
      transaction.select().from(orderItems),
      transaction.select().from(shoppingNeeds),
      transaction.select().from(orderRequirements),
      transaction.select().from(productionTaskConsumptions),
      transaction.select().from(productionConsumptionCorrectionLines),
      transaction.select().from(purchaseLots),
      transaction.select().from(stockMovements),
      transaction.select().from(orderReceipts),
      transaction.select().from(orderDirectExpenses),
    ]);
    return this.workspaceFrom(
      storedOrders.map((order): OrderSummary => {
        const item = items.find((entry) => entry.orderId === order.id);
        const orderRequirementRows = requirements.filter(
          (requirement) => requirement.orderId === order.id,
        );
        const effectiveConsumptions = orderRequirementRows.flatMap(
          (requirement) => {
            const consumption = consumptions.find(
              (entry) => entry.orderRequirementId === requirement.id,
            );
            if (!consumption) return [];
            const latestCorrection = correctionLines
              .filter((line) => line.consumptionId === consumption.id)
              .sort(
                (left, right) =>
                  left.createdAt.getTime() - right.createdAt.getTime(),
              )
              .at(-1);
            return [
              {
                plannedG: consumption.plannedQuantityBase,
                actualUsedG:
                  latestCorrection?.correctedActualUsedBase ??
                  consumption.actualUsedBase,
                lossG:
                  latestCorrection?.correctedLossBase ?? consumption.lossBase,
              },
            ];
          },
        );
        const variance =
          effectiveConsumptions.length > 0
            ? summarizeConsumptionVariance(effectiveConsumptions)
            : null;
        const paymentResult = buildOrderPaymentResult(
          order.price,
          receiptRows.filter((receipt) => receipt.orderId === order.id),
        );
        const directExpenseResult = buildOrderDirectExpenseResult(
          order.additionalCost,
          directExpenseRows.filter((expense) => expense.orderId === order.id),
        );
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          customerName: order.customerNameSnapshot,
          recipeName: item?.recipeNameSnapshot ?? "Encomenda",
          recipeVersionNumber: item?.recipeVersionNumber ?? 1,
          requestedMassG: item?.requestedMassG ?? 0,
          deliveryMode: order.deliveryMode,
          deliveryArrangement: order.deliveryArrangement,
          deliveryProvider: order.deliveryProvider,
          paymentMethod: order.paymentMethod as "pix" | "card" | "cash",
          deliveryAt: order.deliveryAt.toISOString(),
          price: order.price,
          availability: order.availability,
          purchaseNeedCount: needs.filter(
            (need) => need.orderId === order.id && need.status === "open",
          ).length,
          confirmedAt: order.confirmedAt.toISOString(),
          startedAt: order.startedAt?.toISOString() ?? null,
          readyAt: order.readyAt?.toISOString() ?? null,
          completedAt: order.completedAt?.toISOString() ?? null,
          cancelledAt: order.cancelledAt?.toISOString() ?? null,
          cancellationReason: order.cancellationReason,
          deliveryCost: order.deliveryCost,
          costResult: buildOrderCostResult({
            order,
            requirements,
            consumptions,
            correctionLines,
            lots,
            movements,
            paymentFee: paymentResult.feeTotal,
            realizedAdditionalCost: directExpenseResult.effectiveAdditionalCost,
          }),
          paymentResult,
          directExpenseResult,
          productionVariance: variance
            ? {
                ...variance,
                confirmedLineCount: effectiveConsumptions.length,
                totalLineCount: orderRequirementRows.length,
                complete:
                  orderRequirementRows.length > 0 &&
                  effectiveConsumptions.length === orderRequirementRows.length,
              }
            : null,
        };
      }),
    );
  }

  private workspaceFrom(storedOrders: OrderSummary[]): OrderWorkspace {
    return {
      summary: {
        activeCount: storedOrders.filter((order) =>
          activeStatuses.has(order.status),
        ).length,
        inProductionCount: storedOrders.filter(
          (order) => order.status === "in_production",
        ).length,
        readyCount: storedOrders.filter((order) => order.status === "ready")
          .length,
        purchasePendingCount: storedOrders.reduce(
          (total, order) =>
            activeStatuses.has(order.status)
              ? total + order.purchaseNeedCount
              : total,
          0,
        ),
      },
      orders: [...storedOrders].sort((left, right) =>
        left.deliveryAt.localeCompare(right.deliveryAt),
      ),
    };
  }
}
