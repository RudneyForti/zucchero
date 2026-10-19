export type ConsumptionVarianceStatus = "on_target" | "above" | "below";

export type ConsumptionVariance = {
  plannedG: number;
  actualUsedG: number;
  lossG: number;
  actualTotalG: number;
  deltaG: number;
  deltaPercentage: number;
  lossPercentage: number;
  status: ConsumptionVarianceStatus;
};

export type ConsumptionVarianceLine = {
  plannedG: number;
  actualUsedG: number;
  lossG: number;
};

const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 1_000) / 1_000;

export function calculateConsumptionVariance(
  plannedG: number,
  actualUsedG: number,
  lossG: number,
): ConsumptionVariance {
  const safePlanned = Math.max(0, plannedG);
  const safeUsed = Math.max(0, actualUsedG);
  const safeLoss = Math.max(0, lossG);
  const actualTotalG = safeUsed + safeLoss;
  const deltaG = actualTotalG - safePlanned;
  const toleranceG = Math.max(1, safePlanned * 0.02);
  const status: ConsumptionVarianceStatus =
    Math.abs(deltaG) <= toleranceG
      ? "on_target"
      : deltaG > 0
        ? "above"
        : "below";

  return {
    plannedG: round(safePlanned),
    actualUsedG: round(safeUsed),
    lossG: round(safeLoss),
    actualTotalG: round(actualTotalG),
    deltaG: round(deltaG),
    deltaPercentage: safePlanned > 0 ? round((deltaG / safePlanned) * 100) : 0,
    lossPercentage: safePlanned > 0 ? round((safeLoss / safePlanned) * 100) : 0,
    status,
  };
}

export function summarizeConsumptionVariance(
  lines: ConsumptionVarianceLine[],
): ConsumptionVariance {
  return calculateConsumptionVariance(
    lines.reduce((total, line) => total + line.plannedG, 0),
    lines.reduce((total, line) => total + line.actualUsedG, 0),
    lines.reduce((total, line) => total + line.lossG, 0),
  );
}
