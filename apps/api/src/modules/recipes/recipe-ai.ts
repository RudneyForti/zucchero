import { z } from "zod";
import type { ImportedRecipeDraft } from "./recipe-importer";

const inputUnitSchema = z.enum(["g", "kg", "mg", "ml", "unit"]);
const stepKindSchema = z.enum([
  "active",
  "heating",
  "oven",
  "rest",
  "cooling",
  "cold",
  "assembly",
]);
const equipmentKindSchema = z
  .enum(["oven", "mixer", "refrigeration", "stove", "utensil", "other"])
  .nullable();

const aiIngredientSchema = z.object({
  originalText: z.string().trim().min(1).max(500),
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(100),
  inputQuantity: z.number().positive().max(1_000_000),
  inputUnit: inputUnitSchema,
  quantityG: z.number().positive().max(1_000_000),
  conversionFactorToG: z.number().positive().max(1_000_000),
  conversionSource: z.string().trim().min(2).max(240).nullable(),
  conversionConfidence: z.enum(["imported", "inferred"]),
  perishable: z.boolean(),
  warnings: z.array(z.string().trim().min(2).max(500)).max(10),
  recipeStepRef: z.string().trim().min(1).max(100),
});

const aiStepSchema = z.object({
  ref: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(120),
  instructions: z.string().trim().min(2).max(2_000),
  durationMinutes: z.number().int().min(0).max(10_080),
  kind: stepKindSchema,
  requiredEquipmentKind: equipmentKindSchema,
  parallelizable: z.boolean(),
});

const aiMomentSchema = z.object({
  ref: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(300),
  preparationRole: z.enum(["intermediate", "final"]),
  steps: z.array(aiStepSchema).min(1).max(30),
});

const aiDependencySchema = z.object({
  predecessorStepRef: z.string().trim().min(1).max(100),
  successorStepRef: z.string().trim().min(1).max(100),
});

export const recipeAiOutputSchema = z
  .object({
    name: z.string().trim().min(2).max(140),
    yieldMassG: z.number().positive().max(1_000_000),
    yieldUnits: z.number().int().positive().max(100_000).nullable(),
    expectedLossPercentage: z.number().min(0).max(100),
    totalDurationMinutes: z.number().int().min(0).max(10_080),
    ingredients: z.array(aiIngredientSchema).min(1).max(100),
    moments: z.array(aiMomentSchema).min(1).max(30),
    dependencies: z.array(aiDependencySchema).max(200),
    warnings: z.array(z.string().trim().min(2).max(500)).max(50),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .superRefine((value, context) => {
    const momentRefs = value.moments.map((moment) => moment.ref);
    if (new Set(momentRefs).size !== momentRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["moments"],
        message: "A IA repetiu referências de momentos.",
      });
    }

    const stepRefs = value.moments.flatMap((moment) =>
      moment.steps.map((step) => step.ref),
    );
    if (new Set(stepRefs).size !== stepRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["moments"],
        message: "A IA repetiu referências de etapas.",
      });
    }

    const knownStepRefs = new Set(stepRefs);
    value.ingredients.forEach((ingredient, index) => {
      if (!knownStepRefs.has(ingredient.recipeStepRef)) {
        context.addIssue({
          code: "custom",
          path: ["ingredients", index, "recipeStepRef"],
          message: "A IA vinculou um ingrediente a uma etapa inexistente.",
        });
      }
      const converted =
        ingredient.inputQuantity * ingredient.conversionFactorToG;
      if (Math.abs(converted - ingredient.quantityG) > 0.02) {
        context.addIssue({
          code: "custom",
          path: ["ingredients", index, "quantityG"],
          message: "A conversão sugerida pela IA não fecha matematicamente.",
        });
      }
    });

    value.dependencies.forEach((dependency, index) => {
      if (
        !knownStepRefs.has(dependency.predecessorStepRef) ||
        !knownStepRefs.has(dependency.successorStepRef) ||
        dependency.predecessorStepRef === dependency.successorStepRef
      ) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index],
          message: "A IA sugeriu uma precedência inválida.",
        });
      }
    });
  });

