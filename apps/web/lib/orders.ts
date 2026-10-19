import type { PantryView } from "./pantry";
import { scaleRecipe, type RecipeSummary } from "./recipes";

export type OrderAvailability =
  "available" | "substitution" | "partial" | "unavailable";

export type OrderLifecycleStatus =
  "confirmed" | "in_production" | "ready" | "completed" | "cancelled";

export type DeliveryArrangement =
  "own" | "customer_arranged" | "integrated_partner";

export type OrderIngredientNeed = {
  ingredientGroupId: string;
  ingredientName: string;
  requiredG: number;
  availableG: number;
  shortageG: number;
  status: OrderAvailability;
  purchaseItemName: string | null;
  packageContentG: number | null;
  packagesToBuy: number;
  purchaseQuantityG: number;
};

export type OrderQuote = {
  recipeId: string;
  recipeVersionNumber: number;
  requestedMassG: number;
  productionMassG: number;
  technicalSurplusG: number;
  scaleFactor: number;
  ingredientCost: number;
  additionalCost: number;
  deliveryCost: number;
  totalAdditionalCost: number;
  totalCost: number;
  targetMarginPercentage: number;
  suggestedPrice: number;
  estimatedProfit: number;
  markup: number;
  availability: OrderAvailability;
  ingredients: OrderIngredientNeed[];
};

export type StoredOrderSummary = {
  id: string;
  orderNumber: number;
  status: OrderLifecycleStatus;
  customerName: string;
  recipeName: string;
  recipeVersionNumber: number;
  requestedMassG: number;
  deliveryMode: "delivery" | "pickup";
  deliveryArrangement: DeliveryArrangement | null;
  deliveryProvider: string | null;
  paymentMethod: "pix" | "card" | "cash";
  deliveryAt: string;
  price: number;
  availability: OrderAvailability;
  purchaseNeedCount: number;
  confirmedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  deliveryCost: number;
  costResult: {
    status: "not_started" | "partial" | "complete" | "cancelled";
    estimatedIngredientCost: number;
    additionalCost: number;
    realizedAdditionalCost: number;
    paymentFee: number;
    estimatedTotalCost: number;
    realizedIngredientCost: number;
    realizedTotalCost: number | null;
    costDelta: number | null;
    costVarianceStatus: "on_target" | "above" | "below" | null;
    price: number;
    estimatedProfit: number;
    realizedProfit: number | null;
    estimatedMarginPercentage: number;
    realizedMarginPercentage: number | null;
    confirmedLineCount: number;
    totalLineCount: number;
  };
  paymentResult: {
    status: "unpaid" | "partial" | "paid" | "overpaid";
    price: number;
    grossReceived: number;
    feeTotal: number;
    netReceived: number;
    balanceDue: number;
    overpaidAmount: number;
    receiptCount: number;
    receipts: Array<{
      id: string;
      amount: number;
      feeAmount: number;
      netAmount: number;
      paymentMethod: string;
      receivedAt: string;
      note: string | null;
      reversedAt: string | null;
      reversalReason: string | null;
    }>;
  };
  directExpenseResult: {
    estimatedBase: number;
    actualRegistered: number;
    estimatedReconciled: number;
    remainingEstimate: number;
    adjustment: number;
    effectiveAdditionalCost: number;
    activeCount: number;
    entries: Array<{
      id: string;
      category: string;
      description: string;
      actualAmount: number;
      estimatedAmount: number;
      adjustment: number;
      incurredAt: string;
      note: string | null;
      reversedAt: string | null;
      reversalReason: string | null;
    }>;
  };
  productionVariance:
    | (import("./today").ConsumptionVariance & {
        confirmedLineCount: number;
        totalLineCount: number;
        complete: boolean;
      })
    | null;
};

export type OrderWorkspace = {
  summary: {
    activeCount: number;
    inProductionCount: number;
    readyCount: number;
    purchasePendingCount: number;
  };
  orders: StoredOrderSummary[];
};

export const emptyOrderWorkspace: OrderWorkspace = {
  summary: {
    activeCount: 0,
    inProductionCount: 0,
    readyCount: 0,
    purchasePendingCount: 0,
  },
  orders: [],
};

export function roundProductionMass(requestedMassG: number, incrementG = 50) {
  const safeRequested = Number.isFinite(requestedMassG)
    ? Math.max(0, requestedMassG)
    : 0;
  const safeIncrement = Math.max(1, incrementG);
  return Math.ceil(safeRequested / safeIncrement) * safeIncrement;
}

export function packageContentInGrams(label: string): number | null {
  const match = label
    .trim()
    .toLocaleLowerCase("pt-BR")
    .match(/([\d.,]+)\s*(kg|g|ml|l)\b/);
  if (!match) return null;

  const numericText = match[1] ?? "";
  const unit = match[2];
  const normalized = numericText.includes(",")
    ? numericText.replaceAll(".", "").replace(",", ".")
    : numericText;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;

  return unit === "kg" || unit === "l" ? value * 1_000 : value;
}

