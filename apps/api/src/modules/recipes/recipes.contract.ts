import { z } from "zod";

const ingredientSchema = z
  .object({
    ingredientGroupId: z.string().uuid(),
    recipeStepRef: z.string().trim().min(1).max(100),
    quantityG: z.number().positive().max(1_000_000),
    inputQuantity: z.number().positive().max(1_000_000).optional(),
    inputUnit: z.enum(["g", "kg", "mg", "ml", "unit"]).optional(),
    conversionFactorToG: z.number().positive().max(1_000_000).optional(),
    conversionSource: z.string().trim().min(2).max(240).optional(),
    conversionConfidence: z
      .enum(["provided", "imported", "inferred"])
      .optional(),
    notes: z.string().trim().max(500).optional(),
    selectionPolicy: z.enum(["generic", "preferred", "required"]),
    preferredCommercialItemId: z.string().uuid().optional(),
    wastePercentage: z.number().min(0).max(100).default(0),
  })
  .refine(
    (value) =>
      value.selectionPolicy === "generic" ||
      Boolean(value.preferredCommercialItemId),
    "Escolha o produto comprado para uma preferência ou exigência.",
  );

const stepSchema = z.object({
  ref: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(120),
  instructions: z.string().trim().min(2).max(2_000),
  durationMinutes: z.number().int().min(0).max(10_080),
  kind: z.enum([
    "active",
    "heating",
    "oven",
    "rest",
    "cooling",
    "cold",
    "assembly",
  ]),
  requiredEquipmentKind: z
    .enum(["oven", "mixer", "refrigeration", "stove", "utensil", "other"])
    .nullable()
    .optional(),
  parallelizable: z.boolean().default(false),
});

const momentSchema = z.object({
  ref: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
  preparationRole: z.enum(["intermediate", "final"]).default("final"),
  steps: z.array(stepSchema).min(1).max(30),
});

const subrecipeSchema = z.object({
  referencedRecipeVersionId: z.string().uuid(),
  recipeMomentRef: z.string().trim().min(1).max(100),
  requiredYieldG: z.number().positive().max(1_000_000),
  notes: z.string().trim().max(300).optional(),
});

const dependencySchema = z.object({
  predecessorStepRef: z.string().trim().min(1).max(100),
  successorStepRef: z.string().trim().min(1).max(100),
});

const recipeSourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  url: z.url().refine((value) => /^https?:\/\//i.test(value), {
    message: "A fonte precisa ser uma página http ou https.",
  }),
  author: z.string().trim().min(2).max(160).nullable().optional(),
  accessedAt: z.iso.datetime(),
  method: z.enum(["structured_data", "llm"]),
  warnings: z.array(z.string().trim().min(2).max(500)).max(50).default([]),
});

export const recipeImportRequestSchema = z.object({
  url: z.url().refine((value) => /^https?:\/\//i.test(value), {
    message: "Informe uma página http ou https.",
  }),
  name: z.string().trim().min(2).max(140).optional(),
});

