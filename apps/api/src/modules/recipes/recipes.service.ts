import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  appUsers,
  brands,
  commercialItems,
  ingredientCategories,
  ingredientGroups,
  memberships,
  purchaseLots,
  recipeLines,
  recipeMoments,
  recipes,
  recipeStepDependencies,
  recipeSteps,
  recipeSubrecipeLines,
  recipeVersions,
  tenants,
} from "../../database/schema";
import {
  importRecipeFromUrl,
  type ImportedRecipeDraft,
} from "./recipe-importer";
import type {
  CreateRecipeInput,
  CreateRecipeResult,
  RecipeCatalogGroup,
  RecipeSummary,
  RecipeWorkspace,
} from "./recipes.contract";

type StoredRecipe = {
  id: string;
  versionId: string;
  versionNumber: number;
  createdAt: string;
  input: CreateRecipeInput;
};

const demoTenantId = "11111111-1111-4111-8111-111111111111";

const demoCatalog: RecipeCatalogGroup[] = [
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
];

const demoRecipe: StoredRecipe = {
  id: "81111111-1111-4111-8111-111111111111",
  versionId: "82111111-1111-4111-8111-111111111111",
  versionNumber: 1,
  createdAt: "2026-08-24T12:00:00-03:00",
  input: {
    name: "Bolo de chocolate",
    yieldMassG: 1_200,
    yieldUnits: 12,
    expectedLossPercentage: 3,
    status: "published",
    ingredients: [
      {
        ingredientGroupId: "31111111-1111-4111-8111-111111111111",
        recipeStepRef: "demo-step-massa",
        quantityG: 500,
        selectionPolicy: "preferred",
        preferredCommercialItemId: "51111111-1111-4111-8111-111111111111",
        wastePercentage: 2,
      },
      {
        ingredientGroupId: "32222222-2222-4222-8222-222222222222",
        recipeStepRef: "demo-step-ganache",
        quantityG: 300,
        selectionPolicy: "preferred",
        preferredCommercialItemId: "53333333-3333-4333-8333-333333333333",
        wastePercentage: 0,
      },
    ],
    moments: [
      {
        ref: "demo-moment-massa",
        name: "Massa",
        preparationRole: "intermediate",
        steps: [
          {
            ref: "demo-step-massa",
            name: "Preparar e assar a massa",
            instructions: "Misture a massa e asse até o centro firmar.",
            durationMinutes: 55,
            kind: "oven",
            requiredEquipmentKind: "oven",
            parallelizable: false,
          },
        ],
      },
      {
        ref: "demo-moment-ganache",
        name: "Ganache",
        preparationRole: "intermediate",
        steps: [
          {
            ref: "demo-step-ganache",
            name: "Preparar a ganache",
            instructions: "Aqueça o creme e incorpore ao chocolate.",
            durationMinutes: 25,
            kind: "active",
            requiredEquipmentKind: undefined,
            parallelizable: true,
          },
        ],
      },
      {
        ref: "demo-moment-desenforme",
        name: "Desenforme",
        preparationRole: "final",
        steps: [
          {
            ref: "demo-step-desenforme",
            name: "Resfriar e desenformar",
            instructions: "Aguarde o resfriamento antes de desenformar.",
            durationMinutes: 50,
            kind: "cooling",
            requiredEquipmentKind: undefined,
            parallelizable: true,
          },
        ],
      },
      {
        ref: "demo-moment-montagem",
        name: "Montagem",
        preparationRole: "final",
        steps: [
          {
            ref: "demo-step-montagem",
            name: "Rechear e finalizar",
            instructions: "Monte as camadas e aplique o acabamento.",
            durationMinutes: 40,
            kind: "assembly",
            requiredEquipmentKind: undefined,
            parallelizable: false,
          },
        ],
      },
      {
        ref: "demo-moment-pronto",
        name: "Pronto",
        preparationRole: "final",
        steps: [
          {
            ref: "demo-step-pronto",
            name: "Conferir e embalar",
            instructions: "Confira acabamento, peso e embalagem.",
            durationMinutes: 10,
            kind: "active",
            requiredEquipmentKind: undefined,
            parallelizable: false,
          },
        ],
      },
    ],
    dependencies: [
      {
        predecessorStepRef: "demo-step-massa",
        successorStepRef: "demo-step-desenforme",
      },
      {
        predecessorStepRef: "demo-step-ganache",
        successorStepRef: "demo-step-montagem",
      },
      {
        predecessorStepRef: "demo-step-desenforme",
        successorStepRef: "demo-step-montagem",
      },
      {
        predecessorStepRef: "demo-step-montagem",
        successorStepRef: "demo-step-pronto",
      },
    ],
    subrecipes: [],
  },
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ingredientCost(
  input: CreateRecipeInput,
  catalog: RecipeCatalogGroup[],
) {
  return input.ingredients.reduce((total, line) => {
    const group = catalog.find((entry) => entry.id === line.ingredientGroupId);
    const preferred = group?.items.find(
      (item) => item.id === line.preferredCommercialItemId,
    );
    const reference =
      preferred ??
      [...(group?.items ?? [])].sort(
        (left, right) => left.lastUnitCost - right.lastUnitCost,
      )[0];
    const quantityWithWaste = line.quantityG * (1 + line.wastePercentage / 100);
    return total + quantityWithWaste * (reference?.lastUnitCost ?? 0);
  }, 0);
}

function recipeCost(
  stored: StoredRecipe,
  catalog: RecipeCatalogGroup[],
  recipesByVersion: Map<string, StoredRecipe>,
  trail = new Set<string>(),
): number {
  if (trail.has(stored.versionId)) return 0;
  const nextTrail = new Set(trail).add(stored.versionId);
  return (
    ingredientCost(stored.input, catalog) +
    (stored.input.subrecipes ?? []).reduce((total, line) => {
      const referenced = recipesByVersion.get(line.referencedRecipeVersionId);
      if (!referenced) return total;
      const factor = line.requiredYieldG / referenced.input.yieldMassG;
      return (
        total +
        recipeCost(referenced, catalog, recipesByVersion, nextTrail) * factor
      );
    }, 0)
  );
}

function recipeDuration(
  stored: StoredRecipe,
  recipesByVersion: Map<string, StoredRecipe>,
  trail = new Set<string>(),
): number {
  if (trail.has(stored.versionId)) return 0;
  const nextTrail = new Set(trail).add(stored.versionId);
  const ownDuration = stored.input.moments.reduce(
    (total, moment) =>
      total +
      moment.steps.reduce(
        (subtotal, step) => subtotal + step.durationMinutes,
        0,
      ),
    0,
  );
  return (
    ownDuration +
    (stored.input.subrecipes ?? []).reduce((total, line) => {
      const referenced = recipesByVersion.get(line.referencedRecipeVersionId);
      return referenced
        ? total + recipeDuration(referenced, recipesByVersion, nextTrail)
        : total;
    }, 0)
  );
}

function toSummary(
  stored: StoredRecipe,
  catalog: RecipeCatalogGroup[],
  recipesByVersion: Map<string, StoredRecipe>,
): RecipeSummary {
  const estimatedCost = recipeCost(stored, catalog, recipesByVersion);
  const dependencies = stored.input.dependencies ?? [];
  const ingredientDetails = stored.input.ingredients.map((line) => {
    const group = catalog.find((entry) => entry.id === line.ingredientGroupId);
    const preferred = group?.items.find(
      (item) => item.id === line.preferredCommercialItemId,
    );
    const usageMoment = stored.input.moments.find((moment) =>
      moment.steps.some((step) => step.ref === line.recipeStepRef),
    );
    const usageStep = usageMoment?.steps.find(
      (step) => step.ref === line.recipeStepRef,
    );
    return {
      ingredientGroupId: line.ingredientGroupId,
      recipeStepRef: line.recipeStepRef,
      ingredientName: group?.name ?? "Ingrediente indisponível",
      category: group?.category ?? "Sem categoria",
      quantityG: line.quantityG,
      inputQuantity: line.inputQuantity ?? line.quantityG,
      inputUnit: line.inputUnit ?? "g",
      conversionFactorToG: line.conversionFactorToG ?? 1,
      conversionSource: line.conversionSource ?? null,
      conversionConfidence: line.conversionConfidence ?? "provided",
      notes: line.notes ?? null,
      selectionPolicy: line.selectionPolicy,
      preferredCommercialItemId: line.preferredCommercialItemId ?? null,
      preferredCommercialItemName: preferred?.displayName ?? null,
      wastePercentage: line.wastePercentage,
      usageMomentName: usageMoment?.name ?? null,
      usageStepName: usageStep?.name ?? null,
    };
  });
  return {
    id: stored.id,
    versionId: stored.versionId,
    name: stored.input.name,
    versionNumber: stored.versionNumber,
    status: stored.input.status,
    yieldMassG: stored.input.yieldMassG,
    yieldUnits: stored.input.yieldUnits ?? null,
    ingredientCount: stored.input.ingredients.length,
    momentNames: stored.input.moments.map((moment) => moment.name),
    durationMinutes: recipeDuration(stored, recipesByVersion),
    estimatedCost,
    costPer100G: (estimatedCost / stored.input.yieldMassG) * 100,
    expectedLossPercentage: stored.input.expectedLossPercentage,
    source: stored.input.source
      ? {
          ...stored.input.source,
          author: stored.input.source.author ?? null,
        }
      : null,
    ingredients: ingredientDetails,
    moments: stored.input.moments.map((moment) => ({
      ref: moment.ref ?? moment.name,
      name: moment.name,
      description: moment.description ?? null,
      preparationRole: moment.preparationRole,
      steps: moment.steps.map((step) => ({
        ...step,
        requiredEquipmentKind: step.requiredEquipmentKind ?? null,
        predecessorStepRefs: dependencies
          .filter((entry) => entry.successorStepRef === step.ref)
          .map((entry) => entry.predecessorStepRef),
      })),
    })),
    subrecipes: (stored.input.subrecipes ?? []).map((line) => {
      const referenced = recipesByVersion.get(line.referencedRecipeVersionId);
      const moment = stored.input.moments.find(
        (entry) => (entry.ref ?? entry.name) === line.recipeMomentRef,
      );
      const componentCost = referenced
        ? recipeCost(referenced, catalog, recipesByVersion) *
          (line.requiredYieldG / referenced.input.yieldMassG)
        : 0;
      return {
        referencedRecipeVersionId: line.referencedRecipeVersionId,
        recipeId: referenced?.id ?? "",
        recipeName: referenced?.input.name ?? "Receita indisponível",
        versionNumber: referenced?.versionNumber ?? 0,
        recipeMomentRef: line.recipeMomentRef,
        recipeMomentName: moment?.name ?? null,
        requiredYieldG: line.requiredYieldG,
        notes: line.notes ?? null,
        estimatedCost: componentCost,
      };
    }),
    updatedAt: stored.createdAt,
  };
}

function workspaceFor(
  tenantId: string,
  catalog: RecipeCatalogGroup[],
  storedRecipes: StoredRecipe[],
  identity?: { tenantName: string; ownerName: string },
): RecipeWorkspace {
  const latestRecipes = [...storedRecipes]
    .sort((left, right) => right.versionNumber - left.versionNumber)
    .filter(
      (recipe, index, all) =>
        all.findIndex((candidate) => candidate.id === recipe.id) === index,
    );
  const recipesByVersion = new Map(
    storedRecipes.map((recipe) => [recipe.versionId, recipe]),
  );
  const summaries = latestRecipes
    .map((recipe) => toSummary(recipe, catalog, recipesByVersion))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const recipeIds = new Set(storedRecipes.map((recipe) => recipe.id));
  return {
    tenantId,
    tenantName:
      identity?.tenantName ??
      (tenantId === demoTenantId
        ? "Stefanie Dellavolpe Doces"
        : "Confeitaria Vizinha"),
    ownerName:
      identity?.ownerName ??
      (tenantId === demoTenantId ? "Stefanie" : "Proprietária"),
    summary: {
      recipeCount: recipeIds.size,
      publishedCount: [...recipeIds].filter((recipeId) =>
        storedRecipes.some(
          (recipe) =>
            recipe.id === recipeId && recipe.input.status === "published",
        ),
      ).length,
      draftCount: [...recipeIds].filter((recipeId) =>
        storedRecipes.some(
          (recipe) => recipe.id === recipeId && recipe.input.status === "draft",
        ),
      ).length,
    },
    catalog,
    availableSubrecipes: storedRecipes
      .filter((recipe) => recipe.input.status === "published")
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .map((recipe) => ({
        recipeId: recipe.id,
        recipeVersionId: recipe.versionId,
        recipeName: recipe.input.name,
        versionNumber: recipe.versionNumber,
        yieldMassG: recipe.input.yieldMassG,
      })),
    recipes: summaries,
  };
}

@Injectable()
export class RecipesService {
  private readonly memory = new Map<string, StoredRecipe[]>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getForTenant(tenantId: string): Promise<RecipeWorkspace> {
    if (!this.database.isConfigured) {
      const stored = this.memory.get(tenantId) ?? [structuredClone(demoRecipe)];
      this.memory.set(tenantId, stored);
      return workspaceFor(tenantId, demoCatalog, stored);
    }

    return this.database.withTenant(tenantId, (transaction) =>
      this.loadWorkspace(transaction, tenantId),
    );
  }

  async create(
    tenantId: string,
    input: CreateRecipeInput,
  ): Promise<CreateRecipeResult> {
    this.validateCatalogReferences(input, await this.catalogFor(tenantId));
    await this.validateSubrecipeReferences(tenantId, null, input);

    let recipeId: string;
    if (!this.database.isConfigured) {
      const stored = this.memory.get(tenantId) ?? [structuredClone(demoRecipe)];
      this.memory.set(tenantId, stored);
      if (
        stored.some(
          (recipe) => normalize(recipe.input.name) === normalize(input.name),
        )
      ) {
        throw new ConflictException("Já existe uma receita com esse nome.");
      }
      recipeId = randomUUID();
      stored.push({
        id: recipeId,
        versionId: randomUUID(),
        versionNumber: 1,
        createdAt: new Date().toISOString(),
        input: structuredClone(input),
      });
    } else {
      recipeId = await this.database.withTenant(tenantId, (transaction) =>
        this.createInDatabase(transaction, tenantId, input),
      );
    }

    return {
      message:
        input.status === "published"
          ? "Receita publicada. Ela já pode ser usada em pedidos."
          : "Receita guardada em edição. Você pode continuar quando quiser.",
      recipeId,
      workspace: await this.getForTenant(tenantId),
    };
  }

  async previewImport(tenantId: string, url: string) {
    const draft = await this.readImport(url);
    const catalog = await this.catalogFor(tenantId);
    return {
      ...draft,
      ingredients: draft.ingredients.map((ingredient) => {
        const matched = catalog.find(
          (group) => normalize(group.name) === normalize(ingredient.name),
        );
        return {
          ...ingredient,
          matchedGroupId: matched?.id ?? null,
          matchedGroupName: matched?.name ?? null,
          catalogAction: matched ? ("reuse" as const) : ("create" as const),
        };
      }),
    };
  }

  async createImportedDraft(tenantId: string, url: string, name?: string) {
    if (!this.database.isConfigured) {
      throw new ServiceUnavailableException(
        "A importação automática precisa do banco de dados local ativo.",
      );
    }
    const draft = await this.readImport(url);
    const recipeId = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const categories = await transaction
          .select()
          .from(ingredientCategories);
        const groups = await transaction.select().from(ingredientGroups);
        const categoryByName = new Map(
          categories.map((category) => [category.normalizedName, category]),
        );
        const groupByName = new Map(
          groups.map((group) => [group.normalizedName, group]),
        );
        const groupIds: string[] = [];

        for (const ingredient of draft.ingredients) {
          const normalizedGroupName = normalize(ingredient.name);
          let group = groupByName.get(normalizedGroupName);
          if (!group) {
            const normalizedCategoryName = normalize(ingredient.category);
            let category = categoryByName.get(normalizedCategoryName);
            if (!category) {
              [category] = await transaction
                .insert(ingredientCategories)
                .values({
                  tenantId,
                  name: ingredient.category,
                  normalizedName: normalizedCategoryName,
                  kind: "ingredient",
                })
                .returning();
              if (!category)
                throw new ConflictException(
                  "Não foi possível criar a categoria sugerida.",
                );
              categoryByName.set(normalizedCategoryName, category);
            }
            [group] = await transaction
              .insert(ingredientGroups)
              .values({
                tenantId,
                name: ingredient.name,
                normalizedName: normalizedGroupName,
                categoryId: category.id,
                category: category.name,
                baseDimension: "mass",
                baseUnit: "g",
                perishable: ingredient.perishable,
              })
              .returning();
            if (!group)
              throw new ConflictException(
                "Não foi possível criar o ingrediente sugerido.",
              );
            groupByName.set(normalizedGroupName, group);
          }
          groupIds.push(group.id);
        }

        const input: CreateRecipeInput = {
          name: name?.trim() || draft.name,
          yieldMassG: draft.yieldMassG,
          yieldUnits: draft.yieldUnits ?? undefined,
          expectedLossPercentage: draft.expectedLossPercentage,
          status: "draft",
          ingredients: draft.ingredients.map((ingredient, index) => ({
            ingredientGroupId: groupIds[index]!,
            recipeStepRef: draft.ingredientStepRefs[index]!,
            quantityG: ingredient.quantityG,
            inputQuantity: ingredient.inputQuantity,
            inputUnit: ingredient.inputUnit,
            conversionFactorToG: ingredient.conversionFactorToG,
            conversionSource: ingredient.conversionSource ?? undefined,
            conversionConfidence: ingredient.conversionConfidence,
            notes: ingredient.notes ?? undefined,
            selectionPolicy: "generic",
            wastePercentage: 0,
          })),
          moments: draft.moments,
          dependencies: draft.dependencies,
          subrecipes: [],
          source: {
            ...draft.source,
            warnings: draft.warnings,
          },
        };
        return this.createInDatabase(transaction, tenantId, input);
      },
    );

    return {
      message:
        "Receita importada e aberta para revisão. Ela só ficará disponível para pedidos depois da publicação.",
      recipeId,
      workspace: await this.getForTenant(tenantId),
    } satisfies CreateRecipeResult;
  }

  private async readImport(url: string): Promise<ImportedRecipeDraft> {
    try {
      return await importRecipeFromUrl(url);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : "Não foi possível interpretar esta receita.",
      );
    }
  }

  async createVersion(
    tenantId: string,
    recipeId: string,
    input: CreateRecipeInput,
  ): Promise<CreateRecipeResult> {
    this.validateCatalogReferences(input, await this.catalogFor(tenantId));
    await this.validateSubrecipeReferences(tenantId, recipeId, input);

    if (!this.database.isConfigured) {
      const stored = this.memory.get(tenantId) ?? [structuredClone(demoRecipe)];
      this.memory.set(tenantId, stored);
      const versions = stored.filter((recipe) => recipe.id === recipeId);
      if (versions.length === 0) {
        throw new NotFoundException("Esta receita não foi encontrada.");
      }
      if (versions.some((recipe) => recipe.input.status === "draft")) {
        throw new ConflictException(
          "Esta receita já possui uma edição em andamento. Abra essa edição para continuar.",
        );
      }
      const versionNumber =
        Math.max(...versions.map((recipe) => recipe.versionNumber)) + 1;
      stored.push({
        id: recipeId,
        versionId: randomUUID(),
        versionNumber,
        createdAt: new Date().toISOString(),
        input: { ...structuredClone(input), name: versions[0]!.input.name },
      });
    } else {
      await this.database.withTenant(tenantId, (transaction) =>
        this.createVersionInDatabase(transaction, tenantId, recipeId, input),
      );
    }

    return {
      message:
        input.status === "published"
          ? "Nova versão publicada. Pedidos antigos continuam usando a versão anterior."
          : "Nova edição guardada. A versão publicada continua disponível para pedidos.",
      recipeId,
      workspace: await this.getForTenant(tenantId),
    };
  }

  async updateDraft(
    tenantId: string,
    recipeId: string,
    input: CreateRecipeInput,
  ): Promise<CreateRecipeResult> {
    this.validateCatalogReferences(input, await this.catalogFor(tenantId));
    await this.validateSubrecipeReferences(tenantId, recipeId, input);

    if (!this.database.isConfigured) {
      const stored = this.memory.get(tenantId) ?? [structuredClone(demoRecipe)];
      this.memory.set(tenantId, stored);
      const draftIndex = stored.findIndex(
        (recipe) => recipe.id === recipeId && recipe.input.status === "draft",
      );
      if (draftIndex < 0) {
        throw new NotFoundException("Não há uma edição em andamento.");
      }
      const current = stored[draftIndex]!;
      stored[draftIndex] = {
        ...current,
        createdAt: new Date().toISOString(),
        input: structuredClone(input),
      };
    } else {
      await this.database.withTenant(tenantId, (transaction) =>
        this.updateDraftInDatabase(transaction, tenantId, recipeId, input),
      );
    }

    return {
      message:
        input.status === "published"
          ? "Edição publicada. Ela passa a ser a versão disponível para novos pedidos."
          : "Alterações da edição guardadas.",
      recipeId,
      workspace: await this.getForTenant(tenantId),
    };
  }

  private async catalogFor(tenantId: string) {
    if (!this.database.isConfigured) return demoCatalog;
    return this.database.withTenant(tenantId, async (transaction) => {
      const groups = await transaction
        .select()
        .from(ingredientGroups)
        .orderBy(asc(ingredientGroups.name));
      const items = await transaction.select().from(commercialItems);
      const allBrands = await transaction.select().from(brands);
      const lots = await transaction
        .select()
        .from(purchaseLots)
        .orderBy(desc(purchaseLots.entryDate));
      return this.buildCatalog(groups, items, allBrands, lots);
    });
  }

  private validateCatalogReferences(
    input: CreateRecipeInput,
    catalog: RecipeCatalogGroup[],
  ) {
    for (const line of input.ingredients) {
      const group = catalog.find(
        (entry) => entry.id === line.ingredientGroupId,
      );
      const preferred = line.preferredCommercialItemId
        ? group?.items.some(
            (item) => item.id === line.preferredCommercialItemId,
          )
        : true;
      if (!group || !preferred) {
        throw new ConflictException(
          "Um ingrediente ou produto comprado não pertence à despensa desta empresa.",
        );
      }
    }
  }

  private async validateSubrecipeReferences(
    tenantId: string,
    parentRecipeId: string | null,
    input: CreateRecipeInput,
  ) {
    const requested = input.subrecipes ?? [];
    if (requested.length === 0) return;

    const referencedVersionIds = new Set(
      requested.map((line) => line.referencedRecipeVersionId),
    );
    const candidates = !this.database.isConfigured
      ? (this.memory.get(tenantId) ?? [structuredClone(demoRecipe)])
      : await this.database.withTenant(tenantId, async (transaction) => {
          const allVersions = await transaction.select().from(recipeVersions);
          const allRecipes = await transaction.select().from(recipes);
          return allVersions.map(
            (version) =>
              ({
                id: version.recipeId,
                versionId: version.id,
                versionNumber: version.versionNumber,
                createdAt: version.createdAt.toISOString(),
                input: {
                  name:
                    allRecipes.find((recipe) => recipe.id === version.recipeId)
                      ?.name ?? "Receita",
                  yieldMassG: version.yieldMassG,
                  expectedLossPercentage: version.expectedLossPercentage,
                  status: version.status,
                  ingredients: [],
                  moments: [],
                },
              }) satisfies StoredRecipe,
          );
        });

    for (const versionId of referencedVersionIds) {
      const referenced = candidates.find(
        (candidate) => candidate.versionId === versionId,
      );
      if (!referenced || referenced.input.status !== "published") {
        throw new ConflictException(
          "Uma sub-receita não existe ou ainda não está publicada.",
        );
      }
      if (parentRecipeId && referenced.id === parentRecipeId) {
        throw new ConflictException(
          "Uma receita não pode incluir outra versão dela mesma.",
        );
      }
    }
  }

  private async createInDatabase(
    transaction: AppTransaction,
    tenantId: string,
    input: CreateRecipeInput,
  ) {
    const normalizedName = normalize(input.name);
    const existing = await transaction
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.normalizedName, normalizedName));
    if (existing.length > 0) {
      throw new ConflictException("Já existe uma receita com esse nome.");
    }

    const [recipe] = await transaction
      .insert(recipes)
      .values({ tenantId, name: input.name, normalizedName })
      .returning();
    if (!recipe)
      throw new ConflictException("Não foi possível criar a receita.");

    const [version] = await transaction
      .insert(recipeVersions)
      .values({
        tenantId,
        recipeId: recipe.id,
        versionNumber: 1,
        status: input.status,
        yieldMassG: input.yieldMassG,
        yieldUnits: input.yieldUnits,
        expectedLossPercentage: input.expectedLossPercentage,
        sourceName: input.source?.name,
        sourceUrl: input.source?.url,
        sourceAuthor: input.source?.author,
        sourceAccessedAt: input.source
          ? new Date(input.source.accessedAt)
          : undefined,
        importMethod: input.source?.method,
        importWarnings: input.source?.warnings ?? [],
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .returning();
    if (!version)
      throw new ConflictException("Não foi possível criar a versão.");

    await this.replaceVersionContents(transaction, tenantId, version.id, input);

    return recipe.id;
  }

  private async createVersionInDatabase(
    transaction: AppTransaction,
    tenantId: string,
    recipeId: string,
    input: CreateRecipeInput,
  ) {
    const [recipe] = await transaction
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    if (!recipe)
      throw new NotFoundException("Esta receita não foi encontrada.");

    const existingVersions = await transaction
      .select({ versionNumber: recipeVersions.versionNumber })
      .from(recipeVersions)
      .where(eq(recipeVersions.recipeId, recipeId))
      .orderBy(desc(recipeVersions.versionNumber));
    const [openEdit] = await transaction
      .select({ id: recipeVersions.id })
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.recipeId, recipeId),
          eq(recipeVersions.status, "draft"),
        ),
      )
      .limit(1);
    if (openEdit) {
      throw new ConflictException(
        "Esta receita já possui uma edição em andamento. Abra essa edição para continuar.",
      );
    }
    const versionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;

    const [version] = await transaction
      .insert(recipeVersions)
      .values({
        tenantId,
        recipeId,
        versionNumber,
        status: input.status,
        yieldMassG: input.yieldMassG,
        yieldUnits: input.yieldUnits,
        expectedLossPercentage: input.expectedLossPercentage,
        sourceName: input.source?.name,
        sourceUrl: input.source?.url,
        sourceAuthor: input.source?.author,
        sourceAccessedAt: input.source
          ? new Date(input.source.accessedAt)
          : undefined,
        importMethod: input.source?.method,
        importWarnings: input.source?.warnings ?? [],
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .returning();
    if (!version)
      throw new ConflictException("Não foi possível guardar esta edição.");

    await this.replaceVersionContents(transaction, tenantId, version.id, input);
  }

  private async updateDraftInDatabase(
    transaction: AppTransaction,
    tenantId: string,
    recipeId: string,
    input: CreateRecipeInput,
  ) {
    const [draft] = await transaction
      .select()
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.recipeId, recipeId),
          eq(recipeVersions.status, "draft"),
        ),
      )
      .limit(1);
    if (!draft || draft.status !== "draft") {
      throw new NotFoundException("Não há uma edição em andamento.");
    }

    await transaction
      .delete(recipeStepDependencies)
      .where(eq(recipeStepDependencies.recipeVersionId, draft.id));
    await transaction
      .delete(recipeSubrecipeLines)
      .where(eq(recipeSubrecipeLines.recipeVersionId, draft.id));
    await transaction
      .delete(recipeLines)
      .where(eq(recipeLines.recipeVersionId, draft.id));
    await transaction
      .delete(recipeSteps)
      .where(eq(recipeSteps.recipeVersionId, draft.id));
    await transaction
      .delete(recipeMoments)
      .where(eq(recipeMoments.recipeVersionId, draft.id));
    await transaction
      .update(recipeVersions)
      .set({
        status: input.status,
        yieldMassG: input.yieldMassG,
        yieldUnits: input.yieldUnits,
        expectedLossPercentage: input.expectedLossPercentage,
        sourceName: input.source?.name,
        sourceUrl: input.source?.url,
        sourceAuthor: input.source?.author,
        sourceAccessedAt: input.source
          ? new Date(input.source.accessedAt)
          : null,
        importMethod: input.source?.method ?? null,
        importWarnings: input.source?.warnings ?? [],
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .where(eq(recipeVersions.id, draft.id));
    await transaction
      .update(recipes)
      .set({
        name: input.name,
        normalizedName: normalize(input.name),
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, recipeId));

    await this.replaceVersionContents(transaction, tenantId, draft.id, input);
  }

  private async replaceVersionContents(
    transaction: AppTransaction,
    tenantId: string,
    recipeVersionId: string,
    input: CreateRecipeInput,
  ) {
    const storedStepIds = new Map<string, string>();
    const storedMomentIds = new Map<string, string>();
    for (const [momentPosition, moment] of input.moments.entries()) {
      const [storedMoment] = await transaction
        .insert(recipeMoments)
        .values({
          tenantId,
          recipeVersionId,
          name: moment.name,
          description: moment.description,
          preparationRole: moment.preparationRole,
          position: momentPosition,
        })
        .returning();
      if (!storedMoment) continue;
      storedMomentIds.set(moment.ref ?? moment.name, storedMoment.id);
      const storedSteps = await transaction
        .insert(recipeSteps)
        .values(
          moment.steps.map((step, position) => ({
            tenantId,
            recipeVersionId,
            recipeMomentId: storedMoment.id,
            name: step.name,
            instructions: step.instructions,
            durationMinutes: step.durationMinutes,
            kind: step.kind,
            requiredEquipmentKind: step.requiredEquipmentKind,
            parallelizable: step.parallelizable,
            position,
          })),
        )
        .returning({ id: recipeSteps.id });
      storedSteps.forEach((storedStep, index) => {
        const sourceStep = moment.steps[index];
        if (sourceStep) storedStepIds.set(sourceStep.ref, storedStep.id);
      });
    }

    await transaction.insert(recipeLines).values(
      input.ingredients.map((line, position) => ({
        tenantId,
        recipeVersionId,
        recipeStepId: storedStepIds.get(line.recipeStepRef),
        ingredientGroupId: line.ingredientGroupId,
        quantityG: line.quantityG,
        inputQuantity: line.inputQuantity ?? line.quantityG,
        inputUnit: line.inputUnit ?? "g",
        conversionFactorToG: line.conversionFactorToG ?? 1,
        conversionSource: line.conversionSource,
        conversionConfidence: line.conversionConfidence ?? "provided",
        notes: line.notes,
        selectionPolicy: line.selectionPolicy,
        preferredCommercialItemId: line.preferredCommercialItemId,
        wastePercentage: line.wastePercentage,
        position,
      })),
    );

    const dependencies = (input.dependencies ?? []).flatMap((dependency) => {
      const predecessorStepId = storedStepIds.get(
        dependency.predecessorStepRef,
      );
      const successorStepId = storedStepIds.get(dependency.successorStepRef);
      return predecessorStepId && successorStepId
        ? [
            {
              tenantId,
              recipeVersionId,
              predecessorStepId,
              successorStepId,
            },
          ]
        : [];
    });
    if (dependencies.length > 0) {
      await transaction.insert(recipeStepDependencies).values(dependencies);
    }

    const subrecipes = (input.subrecipes ?? []).flatMap((line, position) => {
      const recipeMomentId = storedMomentIds.get(line.recipeMomentRef);
      return recipeMomentId
        ? [
            {
              tenantId,
              recipeVersionId,
              recipeMomentId,
              referencedRecipeVersionId: line.referencedRecipeVersionId,
              requiredYieldG: line.requiredYieldG,
              notes: line.notes,
              position,
            },
          ]
        : [];
    });
    if (subrecipes.length > 0) {
      await transaction.insert(recipeSubrecipeLines).values(subrecipes);
    }
  }

  private buildCatalog(
    groups: Array<typeof ingredientGroups.$inferSelect>,
    items: Array<typeof commercialItems.$inferSelect>,
    allBrands: Array<typeof brands.$inferSelect>,
    lots: Array<typeof purchaseLots.$inferSelect>,
  ): RecipeCatalogGroup[] {
    return groups
      .filter((group) => group.active && group.baseDimension === "mass")
      .map((group) => ({
        id: group.id,
        name: group.name,
        category: group.category,
        items: items
          .filter((item) => item.active && item.ingredientGroupId === group.id)
          .map((item) => ({
            id: item.id,
            displayName: item.displayName,
            brandName:
              allBrands.find((brand) => brand.id === item.brandId)?.name ??
              null,
            lastUnitCost:
              lots.find((lot) => lot.commercialItemId === item.id)
                ?.unitCostBase ?? 0,
          })),
      }));
  }

  private async loadWorkspace(
    transaction: AppTransaction,
    tenantId: string,
  ): Promise<RecipeWorkspace> {
    const [identity] = await transaction
      .select({
        tenantName: tenants.name,
        ownerName: appUsers.displayName,
      })
      .from(tenants)
      .innerJoin(memberships, eq(memberships.tenantId, tenants.id))
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(and(eq(tenants.id, tenantId), eq(memberships.role, "owner")))
      .limit(1);
    const allRecipes = await transaction
      .select()
      .from(recipes)
      .orderBy(desc(recipes.updatedAt));
    const versions = await transaction.select().from(recipeVersions);
    const lines = await transaction.select().from(recipeLines);
    const moments = await transaction.select().from(recipeMoments);
    const steps = await transaction.select().from(recipeSteps);
    const dependencies = await transaction
      .select()
      .from(recipeStepDependencies);
    const subrecipes = await transaction.select().from(recipeSubrecipeLines);
    const groups = await transaction.select().from(ingredientGroups);
    const items = await transaction.select().from(commercialItems);
    const allBrands = await transaction.select().from(brands);
    const lots = await transaction
      .select()
      .from(purchaseLots)
      .orderBy(desc(purchaseLots.entryDate));
    const catalog = this.buildCatalog(groups, items, allBrands, lots);

    const stored: StoredRecipe[] = allRecipes.flatMap((recipe) =>
      versions
        .filter((entry) => entry.recipeId === recipe.id)
        .map((version) => {
          const versionMoments = moments
            .filter((moment) => moment.recipeVersionId === version.id)
            .sort((left, right) => left.position - right.position);
          return {
            id: recipe.id,
            versionId: version.id,
            versionNumber: version.versionNumber,
            createdAt: recipe.updatedAt.toISOString(),
            input: {
              name: recipe.name,
              yieldMassG: version.yieldMassG,
              yieldUnits: version.yieldUnits ?? undefined,
              expectedLossPercentage: version.expectedLossPercentage,
              status: version.status,
              source:
                version.sourceName &&
                version.sourceUrl &&
                version.sourceAccessedAt &&
                version.importMethod
                  ? {
                      name: version.sourceName,
                      url: version.sourceUrl,
                      author: version.sourceAuthor,
                      accessedAt: version.sourceAccessedAt.toISOString(),
                      method: version.importMethod,
                      warnings: version.importWarnings,
                    }
                  : undefined,
              ingredients: lines
                .filter((line) => line.recipeVersionId === version.id)
                .sort((left, right) => left.position - right.position)
                .map((line) => ({
                  ingredientGroupId: line.ingredientGroupId,
                  recipeStepRef: line.recipeStepId ?? `unassigned:${line.id}`,
                  quantityG: line.quantityG,
                  inputQuantity: line.inputQuantity,
                  inputUnit: line.inputUnit,
                  conversionFactorToG: line.conversionFactorToG,
                  conversionSource: line.conversionSource ?? undefined,
                  conversionConfidence: line.conversionConfidence,
                  notes: line.notes ?? undefined,
                  selectionPolicy: line.selectionPolicy,
                  preferredCommercialItemId:
                    line.preferredCommercialItemId ?? undefined,
                  wastePercentage: line.wastePercentage,
                })),
              moments: versionMoments.map((moment) => ({
                ref: moment.id,
                name: moment.name,
                description: moment.description ?? undefined,
                preparationRole: moment.preparationRole,
                steps: steps
                  .filter((step) => step.recipeMomentId === moment.id)
                  .sort((left, right) => left.position - right.position)
                  .map((step) => ({
                    ref: step.id,
                    name: step.name,
                    instructions: step.instructions,
                    durationMinutes: step.durationMinutes,
                    kind: step.kind,
                    requiredEquipmentKind: step.requiredEquipmentKind,
                    parallelizable: step.parallelizable,
                  })),
              })),
              dependencies: dependencies
                .filter(
                  (dependency) => dependency.recipeVersionId === version.id,
                )
                .map((dependency) => ({
                  predecessorStepRef: dependency.predecessorStepId,
                  successorStepRef: dependency.successorStepId,
                })),
              subrecipes: subrecipes
                .filter((subrecipe) => subrecipe.recipeVersionId === version.id)
                .sort((left, right) => left.position - right.position)
                .map((subrecipe) => ({
                  referencedRecipeVersionId:
                    subrecipe.referencedRecipeVersionId,
                  recipeMomentRef: subrecipe.recipeMomentId,
                  requiredYieldG: subrecipe.requiredYieldG,
                  notes: subrecipe.notes ?? undefined,
                })),
            },
          };
        }),
    );

    return workspaceFor(tenantId, catalog, stored, identity);
  }
}
