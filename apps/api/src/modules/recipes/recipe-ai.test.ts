import { describe, expect, it } from "vitest";
import { recipeAiOutputSchema } from "./recipe-ai";

function validOutput() {
  return {
    name: "Brownie",
    yieldMassG: 900,
    yieldUnits: 12,
    expectedLossPercentage: 8,
    totalDurationMinutes: 55,
    ingredients: [
      {
        originalText: "170 g de manteiga sem sal",
        name: "Manteiga sem sal",
        category: "Gorduras",
        inputQuantity: 170,
        inputUnit: "g" as const,
        quantityG: 170,
        conversionFactorToG: 1,
        conversionSource: null,
        conversionConfidence: "imported" as const,
        perishable: true,
        warnings: [],
        recipeStepRef: "step-1",
      },
    ],
    moments: [
      {
        ref: "moment-1",
        name: "Base de chocolate",
        description: "Derretimento e mistura da base.",
        preparationRole: "intermediate" as const,
        steps: [
          {
            ref: "step-1",
            name: "Derreter a base",
            instructions: "Derreta a manteiga e incorpore o chocolate.",
            durationMinutes: 8,
            kind: "heating" as const,
            requiredEquipmentKind: "stove" as const,
            parallelizable: false,
          },
        ],
      },
    ],
    dependencies: [],
    warnings: [],
    confidence: "high" as const,
  };
}

describe("recipeAiOutputSchema", () => {
  it("accepts a semantically consistent recipe", () => {
    expect(recipeAiOutputSchema.safeParse(validOutput()).success).toBe(true);
  });

  it("rejects ingredients linked to unknown steps", () => {
    const output = validOutput();
    const ingredient = output.ingredients[0];
    expect(ingredient).toBeDefined();
    if (!ingredient) throw new Error("Fixture sem ingrediente.");
    ingredient.recipeStepRef = "step-missing";

    const result = recipeAiOutputSchema.safeParse(output);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("etapa inexistente");
    }
  });

  it("rejects conversions that do not close mathematically", () => {
    const output = validOutput();
    const ingredient = output.ingredients[0];
    expect(ingredient).toBeDefined();
    if (!ingredient) throw new Error("Fixture sem ingrediente.");
    ingredient.quantityG = 17;

    const result = recipeAiOutputSchema.safeParse(output);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("não fecha");
    }
  });
});
