import { describe, expect, it } from "vitest";
import { demoPantry } from "./pantry";
import { demoRecipes } from "./recipes";
import {
  calculateOrderQuote,
  packageContentInGrams,
  roundProductionMass,
} from "./orders";

describe("order calculation", () => {
  it("rounds production up to the configured increment", () => {
    expect(roundProductionMass(1_234, 50)).toBe(1_250);
  });

  it("understands commercial package labels", () => {
    expect(packageContentInGrams("1,01 kg")).toBe(1_010);
    expect(packageContentInGrams("1 L")).toBe(1_000);
    expect(packageContentInGrams("250 g")).toBe(250);
  });

  it("freezes the recipe version and rounds a real shortage to packages", () => {
    const quote = calculateOrderQuote(demoRecipes.recipes[0]!, demoPantry, {
      requestedMassG: 5_000,
      targetMarginPercentage: 40,
      additionalCost: 12,
    });

    const chantilly = quote.ingredients.find(
      (ingredient) => ingredient.ingredientName === "Chantilly",
    );

    expect(quote.recipeVersionNumber).toBe(1);
    expect(quote.productionMassG).toBe(5_000);
    expect(quote.availability).toBe("partial");
    expect(chantilly).toMatchObject({
      requiredG: 1_250,
      availableG: 1_000,
      shortageG: 250,
      packagesToBuy: 1,
      purchaseQuantityG: 1_000,
    });
    expect(quote.suggestedPrice).toBeCloseTo(180.35, 2);
  });

  it("separa a entrega dos demais custos e inclui ambos antes da margem", () => {
    const withoutDelivery = calculateOrderQuote(
      demoRecipes.recipes[0]!,
      demoPantry,
      {
        requestedMassG: 1_200,
        targetMarginPercentage: 35,
        additionalCost: 10,
      },
    );
    const withDelivery = calculateOrderQuote(
      demoRecipes.recipes[0]!,
      demoPantry,
      {
        requestedMassG: 1_200,
        targetMarginPercentage: 35,
        additionalCost: 10,
        deliveryCost: 12.5,
      },
    );

    expect(withDelivery.deliveryCost).toBe(12.5);
    expect(withDelivery.additionalCost).toBe(10);
    expect(withDelivery.totalAdditionalCost).toBe(22.5);
    expect(withDelivery.totalCost - withoutDelivery.totalCost).toBeCloseTo(
      12.5,
      2,
    );
  });
});