export const createRecipeSchema = z
  .object({
    name: z.string().trim().min(2).max(140),
    yieldMassG: z.number().positive().max(1_000_000),
    yieldUnits: z.number().int().positive().max(100_000).optional(),
    expectedLossPercentage: z.number().min(0).max(100).default(0),
    status: z.enum(["draft", "published"]).default("draft"),
    ingredients: z.array(ingredientSchema).min(1).max(100),
    moments: z.array(momentSchema).min(1).max(30),
    subrecipes: z.array(subrecipeSchema).max(30).optional(),
    dependencies: z.array(dependencySchema).max(200).optional(),
    source: recipeSourceSchema.optional(),
  })
  .superRefine((value, context) => {
    const names = value.moments.map((moment) =>
      moment.name.toLocaleLowerCase("pt-BR"),
    );
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        path: ["moments"],
        message: "Os momentos da receita precisam ter nomes diferentes.",
      });
    }
    const stepRefs = value.moments.flatMap((moment) =>
      moment.steps.map((step) => step.ref),
    );
    if (new Set(stepRefs).size !== stepRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["moments"],
        message: "As etapas da receita precisam ter referências diferentes.",
      });
    }
    const knownStepRefs = new Set(stepRefs);
    value.ingredients.forEach((ingredient, index) => {
      if (!knownStepRefs.has(ingredient.recipeStepRef)) {
        context.addIssue({
          code: "custom",
          path: ["ingredients", index, "recipeStepRef"],
          message: "Escolha em qual etapa este ingrediente entra.",
        });
      }

      const inputQuantity = ingredient.inputQuantity ?? ingredient.quantityG;
      const inputUnit = ingredient.inputUnit ?? "g";
      const standardFactor =
        inputUnit === "kg"
          ? 1_000
          : inputUnit === "mg"
            ? 0.001
            : inputUnit === "g"
              ? 1
              : null;
      const factor = ingredient.conversionFactorToG ?? standardFactor;
      if (factor === null) {
        context.addIssue({
          code: "custom",
          path: ["ingredients", index, "conversionFactorToG"],
          message:
            inputUnit === "ml"
              ? "Informe a densidade em gramas por ml."
              : "Informe o peso líquido de uma unidade.",
        });
      } else {
        const converted = inputQuantity * factor;
        if (Math.abs(converted - ingredient.quantityG) > 0.01) {
          context.addIssue({
            code: "custom",
            path: ["ingredients", index, "quantityG"],
            message: "A quantidade convertida não confere com o peso usado.",
          });
        }
      }
      if (
        (inputUnit === "ml" || inputUnit === "unit") &&
        !ingredient.conversionSource
      ) {
        context.addIssue({
          code: "custom",
          path: ["ingredients", index, "conversionSource"],
          message: "Registre de onde veio esta conversão.",
        });
      }
    });

    const momentRefs = new Set(
      value.moments.map((moment) => moment.ref ?? moment.name),
    );
    (value.subrecipes ?? []).forEach((subrecipe, index) => {
      if (!momentRefs.has(subrecipe.recipeMomentRef)) {
        context.addIssue({
          code: "custom",
          path: ["subrecipes", index, "recipeMomentRef"],
          message: "Escolha o momento que receberá esta sub-receita.",
        });
      }
    });

    const dependencies = value.dependencies ?? [];
    const dependencyKeys = new Set<string>();
    const successors = new Map<string, string[]>();
    dependencies.forEach((dependency, index) => {
      if (
        !knownStepRefs.has(dependency.predecessorStepRef) ||
        !knownStepRefs.has(dependency.successorStepRef)
      ) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index],
          message: "A precedência aponta para uma etapa que não existe.",
        });
      }
      if (dependency.predecessorStepRef === dependency.successorStepRef) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index],
          message: "Uma etapa não pode depender dela mesma.",
        });
      }
      const key = `${dependency.predecessorStepRef}:${dependency.successorStepRef}`;
      if (dependencyKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index],
          message: "Esta precedência já foi informada.",
        });
      }
      dependencyKeys.add(key);
      successors.set(dependency.predecessorStepRef, [
        ...(successors.get(dependency.predecessorStepRef) ?? []),
        dependency.successorStepRef,
      ]);
    });
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function hasCycle(stepRef: string): boolean {
      if (visiting.has(stepRef)) return true;
      if (visited.has(stepRef)) return false;
      visiting.add(stepRef);
      const cyclic = (successors.get(stepRef) ?? []).some(hasCycle);
      visiting.delete(stepRef);
      visited.add(stepRef);
      return cyclic;
    }
    if (stepRefs.some(hasCycle)) {
      context.addIssue({
        code: "custom",
        path: ["dependencies"],
        message: "As precedências formam um ciclo. Reveja a ordem das etapas.",
      });
    }
  });

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type RecipeImportRequest = z.infer<typeof recipeImportRequestSchema>;

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

export type CreateRecipeResult = {
  message: string;
  recipeId: string;
  workspace: RecipeWorkspace;
};
