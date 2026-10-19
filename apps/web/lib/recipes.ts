export type RecipeCatalogGroup = {
  id: string;
  name: string;
  category: string;
  items: Array<{
    id: string;
    displayName: string;
    brandName: string | null;
    lastUnitCost: number;
  }>;
};

export type RecipeSummary = {
  id: string;
  versionId: string;
  name: string;
  versionNumber: number;
  status: "draft" | "published";
  yieldMassG: number;
  yieldUnits: number | null;
  ingredientCount: number;
  momentNames: string[];
  durationMinutes: number;
  estimatedCost: number;
  costPer100G: number;
  expectedLossPercentage: number;
  source: {
    name: string;
    url: string;
    author: string | null;
    accessedAt: string;
    method: "structured_data" | "llm";
    warnings: string[];
  } | null;
  ingredients: Array<{
    ingredientGroupId: string;
    recipeStepRef: string;
    ingredientName: string;
    category: string;
    quantityG: number;
    inputQuantity: number;
    inputUnit: "g" | "kg" | "mg" | "ml" | "unit";
    conversionFactorToG: number;
    conversionSource: string | null;
    conversionConfidence: "provided" | "imported" | "inferred";
    notes: string | null;
    selectionPolicy: "generic" | "preferred" | "required";
    preferredCommercialItemId: string | null;
    preferredCommercialItemName: string | null;
    wastePercentage: number;
    usageMomentName: string | null;
    usageStepName: string | null;
  }>;
  moments: Array<{
    ref: string;
    name: string;
    description: string | null;
    preparationRole: "intermediate" | "final";
    steps: Array<{
      ref: string;
      name: string;
      instructions: string;
      durationMinutes: number;
      kind:
        | "active"
        | "heating"
        | "oven"
        | "rest"
        | "cooling"
        | "cold"
        | "assembly";
      requiredEquipmentKind:
        | "oven"
        | "mixer"
        | "refrigeration"
        | "stove"
        | "utensil"
        | "other"
        | null;
      parallelizable: boolean;
      predecessorStepRefs: string[];
    }>;
  }>;
  subrecipes: Array<{
    referencedRecipeVersionId: string;
    recipeId: string;
    recipeName: string;
    versionNumber: number;
    recipeMomentRef: string;
    recipeMomentName: string | null;
    requiredYieldG: number;
    notes: string | null;
    estimatedCost: number;
  }>;
  updatedAt: string;
};

export type RecipeWorkspace = {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  summary: {
    recipeCount: number;
    publishedCount: number;
    draftCount: number;
  };
  catalog: RecipeCatalogGroup[];
  availableSubrecipes: Array<{
    recipeId: string;
    recipeVersionId: string;
    recipeName: string;
    versionNumber: number;
    yieldMassG: number;
  }>;
  recipes: RecipeSummary[];
};

export type RecipeImportPreview = {
  source: {
    name: string;
    url: string;
    author: string | null;
    accessedAt: string;
    method: "structured_data" | "llm";
  };
  name: string;
  yieldMassG: number;
  yieldUnits: number | null;
  expectedLossPercentage: number;
  totalDurationMinutes: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  ingredients: Array<{
    originalText: string;
    name: string;
    category: string;
    notes: string | null;
    inputQuantity: number;
    inputUnit: "g" | "kg" | "mg" | "ml" | "unit";
    quantityG: number;
    conversionFactorToG: number;
    conversionSource: string | null;
    conversionConfidence: "imported" | "inferred";
    perishable: boolean;
    warnings: string[];
    matchedGroupId: string | null;
    matchedGroupName: string | null;
    catalogAction: "reuse" | "create";
  }>;
  moments: Array<{
    ref: string;
    name: string;
    description: string;
    preparationRole: "intermediate" | "final";
    steps: Array<{
      ref: string;
      name: string;
      instructions: string;
      durationMinutes: number;
      kind:
        | "active"
        | "heating"
        | "oven"
        | "rest"
        | "cooling"
        | "cold"
        | "assembly";
      requiredEquipmentKind:
        | "oven"
        | "mixer"
        | "refrigeration"
        | "stove"
        | "utensil"
        | "other"
        | null;
      parallelizable: boolean;
    }>;
  }>;
};

