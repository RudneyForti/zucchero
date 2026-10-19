import { describe, expect, it } from "vitest";
import {
  calculateConsumptionVariance,
  summarizeConsumptionVariance,
} from "./production.variance";

describe("calculateConsumptionVariance", () => {
  it("trata uma variação de até 2% como dentro do esperado", () => {
    expect(calculateConsumptionVariance(500, 480, 10)).toMatchObject({
      actualTotalG: 490,
      deltaG: -10,
      deltaPercentage: -2,
      lossPercentage: 2,
      status: "on_target",
    });
  });

  it("identifica consumo total acima do planejado", () => {
    expect(calculateConsumptionVariance(300, 310, 12)).toMatchObject({
      actualTotalG: 322,
      deltaG: 22,
      status: "above",
    });
  });

  it("identifica apontamento abaixo do planejado", () => {
    expect(calculateConsumptionVariance(300, 250, 5)).toMatchObject({
      actualTotalG: 255,
      deltaG: -45,
      status: "below",
    });
  });
});

describe("summarizeConsumptionVariance", () => {
  it("resume as linhas sem perder a separação entre uso e perda", () => {
    expect(
      summarizeConsumptionVariance([
        { plannedG: 500, actualUsedG: 480, lossG: 10 },
        { plannedG: 300, actualUsedG: 295, lossG: 5 },
      ]),
    ).toEqual({
      plannedG: 800,
      actualUsedG: 775,
      lossG: 15,
      actualTotalG: 790,
      deltaG: -10,
      deltaPercentage: -1.25,
      lossPercentage: 1.875,
      status: "on_target",
    });
  });
});