function overallAvailability(needs: OrderIngredientNeed[]): OrderAvailability {
  if (needs.some((need) => need.status === "unavailable")) {
    return "unavailable";
  }
  if (needs.some((need) => need.status === "partial")) return "partial";
  if (needs.some((need) => need.status === "substitution")) {
    return "substitution";
  }
  return "available";
}

export function calculateOrderQuote(
  recipe: RecipeSummary,
  pantry: PantryView,
  input: {
    requestedMassG: number;
    targetMarginPercentage: number;
    additionalCost?: number;
    deliveryCost?: number;
    productionIncrementG?: number;
  },
): OrderQuote {
  const productionMassG = roundProductionMass(
    input.requestedMassG,
    input.productionIncrementG,
  );
  const scaled = scaleRecipe(recipe, productionMassG);

  const ingredients = recipe.ingredients.map((ingredient, index) => {
    const scaledIngredient = scaled.ingredients[index];
    const requiredG = Math.ceil(
      (scaledIngredient?.quantityG ?? 0) *
        (1 + ingredient.wastePercentage / 100),
    );
    const group = pantry.groups.find(
      (candidate) => candidate.id === ingredient.ingredientGroupId,
    );
    const preferredItem = group?.items.find(
      (item) => item.id === ingredient.preferredCommercialItemId,
    );
    const availableG =
      ingredient.selectionPolicy === "required"
        ? (preferredItem?.availableBase ?? 0)
        : (group?.availableBase ?? 0);
    const preferredAvailableG = preferredItem?.availableBase ?? 0;
    const shortageG = Math.max(0, requiredG - availableG);

    let status: OrderAvailability = "available";
    if (
      ingredient.selectionPolicy === "preferred" &&
      preferredAvailableG < requiredG &&
      availableG >= requiredG
    ) {
      status = "substitution";
    } else if (shortageG > 0) {
      status = availableG > 0 ? "partial" : "unavailable";
    }

    const purchaseItem = preferredItem ?? group?.items[0] ?? null;
    const packageContentG = purchaseItem
      ? packageContentInGrams(purchaseItem.packageLabel)
      : null;
    const packagesToBuy =
      shortageG > 0 && packageContentG
        ? Math.ceil(shortageG / packageContentG)
        : shortageG > 0
          ? 1
          : 0;

    return {
      ingredientGroupId: ingredient.ingredientGroupId,
      ingredientName: ingredient.ingredientName,
      requiredG,
      availableG,
      shortageG,
      status,
      purchaseItemName: purchaseItem?.displayName ?? null,
      packageContentG,
      packagesToBuy,
      purchaseQuantityG: packageContentG
        ? packagesToBuy * packageContentG
        : shortageG,
    };
  });

  const targetMarginPercentage = Math.min(
    99,
    Math.max(0, input.targetMarginPercentage),
  );
  const additionalCost = Math.max(0, input.additionalCost ?? 0);
  const deliveryCost = Math.max(0, input.deliveryCost ?? 0);
  const totalAdditionalCost = additionalCost + deliveryCost;
  const ingredientCost = scaled.estimatedCost;
  const totalCost = ingredientCost + totalAdditionalCost;
  const suggestedPrice =
    targetMarginPercentage >= 100
      ? 0
      : totalCost / (1 - targetMarginPercentage / 100);

  return {
    recipeId: recipe.id,
    recipeVersionNumber: recipe.versionNumber,
    requestedMassG: Math.max(0, input.requestedMassG),
    productionMassG,
    technicalSurplusG: Math.max(0, productionMassG - input.requestedMassG),
    scaleFactor: scaled.factor,
    ingredientCost,
    additionalCost,
    deliveryCost,
    totalAdditionalCost,
    totalCost,
    targetMarginPercentage,
    suggestedPrice,
    estimatedProfit: suggestedPrice - totalCost,
    markup: totalCost > 0 ? suggestedPrice / totalCost : 0,
    availability: overallAvailability(ingredients),
    ingredients,
  };
}

export type DeliveryQuote = {
  distanceKm: number;
  durationMinutes: number;
  costPerKm: number;
  deliveryCost: number;
  quoteToken: string;
  provider: "google_maps";
  attribution: "Google Maps";
  mapImageDataUrl?: string;
};

export async function getOrders(
  requestHeaders?: HeadersInit,
): Promise<OrderWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };

  const request = (baseUrl: string) =>
    fetch(`${baseUrl}/orders`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(1_500),
    });

  try {
    let response = await request(apiUrl);
    if (
      response.status === 404 &&
      process.env.NODE_ENV !== "production" &&
      apiUrl === "http://localhost:3111/v1"
    ) {
      response = await request("http://localhost:3112/v1");
    }
    if (!response.ok) return emptyOrderWorkspace;
    return (await response.json()) as OrderWorkspace;
  } catch {
    return emptyOrderWorkspace;
  }
}