export const recipeAiRefinementOutputSchema = z
  .object({
    moments: z.array(aiMomentSchema).min(1).max(30),
    dependencies: z.array(aiDependencySchema).max(200),
    ingredientStepRefs: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(100),
    warnings: z.array(z.string().trim().min(2).max(500)).max(50),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .superRefine((value, context) => {
    const momentRefs = value.moments.map((moment) => moment.ref);
    if (new Set(momentRefs).size !== momentRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["moments"],
        message: "A IA repetiu referências de momentos.",
      });
    }

    const stepRefs = value.moments.flatMap((moment) =>
      moment.steps.map((step) => step.ref),
    );
    if (new Set(stepRefs).size !== stepRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["moments"],
        message: "A IA repetiu referências de etapas.",
      });
    }

    const knownStepRefs = new Set(stepRefs);
    value.ingredientStepRefs.forEach((stepRef, index) => {
      if (!knownStepRefs.has(stepRef)) {
        context.addIssue({
          code: "custom",
          path: ["ingredientStepRefs", index],
          message: "A IA vinculou um ingrediente a uma etapa inexistente.",
        });
      }
    });

    value.dependencies.forEach((dependency, index) => {
      if (
        !knownStepRefs.has(dependency.predecessorStepRef) ||
        !knownStepRefs.has(dependency.successorStepRef) ||
        dependency.predecessorStepRef === dependency.successorStepRef
      ) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index],
          message: "A IA sugeriu uma precedência inválida.",
        });
      }
    });
  });

type RecipeAiOutput = z.infer<typeof recipeAiOutputSchema>;
type RecipeAiRefinementOutput = z.infer<typeof recipeAiRefinementOutputSchema>;

type RefineRecipeWithAiInput = {
  sourceUrl: string;
  pageText: string;
  deterministicDraft: ImportedRecipeDraft | null;
};

function configuredAiUrl() {
  return process.env.RECIPE_AI_URL?.trim().replace(/\/$/, "") ?? "";
}

export function recipeAiEnabled() {
  return (
    Boolean(configuredAiUrl()) && process.env.RECIPE_AI_ENABLED !== "false"
  );
}

function modelName() {
  return process.env.RECIPE_AI_MODEL?.trim() || "qwen3:4b";
}

function timeoutMs() {
  const configured = Number(process.env.RECIPE_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 10_000
    ? configured
    : 180_000;
}

function keepAlive() {
  return process.env.RECIPE_AI_KEEP_ALIVE?.trim() || "5m";
}

const unsupportedGrammarKeywords = new Set([
  "$schema",
  "exclusiveMinimum",
  "maximum",
  "maxItems",
  "maxLength",
  "minimum",
  "minItems",
  "minLength",
]);

function schemaForOllama(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaForOllama);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupportedGrammarKeywords.has(key))
      .map(([key, child]) => [key, schemaForOllama(child)]),
  );
}

