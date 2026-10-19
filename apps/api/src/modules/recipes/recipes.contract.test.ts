import { describe, expect, it } from "vitest";
import { createRecipeSchema } from "./recipes.contract";

const groupId = "31111111-1111-4111-8111-111111111111";

function recipeInput() {
  return {
    name: "Creme de teste",
    yieldMassG: 500,
    status: "published",
    expectedLossPercentage: 0,
    ingredients: [
      {
        ingredientGroupId: groupId,
        recipeStepRef: "misturar",
        inputQuantity: 200,
        inputUnit: "g",
        conversionFactorToG: 1,
        quantityG: 200,
        selectionPolicy: "generic",
        wastePercentage: 0,
      },
    ],
    moments: [
      {
        ref: "creme",
        name: "Creme",
        preparationRole: "final",
        steps: [
          {
            ref: "misturar",
            name: "Misturar o creme",
            instructions: "Misture até ficar uniforme.",
            durationMinutes: 10,
            kind: "active",
            parallelizable: false,
          },
          {
            ref: "resfriar",
            name: "Resfriar o creme",
            instructions: "Leve o creme para resfriar.",
            durationMinutes: 30,
            kind: "cooling",
            parallelizable: false,
          },
        ],
      },
    ],
  };
}

describe("createRecipeSchema", () => {
  it("aceita conversão de ml quando fator e fonte estão documentados", () => {
    const input = recipeInput();
    expect(
      createRecipeSchema.safeParse({
        ...input,
        ingredients: [
          {
            ...input.ingredients[0]!,
            inputQuantity: 200,
            inputUnit: "ml",
            conversionFactorToG: 1.03,
            conversionSource: "rótulo do fabricante",
            quantityG: 206,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("recusa conversão dependente de densidade sem fonte", () => {
    const input = recipeInput();
    input.ingredients[0] = {
      ...input.ingredients[0]!,
      inputQuantity: 200,
      inputUnit: "ml",
      conversionFactorToG: 1.03,
      quantityG: 206,
    };

    expect(createRecipeSchema.safeParse(input).success).toBe(false);
  });

  it("recusa ciclo entre precedências de etapas", () => {
    const input = {
      ...recipeInput(),
      dependencies: [
        {
          predecessorStepRef: "misturar",
          successorStepRef: "resfriar",
        },
        {
          predecessorStepRef: "resfriar",
          successorStepRef: "misturar",
        },
      ],
    };

    expect(createRecipeSchema.safeParse(input).success).toBe(false);
  });
});