export function scaleRecipe(recipe: RecipeSummary, targetMassG: number) {
  const safeTargetMassG = Number.isFinite(targetMassG)
    ? Math.max(0, targetMassG)
    : 0;
  const factor = safeTargetMassG / recipe.yieldMassG;

  return {
    targetMassG: safeTargetMassG,
    factor,
    estimatedCost: recipe.estimatedCost * factor,
    estimatedUnits:
      recipe.yieldUnits === null ? null : recipe.yieldUnits * factor,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ingredientGroupId: ingredient.ingredientGroupId,
      recipeStepRef: ingredient.recipeStepRef,
      ingredientName: ingredient.ingredientName,
      quantityG: ingredient.quantityG * factor,
    })),
    subrecipes: recipe.subrecipes.map((subrecipe) => ({
      ...subrecipe,
      requiredYieldG: subrecipe.requiredYieldG * factor,
      estimatedCost: subrecipe.estimatedCost * factor,
    })),
  };
}

export const demoRecipes: RecipeWorkspace = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  tenantName: "Stefanie Dellavolpe Doces",
  ownerName: "Stefanie",
  summary: { recipeCount: 1, publishedCount: 1, draftCount: 0 },
  availableSubrecipes: [
    {
      recipeId: "81111111-1111-4111-8111-111111111111",
      recipeVersionId: "82111111-1111-4111-8111-111111111111",
      recipeName: "Bolo de chocolate",
      versionNumber: 1,
      yieldMassG: 1_200,
    },
  ],
  catalog: [
    {
      id: "31111111-1111-4111-8111-111111111111",
      name: "Chocolate meio amargo",
      category: "Chocolates",
      items: [
        {
          id: "51111111-1111-4111-8111-111111111111",
          displayName: "Harald Melken meio amargo 1,01 kg",
          brandName: "Harald",
          lastUnitCost: 67.8 / 2_020,
        },
        {
          id: "52222222-2222-4222-8222-222222222222",
          displayName: "Sicao Nobre meio amargo 1,01 kg",
          brandName: "Sicao",
          lastUnitCost: 31.9 / 1_010,
        },
      ],
    },
    {
      id: "32222222-2222-4222-8222-222222222222",
      name: "Chantilly",
      category: "Cremes e laticínios",
      items: [
        {
          id: "53333333-3333-4333-8333-333333333333",
          displayName: "Chantilly Amélia 1 L",
          brandName: "Amélia",
          lastUnitCost: 19.9 / 1_000,
        },
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Morango",
      category: "Frutas",
      items: [
        {
          id: "54444444-4444-4444-8444-444444444444",
          displayName: "Morango fresco bandeja 250 g",
          brandName: null,
          lastUnitCost: 0,
        },
      ],
    },
  ],
  recipes: [
    {
      id: "81111111-1111-4111-8111-111111111111",
      versionId: "82111111-1111-4111-8111-111111111111",
      name: "Bolo de chocolate",
      versionNumber: 1,
      status: "published",
      yieldMassG: 1_200,
      yieldUnits: 12,
      ingredientCount: 2,
      momentNames: ["Massa", "Ganache", "Desenforme", "Montagem", "Pronto"],
      durationMinutes: 180,
      estimatedCost: 23.09,
      costPer100G: 1.92,
      expectedLossPercentage: 3,
      source: null,
      ingredients: [
        {
          ingredientGroupId: "31111111-1111-4111-8111-111111111111",
          recipeStepRef: "demo-step-massa",
          ingredientName: "Chocolate meio amargo",
          category: "Chocolates",
          quantityG: 500,
          inputQuantity: 500,
          inputUnit: "g",
          conversionFactorToG: 1,
          conversionSource: null,
          conversionConfidence: "provided",
          notes: null,
          selectionPolicy: "preferred",
          preferredCommercialItemId: "51111111-1111-4111-8111-111111111111",
          preferredCommercialItemName: "Harald Melken meio amargo 1,01 kg",
          wastePercentage: 2,
          usageMomentName: "Massa",
          usageStepName: "Preparar e assar a massa",
        },
        {
          ingredientGroupId: "32222222-2222-4222-8222-222222222222",
          recipeStepRef: "demo-step-ganache",
          ingredientName: "Chantilly",
          category: "Cremes e laticínios",
          quantityG: 300,
          inputQuantity: 300,
          inputUnit: "g",
          conversionFactorToG: 1,
          conversionSource: null,
          conversionConfidence: "provided",
          notes: null,
          selectionPolicy: "preferred",
          preferredCommercialItemId: "53333333-3333-4333-8333-333333333333",
          preferredCommercialItemName: "Chantilly Amélia 1 L",
          wastePercentage: 0,
          usageMomentName: "Ganache",
          usageStepName: "Preparar a ganache",
        },
      ],
      moments: [
        [
          "Massa",
          "Preparar e assar a massa",
          "Misture a massa e asse até o centro firmar.",
          55,
          "oven",
          false,
          "oven",
          "intermediate",
        ],
        [
          "Ganache",
          "Preparar a ganache",
          "Aqueça o creme e incorpore ao chocolate.",
          25,
          "active",
          true,
          null,
          "intermediate",
        ],
        [
          "Desenforme",
          "Resfriar e desenformar",
          "Aguarde o resfriamento antes de desenformar.",
          50,
          "cooling",
          true,
          null,
          "final",
        ],
        [
          "Montagem",
          "Rechear e finalizar",
          "Monte as camadas e aplique o acabamento.",
          40,
          "assembly",
          false,
          null,
          "final",
        ],
        [
          "Pronto",
          "Conferir e embalar",
          "Confira acabamento, peso e embalagem.",
          10,
          "active",
          false,
          null,
          "final",
        ],
      ].map(
        ([
          momentName,
          stepName,
          instructions,
          durationMinutes,
          kind,
          parallelizable,
          requiredEquipmentKind,
          preparationRole,
        ]) => ({
          ref: `demo-moment-${(momentName as string)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("pt-BR")}`,
          name: momentName as string,
          description: null,
          preparationRole: preparationRole as "intermediate" | "final",
          steps: [
            {
              ref: `demo-step-${(momentName as string)
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLocaleLowerCase("pt-BR")}`,
              name: stepName as string,
              instructions: instructions as string,
              durationMinutes: durationMinutes as number,
              kind: kind as RecipeSummary["moments"][number]["steps"][number]["kind"],
              requiredEquipmentKind:
                requiredEquipmentKind as RecipeSummary["moments"][number]["steps"][number]["requiredEquipmentKind"],
              parallelizable: parallelizable as boolean,
              predecessorStepRefs:
                momentName === "Desenforme"
                  ? ["demo-step-massa"]
                  : momentName === "Montagem"
                    ? ["demo-step-ganache", "demo-step-desenforme"]
                    : momentName === "Pronto"
                      ? ["demo-step-montagem"]
                      : [],
            },
          ],
        }),
      ),
      subrecipes: [],
      updatedAt: "2026-08-24T12:00:00-03:00",
    },
  ],
};

