import { describe, expect, it } from "vitest";
import { demoRecipes, scaleRecipe } from "./recipes";

describe("scaleRecipe", () => {
  it("escala rendimento, custo, porções e ingredientes sem alterar a receita", () => {
    const recipe = demoRecipes.recipes[0]!;
    const simulation = scaleRecipe(recipe, 600);

    expect(simulation.factor).toBe(0.5);
    expect(simulation.estimatedCost).toBeCloseTo(11.545);
    expect(simulation.estimatedUnits).toBe(6);
    expect(simulation.ingredients[0]?.quantityG).toBe(250);
    expect(recipe.yieldMassG).toBe(1_200);
  });
});