function contentFromOllama(value: unknown) {
  const response = z
    .object({ message: z.object({ content: z.string() }) })
    .safeParse(value);
  if (!response.success)
    throw new Error(
      "O serviço local de IA respondeu em um formato inesperado.",
    );
  return response.data.message.content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function importedDraftFromAi(
  output: RecipeAiOutput,
  input: RefineRecipeWithAiInput,
): ImportedRecipeDraft {
  const fallbackSource = input.deterministicDraft?.source ?? {
    name: new URL(input.sourceUrl).hostname.replace(/^www\./, ""),
    url: input.sourceUrl,
    author: null,
    accessedAt: new Date().toISOString(),
    method: "structured_data" as const,
  };
  return {
    source: {
      ...fallbackSource,
      url: input.sourceUrl,
      accessedAt: new Date().toISOString(),
      method: "llm",
    },
    name: output.name,
    yieldMassG: output.yieldMassG,
    yieldUnits: output.yieldUnits,
    expectedLossPercentage: output.expectedLossPercentage,
    totalDurationMinutes: output.totalDurationMinutes,
    ingredients: output.ingredients.map(({ recipeStepRef, ...ingredient }) => {
      void recipeStepRef;
      return { ...ingredient, notes: null };
    }),
    moments: output.moments,
    dependencies: output.dependencies,
    ingredientStepRefs: output.ingredients.map(
      (ingredient) => ingredient.recipeStepRef,
    ),
    warnings: [
      ...new Set([
        ...output.ingredients.flatMap((ingredient) => ingredient.warnings),
        ...output.warnings,
        "Estrutura organizada por IA local. Confirme principalmente rendimento, conversões e tempos antes de publicar.",
      ]),
    ],
    confidence: output.confidence,
  };
}

function importedDraftFromRefinement(
  output: RecipeAiRefinementOutput,
  input: RefineRecipeWithAiInput,
): ImportedRecipeDraft {
  const deterministicDraft = input.deterministicDraft;
  if (!deterministicDraft) {
    throw new Error("A IA local não recebeu o rascunho que deveria organizar.");
  }
  const sourceSteps = deterministicDraft.moments.flatMap(
    (moment) => moment.steps,
  );
  const refinedStepCount = output.moments.reduce(
    (total, moment) => total + moment.steps.length,
    0,
  );
  const minimumSafeStepCount = Math.max(1, Math.ceil(sourceSteps.length * 0.6));
  if (refinedStepCount < minimumSafeStepCount) {
    throw new Error(
      `A IA local condensou demais o preparo: devolveu ${refinedStepCount} etapas para ${sourceSteps.length} instruções da fonte.`,
    );
  }
  const normalizedMoments = output.moments.map((moment, momentIndex) => ({
    ...moment,
    preparationRole:
      momentIndex === output.moments.length - 1
        ? ("final" as const)
        : ("intermediate" as const),
    steps: moment.steps.map((step) => normalizeRefinedStep(step, sourceSteps)),
  }));
  const organizedMoments =
    organizeRefinedMomentsChronologically(normalizedMoments);
  const aiCoveredEveryIngredient =
    output.ingredientStepRefs.length === deterministicDraft.ingredients.length;
  const ingredientStepRefs = aiCoveredEveryIngredient
    ? output.ingredientStepRefs
    : preserveIngredientStepRefs(deterministicDraft, organizedMoments);
  return {
    ...deterministicDraft,
    source: {
      ...deterministicDraft.source,
      accessedAt: new Date().toISOString(),
      method: "llm",
    },
    moments: organizedMoments,
    dependencies: output.dependencies,
    ingredientStepRefs,
    warnings: [
      ...new Set([
        ...deterministicDraft.warnings,
        ...output.warnings,
        ...(aiCoveredEveryIngredient
          ? []
          : [
              "Alguns vínculos entre ingredientes e etapas foram preservados pelo extrator determinístico porque a IA não cobriu toda a lista.",
            ]),
        "O Zucchero aplicou a ontologia culinária e a ordem cronológica sobre as sugestões da IA.",
        ...(refinedStepCount !== sourceSteps.length
          ? [
              `A IA reuniu ${sourceSteps.length} instruções da fonte em ${refinedStepCount} etapas culinárias, preservando-as em momentos mais legíveis.`,
            ]
          : []),
        "Momentos e etapas organizados por IA local. Confirme principalmente os tempos antes de publicar.",
      ]),
    ],
    confidence: output.confidence,
  };
}

const culinaryMomentOrder = [
  "mise en place",
  "base",
  "massa",
  "preparacao",
  "forno",
  "finalizacao",
] as const;

function normalizedCulinaryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function canonicalMomentNameForStep(
  step: RecipeAiRefinementOutput["moments"][number]["steps"][number],
  currentMomentName: string,
) {
  const text = normalizedCulinaryText(`${step.name} ${step.instructions}`);
  if (/separ(?:e|ar).{0,30}pes(?:e|ar)|mise en place/.test(text))
    return "Mise en place";
  if (
    /esfri|resfr|\bretire\b.{0,30}forno|desenform|porcion|\bcort(?:e|ar)\b/.test(
      text,
    )
  )
    return "Finalização";
  if (
    /pre.{0,8}aque|prepar(?:e|ar).{0,30}\bforma\b|\bunt(?:e|ar)\b.{0,30}\bforma\b|papel manteiga/.test(
      text,
    )
  )
    return "Preparação";
  if (
    /test(?:e|ar).{0,20}ponto|pressione.{0,40}superficie|textura.{0,20}esponja|palito|garfo|\bassar\b|\basse\b|leve.{0,30}forno|cozimento/.test(
      text,
    )
  )
    return "Forno";
  if (
    /bata|bater|mistur|incorpor|farinha|bolsas de farinha|ovos|acucar|massa/.test(
      text,
    )
  )
    return "Massa";
  return currentMomentName;
}

function momentRank(name: string) {
  const text = normalizedCulinaryText(name);
  const index = culinaryMomentOrder.findIndex((candidate) =>
    text.includes(candidate),
  );
  return index < 0 ? culinaryMomentOrder.length - 1 : index;
}

function organizeRefinedMomentsChronologically(
  moments: RecipeAiRefinementOutput["moments"],
) {
  const organized = new Map<
    string,
    RecipeAiRefinementOutput["moments"][number]
  >();
  for (const moment of moments) {
    for (const step of moment.steps) {
      const targetName = canonicalMomentNameForStep(step, moment.name);
      const existing = organized.get(targetName);
      if (existing) existing.steps.push(step);
      else
        organized.set(targetName, {
          ...moment,
          name: targetName,
          steps: [step],
        });
    }
  }
  const result = [...organized.values()].sort(
    (left, right) => momentRank(left.name) - momentRank(right.name),
  );
  return result.map((moment, index) => ({
    ...moment,
    ref: `moment-${index + 1}`,
    preparationRole:
      index === result.length - 1
        ? ("final" as const)
        : ("intermediate" as const),
  }));
}

function normalizeRefinedStep(
  step: RecipeAiRefinementOutput["moments"][number]["steps"][number],
  sourceSteps: ImportedRecipeDraft["moments"][number]["steps"],
) {
  const text = `${step.name} ${step.instructions}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const sourceStep = sourceSteps.find(
    (candidate) =>
      normalizedTokens(candidate.instructions).size > 0 &&
      tokenOverlap(
        normalizedTokens(candidate.instructions),
        normalizedTokens(step.instructions),
      ) >= Math.min(3, normalizedTokens(candidate.instructions).size),
  );
  const kind = /deixe esfriar|resfri|esfriar/.test(text)
    ? ("cooling" as const)
    : /pre.{0,12}aque.+forno/.test(text)
      ? ("heating" as const)
      : /test(?:e|ar).{0,20}ponto|pressione.{0,40}superficie|textura.{0,20}esponja|palito|garfo|assar|leve ao forno|coloque.+forno/.test(
            text,
          )
        ? ("oven" as const)
        : /fogo|panela|\bderreta\b|\bderreter\b/.test(text)
          ? ("heating" as const)
          : step.kind;
  const requiredEquipmentKind =
    kind === "cooling"
      ? null
      : kind === "oven" || /forno/.test(text)
        ? ("oven" as const)
        : /batedeira|mixer/.test(text)
          ? ("mixer" as const)
          : /fogo|panela|\bderreta\b|\bderreter\b/.test(text)
            ? ("stove" as const)
            : /geladeira|refrigerador|refrigerar|freezer/.test(text)
              ? ("refrigeration" as const)
              : kind === "active" || kind === "assembly"
                ? ("utensil" as const)
                : null;
  const hasExplicitDuration = /\d+\s*(?:min|minuto|hora|h\b)/.test(text);
  const semanticDuration =
    !hasExplicitDuration &&
    /test(?:e|ar).{0,20}ponto|pressione.{0,40}superficie|textura.{0,20}esponja|palito|garfo/.test(
      text,
    )
      ? 2
      : !hasExplicitDuration &&
          /prepar(?:e|ar).{0,30}\bforma\b|\bunt(?:e|ar)\b.{0,30}\bforma\b|papel manteiga/.test(
            text,
          )
        ? 5
        : sourceStep && !hasExplicitDuration
          ? sourceStep.durationMinutes
          : step.durationMinutes;
  return {
    ...step,
    name: /^etapa\s+\d+$/i.test(step.name)
      ? nameFromInstructions(step.instructions)
      : step.name,
    kind,
    requiredEquipmentKind,
    durationMinutes: semanticDuration,
    parallelizable: sourceStep?.parallelizable ?? step.parallelizable,
  };
}

function nameFromInstructions(instructions: string) {
  const firstSentence = instructions.split(/[.!?]/)[0]?.trim() ?? "Preparar";
  if (/^misture e reserve$/i.test(firstSentence)) return "Misturar e reservar";
  return firstSentence.slice(0, 100);
}

function normalizedTokens(value: string) {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>) {
  let score = 0;
  left.forEach((token) => {
    if (right.has(token)) score += 1;
  });
  return score;
}

function preserveIngredientStepRefs(
  draft: ImportedRecipeDraft,
  moments: RecipeAiRefinementOutput["moments"],
) {
  const sourceSteps = draft.moments.flatMap((moment) => moment.steps);
  const refinedSteps = moments.flatMap((moment) => moment.steps);
  if (refinedSteps.length === 0) {
    throw new Error("A IA local devolveu uma receita sem etapas.");
  }
  return draft.ingredientStepRefs.map((sourceRef) => {
    const sourceIndex = Math.max(
      0,
      sourceSteps.findIndex((step) => step.ref === sourceRef),
    );
    const sourceStep = sourceSteps[sourceIndex];
    if (!sourceStep) return refinedSteps[0]!.ref;
    const sourceTokens = normalizedTokens(
      `${sourceStep.name} ${sourceStep.instructions}`,
    );
    let bestIndex = Math.min(sourceIndex, refinedSteps.length - 1);
    let bestScore = -1;
    refinedSteps.forEach((step, index) => {
      const score = tokenOverlap(
        sourceTokens,
        normalizedTokens(`${step.name} ${step.instructions}`),
      );
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    return refinedSteps[bestIndex]!.ref;
  });
}

function promptFor(input: RefineRecipeWithAiInput) {
  return [
    "Você extrai e organiza receitas culinárias para o Zucchero.",
    "Responda somente com o JSON exigido, em português do Brasil.",
    "Não invente ingredientes, quantidades, temperaturas, equipamentos ou tempos.",
    "Em name, use somente o conceito culinário reutilizável, como 'Creme de leite fresco', 'Queijo mascarpone' ou 'Vinho marsala'. Não inclua quantidade, embalagem, teor de gordura, marca, estado de preparo ou modo de uso no nome; preserve esses detalhes em originalText.",
    "Quando uma medida ou tempo não estiver explícito, faça uma estimativa conservadora, marque a conversão como inferred e escreva um aviso específico.",
    "Agrupe as etapas em poucos momentos culinários semanticamente coerentes. Um momento pode conter várias etapas.",
    "Use preparationRole=intermediate para massas, cremes, bases e outros semiacabados; use final apenas no momento que conclui o produto.",
    "Separe trabalho ativo de forno, descanso, resfriamento e montagem. Não distribua o tempo total artificialmente entre etapas.",
    "Cada ingrediente deve apontar recipeStepRef para a etapa em que entra pela primeira vez.",
    "Use referências simples e únicas: moment-1, step-1, step-2.",
    "Para g, kg e mg, conversionFactorToG deve ser respectivamente 1, 1000 e 0.001. Para ml ou unidade, informe a hipótese em conversionSource.",
    "Preserve as instruções úteis da fonte, mas remova propaganda, navegação e comentários.",
    `URL da fonte: ${input.sourceUrl}`,
    `Rascunho do extrator determinístico (pode conter classificações ruins): ${JSON.stringify(input.deterministicDraft)}`,
    `Texto culinário disponível na página: ${input.pageText}`,
  ].join("\n\n");
}

function refinementPromptFor(input: RefineRecipeWithAiInput) {
  const draft = input.deterministicDraft;
  if (!draft) throw new Error("Rascunho determinístico ausente.");
  const compactDraft = {
    recipeName: draft.name,
    estimatedYieldMassG: draft.yieldMassG,
    yieldUnits: draft.yieldUnits,
    expectedLossPercentage: draft.expectedLossPercentage,
    totalDurationMinutes: draft.totalDurationMinutes,
    ingredientsInRequiredOrder: draft.ingredients.map((ingredient, index) => ({
      index,
      name: ingredient.name,
      originalText: ingredient.originalText,
      parsedInputQuantity: ingredient.inputQuantity,
      parsedInputUnit: ingredient.inputUnit,
      parsedQuantityG: ingredient.quantityG,
      conversionSource: ingredient.conversionSource,
    })),
    sourceSteps: draft.moments
      .flatMap((moment) => moment.steps)
      .map((step, index) => ({
        index,
        name: step.name,
        instructions: step.instructions,
        detectedDurationMinutes: step.durationMinutes,
      })),
  };
  return [
    "Você reorganiza um rascunho culinário já extraído para o Zucchero.",
    "Responda somente com o JSON exigido, em português do Brasil.",
    "Não altere ingredientes nem invente temperaturas, equipamentos ou ações.",
    "Audite as quantidades do rascunho contra originalText. Se uma quantidade convertida contrariar gramas explícitos, uma medida alternativa em gramas ou um peso por unidade declarado pela fonte, escreva um aviso específico; nunca silencie a inconsistência.",
    "Confira se estimatedYieldMassG é plausível diante da soma de parsedQuantityG e da perda esperada. O extrator determinístico permanece responsável pelos números; sua função é apontar qualquer incoerência remanescente nos avisos.",
    "Agrupe as ações em poucos momentos culinários coerentes. Um momento contém uma ou mais etapas.",
    "Crie entre 3 e 6 momentos. Não crie um momento para cada etapa.",
    "A classificação deve seguir a função culinária e a cronologia da ação, nunca apenas uma palavra isolada.",
    "A ordem obrigatória é: Mise en place; transformações da massa ou de bases; Preparação do forno e da forma; Forno; Finalização.",
    "Mise en place vem primeiro e reúne separar, medir e pesar. Massa reúne bater, misturar, incorporar e conferir se a farinha foi incorporada.",
    "Preparação reúne preaquecer o forno, cortar papel e untar ou preparar a forma, mesmo quando a fonte menciona essas ações antes da massa.",
    "Forno reúne levar a massa ao forno, assar, o tempo de cocção e a verificação do ponto. Finalização reúne retirar do forno, esfriar, desenformar, cortar ou decorar.",
    "Exemplos obrigatórios: 'não se formaram bolsas de farinha na massa' pertence a Massa, não a Preparação; 'pressione a superfície para testar o ponto' pertence a Forno, não a Massa.",
    "Use preparationRole=intermediate para bases e semiacabados; use final apenas no momento que conclui o produto.",
    "Dê nomes objetivos às etapas e preserve todas as instruções úteis.",
    "Nunca use nomes genéricos como 'Etapa 4'; derive o nome da ação descrita nas instruções.",
    `A fonte contém ${draft.moments.flatMap((moment) => moment.steps).length} instruções. Preserve todo o conteúdo útil; você pode reunir instruções consecutivas que formem uma única ação culinária, mas não pode omitir, duplicar ou inventar ações.`,
    "Mantenha o texto de instructions fiel ao item de origem para que ele permaneça rastreável.",
    "Separe trabalho ativo de aquecimento, forno, descanso, resfriamento, frio e montagem.",
    "Quando o texto informar um tempo, use-o. Para ações sem tempo, estime apenas o necessário e escreva um aviso específico.",
    "O valor detectado de 1 minuto pode ser apenas um marcador do extrator. Quando a ação normalmente levar mais tempo, faça uma estimativa culinária realista e avise.",
    "Não distribua artificialmente o tempo total entre etapas.",
    "Equipamento oven exige menção a forno. Mixer exige batedeira ou mixer. Stove exige fogo, panela ou derretimento. Refrigeration exige geladeira, refrigerador ou freezer. Nos demais trabalhos manuais use utensil ou null.",
    "Deve existir exatamente um momento final, e ele deve ser o último.",
    "Use referências simples e únicas: moment-1, step-1, step-2.",
    "ingredientStepRefs deve ter exatamente uma referência por ingrediente, na mesma ordem de ingredientsInRequiredOrder, indicando a primeira etapa em que ele entra.",
    "Crie precedências somente quando uma etapa realmente precisar terminar antes da outra; atividades paralelas não devem ser encadeadas.",
    `URL da fonte: ${input.sourceUrl}`,
    `Rascunho compacto: ${JSON.stringify(compactDraft)}`,
  ].join("\n\n");
}

export async function refineRecipeWithAi(
  input: RefineRecipeWithAiInput,
): Promise<ImportedRecipeDraft> {
  const outputSchema = input.deterministicDraft
    ? recipeAiRefinementOutputSchema
    : recipeAiOutputSchema;
  const response = await fetch(`${configuredAiUrl()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs()),
    body: JSON.stringify({
      model: modelName(),
      stream: false,
      think: false,
      keep_alive: keepAlive(),
      // llama.cpp does not compile every JSON Schema validation keyword into
      // grammar. The full Zod schema is still applied after generation.
      format: schemaForOllama(
        z.toJSONSchema(outputSchema, { target: "draft-07" }),
      ),
      options: {
        temperature: 0,
        num_ctx: 8_192,
        num_predict: 6_000,
        seed: 38,
      },
      messages: [
        {
          role: "system",
          content:
            "Você é um extrator culinário preciso. Não conversa e não usa markdown.",
        },
        {
          role: "user",
          content: input.deterministicDraft
            ? refinementPromptFor(input)
            : promptFor(input),
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `O serviço local de IA respondeu com status ${response.status}${detail ? `: ${detail}` : "."}`,
    );
  }
  const payload: unknown = await response.json();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(contentFromOllama(payload));
  } catch {
    throw new Error("A IA local não conseguiu devolver uma receita válida.");
  }
  const parsed = outputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `A receita sugerida pela IA não passou na validação${issue ? `: ${issue.message}` : "."}`,
    );
  }
  return input.deterministicDraft
    ? importedDraftFromRefinement(
        parsed.data as RecipeAiRefinementOutput,
        input,
      )
    : importedDraftFromAi(parsed.data as RecipeAiOutput, input);
}