export async function getRecipes(
  requestHeaders?: HeadersInit,
): Promise<RecipeWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };

  try {
    let response = await fetch(`${apiUrl}/recipes`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return demoRecipes;
    let workspace = (await response.json()) as RecipeWorkspace;
    if (
      process.env.NODE_ENV !== "production" &&
      apiUrl === "http://localhost:3111/v1" &&
      workspace.recipes.some((recipe) => !Array.isArray(recipe.ingredients))
    ) {
      response = await fetch("http://localhost:3112/v1/recipes", {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) workspace = (await response.json()) as RecipeWorkspace;
    }
    return {
      ...workspace,
      availableSubrecipes:
        workspace.availableSubrecipes ?? demoRecipes.availableSubrecipes,
      recipes: workspace.recipes.map((recipe) => {
        const demo = demoRecipes.recipes.find(
          (candidate) => candidate.id === recipe.id,
        );
        return {
          ...demo,
          ...recipe,
          name:
            recipe.id === "81111111-1111-4111-8111-111111111111" &&
            recipe.name === "Bolo de chocolate da Marina"
              ? "Bolo de chocolate"
              : recipe.name,
          expectedLossPercentage:
            recipe.expectedLossPercentage ?? demo?.expectedLossPercentage ?? 0,
          ingredients: recipe.ingredients ?? demo?.ingredients ?? [],
          moments: recipe.moments ?? demo?.moments ?? [],
          subrecipes: recipe.subrecipes ?? demo?.subrecipes ?? [],
        };
      }),
    };
  } catch {
    return demoRecipes;
  }
}
