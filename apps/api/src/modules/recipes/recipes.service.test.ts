import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../database/database.service";
import { RecipesService } from "./recipes.service";

const tenantId = "11111111-1111-4111-8111-111111111111";

function serviceWithoutDatabase() {
  return new RecipesService({ isConfigured: false } as DatabaseService);
}

describe("RecipesService", () => {
  it("projeta rendimento, custo e momentos da receita", async () => {
    const workspace = await serviceWithoutDatabase().getForTenant(tenantId);
    const recipe = workspace.recipes[0];

    expect(recipe?.status).toBe("published");
    expect(recipe?.name).toBe("Bolo de chocolate");
    expect(recipe?.yieldMassG).toBe(1_200);
    expect(recipe?.momentNames).toEqual([
      "Massa",
      "Ganache",
      "Desenforme",
      "Montagem",
      "Pronto",
    ]);
    expect(recipe?.estimatedCost).toBeGreaterThan(20);
    expect(recipe?.ingredients[0]?.ingredientName).toBe(
      "Chocolate meio amargo",
    );
    expect(recipe?.ingredients[0]?.usageStepName).toBe(
      "Preparar e assar a massa",
    );
    expect(recipe?.moments[1]?.steps[0]?.name).toBe("Preparar a ganache");
    expect(recipe?.moments.map((moment) => moment.preparationRole)).toEqual([
      "intermediate",
      "intermediate",
      "final",
      "final",
      "final",
    ]);
  });

  it("cria nova versão sem remover a publicada anteriormente", async () => {
    const service = serviceWithoutDatabase();
    const current = (await service.getForTenant(tenantId)).recipes[0]!;
    const openEdit = {
      name: current.name,
      yieldMassG: 1_300,
      yieldUnits: 14,
      status: "draft" as const,
      expectedLossPercentage: 2,
      ingredients: current.ingredients.map((ingredient) => ({
        ingredientGroupId: ingredient.ingredientGroupId,
        recipeStepRef: ingredient.recipeStepRef,
        quantityG: ingredient.quantityG,
        selectionPolicy: ingredient.selectionPolicy,
        preferredCommercialItemId:
          ingredient.preferredCommercialItemId ?? undefined,
        wastePercentage: ingredient.wastePercentage,
      })),
      moments: current.moments.map((moment) => ({
        name: moment.name,
        description: moment.description ?? undefined,
        preparationRole: moment.preparationRole,
        steps: moment.steps,
      })),
    };
    const result = await service.createVersion(tenantId, current.id, openEdit);

    expect(result.workspace.summary.recipeCount).toBe(1);
    expect(result.workspace.summary.publishedCount).toBe(1);
    expect(result.workspace.summary.draftCount).toBe(1);
    expect(result.workspace.recipes[0]?.versionNumber).toBe(2);
    expect(result.workspace.recipes[0]?.yieldMassG).toBe(1_300);
    await expect(
      service.createVersion(tenantId, current.id, openEdit),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("cria rascunho com ingrediente e momento", async () => {
    const service = serviceWithoutDatabase();
    const result = await service.create(tenantId, {
      name: "Taça de morango",
      yieldMassG: 500,
      status: "draft",
      expectedLossPercentage: 0,
      ingredients: [
        {
          ingredientGroupId: "33333333-3333-4333-8333-333333333333",
          recipeStepRef: "step-montagem",
          quantityG: 300,
          selectionPolicy: "generic",
          wastePercentage: 5,
          notes: "Morangos maduros e firmes",
        },
      ],
      moments: [
        {
          name: "Montagem",
          preparationRole: "final",
          steps: [
            {
              ref: "step-montagem",
              name: "Montar as taças",
              instructions: "Distribua o creme e os morangos nas taças.",
              durationMinutes: 20,
              kind: "assembly",
              parallelizable: false,
            },
          ],
        },
      ],
    });

    expect(result.workspace.summary.draftCount).toBe(1);
    expect(result.workspace.recipes[0]?.name).toBe("Taça de morango");
    expect(result.workspace.recipes[0]?.ingredients[0]?.notes).toBe(
      "Morangos maduros e firmes",
    );
  });
});
