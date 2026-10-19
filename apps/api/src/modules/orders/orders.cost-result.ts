export type OrderCostResultStatus =
  "not_started" | "partial" | "complete" | "cancelled";

export type OrderCostVarianceStatus = "on_target" | "above" | "below";

export type OrderCostResult = {
  status: OrderCostResultStatus;
  estimatedIngredientCost: number;
  additionalCost: number;
  realizedAdditionalCost: number;
  paymentFee: number;
  estimatedTotalCost: number;
  realizedIngredientCost: number;
  realizedTotalCost: number | null;
  costDelta: number | null;
  costVarianceStatus: OrderCostVarianceStatus | null;
  price: number;
  estimatedProfit: number;
  realizedProfit: number | null;
  estimatedMarginPercentage: number;
  realizedMarginPercentage: number | null;
  confirmedLineCount: number;
  totalLineCount: number;
};

type CostOrder = {
  id: string;
  status: string;
  ingredientCost: number;
  additionalCost: number;
  totalCost: number;
  price: number;
};

type CostRequirement = { id: string; orderId: string };
type CostConsumption = { id: string; orderRequirementId: string };
type CostCorrectionLine = { id: string; consumptionId: string };
type CostLot = { id: string; unitCostBase: number };
type CostMovement = {
  lotId: string;
  type: string;
  quantityBase: number;
  referenceType: string;
  referenceId: string | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function marginPercentage(price: number, cost: number) {
  return price > 0 ? roundMoney(((price - cost) / price) * 100) : 0;
}

function financialMovementFactor(type: string) {
  if (type === "CONSUME" || type === "LOSS" || type === "RETURN_OUT") {
    return 1;
  }
  if (type === "RETURN_IN") return -1;
  return 0;
}

export function buildOrderCostResult(input: {
  order: CostOrder;
  requirements: CostRequirement[];
  consumptions: CostConsumption[];
  correctionLines: CostCorrectionLine[];
  lots: CostLot[];
  movements: CostMovement[];
  paymentFee?: number;
  realizedAdditionalCost?: number;
}): OrderCostResult {
  const orderRequirements = input.requirements.filter(
    (requirement) => requirement.orderId === input.order.id,
  );
  const requirementIds = new Set(
    orderRequirements.map((requirement) => requirement.id),
  );
  const orderConsumptions = input.consumptions.filter((consumption) =>
    requirementIds.has(consumption.orderRequirementId),
  );
  const consumptionIds = new Set(
    orderConsumptions.map((consumption) => consumption.id),
  );
  const correctionLineIds = new Set(
    input.correctionLines
      .filter((line) => consumptionIds.has(line.consumptionId))
      .map((line) => line.id),
  );
  const unitCostByLot = new Map(
    input.lots.map((lot) => [lot.id, lot.unitCostBase]),
  );

  let hasDirectOrderConsumption = false;
  const realizedIngredientCost = roundMoney(
    Math.max(
      0,
      input.movements.reduce((total, movement) => {
        const factor = financialMovementFactor(movement.type);
        if (factor === 0 || !movement.referenceId) return total;

        const fromTask =
          movement.referenceType === "production_task_consumption" &&
          consumptionIds.has(movement.referenceId);
        const fromCorrection =
          movement.referenceType === "production_consumption_correction" &&
          correctionLineIds.has(movement.referenceId);
        const fromOrder =
          movement.referenceType === "order" &&
          movement.referenceId === input.order.id;
        if (!fromTask && !fromCorrection && !fromOrder) return total;
        if (fromOrder && factor > 0) hasDirectOrderConsumption = true;

        return (
          total +
          factor *
            movement.quantityBase *
            (unitCostByLot.get(movement.lotId) ?? 0)
        );
      }, 0),
    ),
  );

  const confirmedRequirementIds = new Set(
    orderConsumptions.map((consumption) => consumption.orderRequirementId),
  );
  const totalLineCount = orderRequirements.length;
  const completedByConsumption =
    totalLineCount > 0 && confirmedRequirementIds.size === totalLineCount;
  const completedByLegacyFlow =
    input.order.status === "completed" && hasDirectOrderConsumption;
  const complete = completedByConsumption || completedByLegacyFlow;
  const status: OrderCostResultStatus =
    input.order.status === "cancelled"
      ? "cancelled"
      : complete
        ? "complete"
        : orderConsumptions.length > 0 || realizedIngredientCost > 0
          ? "partial"
          : "not_started";
  const realizedTotalCost =
    status === "complete"
      ? roundMoney(
          realizedIngredientCost +
            (input.realizedAdditionalCost ?? input.order.additionalCost) +
            (input.paymentFee ?? 0),
        )
      : null;
  const costDelta =
    realizedTotalCost === null
      ? null
      : roundMoney(realizedTotalCost - input.order.totalCost);
  const costVarianceStatus: OrderCostVarianceStatus | null =
    costDelta === null
      ? null
      : Math.abs(costDelta) <= 0.01
        ? "on_target"
        : costDelta > 0
          ? "above"
          : "below";

  return {
    status,
    estimatedIngredientCost: roundMoney(input.order.ingredientCost),
    additionalCost: roundMoney(input.order.additionalCost),
    realizedAdditionalCost: roundMoney(
      input.realizedAdditionalCost ?? input.order.additionalCost,
    ),
    paymentFee: roundMoney(input.paymentFee ?? 0),
    estimatedTotalCost: roundMoney(input.order.totalCost),
    realizedIngredientCost,
    realizedTotalCost,
    costDelta,
    costVarianceStatus,
    price: roundMoney(input.order.price),
    estimatedProfit: roundMoney(input.order.price - input.order.totalCost),
    realizedProfit:
      realizedTotalCost === null
        ? null
        : roundMoney(input.order.price - realizedTotalCost),
    estimatedMarginPercentage: marginPercentage(
      input.order.price,
      input.order.totalCost,
    ),
    realizedMarginPercentage:
      realizedTotalCost === null
        ? null
        : marginPercentage(input.order.price, realizedTotalCost),
    confirmedLineCount: completedByLegacyFlow
      ? totalLineCount
      : confirmedRequirementIds.size,
    totalLineCount,
  };
}
