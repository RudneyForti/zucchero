import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { recipeAiEnabled, refineRecipeWithAi } from "./recipe-ai";

export type ImportedIngredient = {
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
};

export type ImportedRecipeDraft = {
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
  ingredients: ImportedIngredient[];
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
  dependencies: Array<{
    predecessorStepRef: string;
    successorStepRef: string;
  }>;
  ingredientStepRefs: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
};

type JsonRecord = Record<string, unknown>;

const maximumPageBytes = 2_000_000;
const fetchTimeoutMs = 8_000;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function pageTextForAi(html: string) {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " "),
  ).slice(0, 30_000);
}

function titleCase(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean ? clean[0]!.toLocaleUpperCase("pt-BR") + clean.slice(1) : clean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeIncludes(value: unknown, expected: string) {
  const values = Array.isArray(value) ? value : [value];
  return values.some(
    (entry) => typeof entry === "string" && entry.toLowerCase() === expected,
  );
}

function findStructuredRecipe(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findStructuredRecipe(entry);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (
    typeIncludes(value["@type"], "recipe") ||
    typeIncludes(value["@type"], "howto")
  ) {
    const hasIngredients = Boolean(value.recipeIngredient ?? value.supply);
    const hasSteps = Boolean(value.recipeInstructions ?? value.step);
    if (hasIngredients && hasSteps) return value;
  }
  for (const nested of Object.values(value)) {
    const found = findStructuredRecipe(nested);
    if (found) return found;
  }
  return null;
}

function structuredRecipeFromHtml(html: string) {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    const raw = script[1]?.trim();
    if (!raw) continue;
    try {
      const found = findStructuredRecipe(JSON.parse(raw));
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function authorName(value: unknown): string | null {
  if (typeof value === "string") return decodeHtml(value);
  if (Array.isArray(value)) return authorName(value[0]);
  if (isRecord(value) && typeof value.name === "string") {
    return decodeHtml(value.name);
  }
  return null;
}

function asText(value: unknown): string {
  if (typeof value === "string") return decodeHtml(value);
  if (typeof value === "number") return String(value);
  return "";
}

function ingredientTexts(recipe: JsonRecord) {
  const source = recipe.recipeIngredient ?? recipe.supply;
  const values = Array.isArray(source) ? source : source ? [source] : [];
  return values
    .map((value) => {
      if (typeof value === "string") return decodeHtml(value);
      if (!isRecord(value)) return "";
      const quantity = asText(value.requiredQuantity ?? value.amount);
      const name = asText(value.name ?? value.text);
      return `${quantity} ${name}`.trim();
    })
    .filter(Boolean);
}

type SourceIngredientRecord = {
  text: string;
  groupName: string | null;
};

function visibleIngredientRecords(html: string): SourceIngredientRecord[] {
  const grouped = [
    ...html.matchAll(
      /<div\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient-group\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>\s*<\/div>/gi,
    ),
  ].flatMap((groupMatch) => {
    const groupHtml = groupMatch[1] ?? "";
    const groupNameMatch = groupHtml.match(
      /<h[1-6]\b[^>]*class=["'][^"']*\bwprm-recipe-group-name\b[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/i,
    );
    const groupName = groupNameMatch
      ? decodeHtml(groupNameMatch[1] ?? "")
      : null;
    return [
      ...groupHtml.matchAll(
        /<li\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
      ),
    ]
      .map((match) => decodeHtml(match[1] ?? ""))
      .filter(Boolean)
      .map((text) => ({ text, groupName }));
  });
  if (grouped.length > 0) return grouped;
  return [
    ...html.matchAll(
      /<li\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
    ),
  ]
    .map((match) => decodeHtml(match[1] ?? ""))
    .filter(Boolean)
    .map((text) => ({ text, groupName: null }));
}

type ImportedInstructionRecord = {
  text: string;
  sectionName: string | null;
};

function instructionRecords(
  value: unknown,
  inheritedSection: string | null = null,
): ImportedInstructionRecord[] {
  if (typeof value === "string")
    return [decodeHtml(value)]
      .filter(Boolean)
      .map((text) => ({ text, sectionName: inheritedSection }));
  if (Array.isArray(value))
    return value.flatMap((entry) =>
      instructionRecords(entry, inheritedSection),
    );
  if (!isRecord(value)) return [];
  const sectionName =
    value.itemListElement || value.steps
      ? asText(value.name) || inheritedSection
      : inheritedSection;
  if (value.itemListElement)
    return instructionRecords(value.itemListElement, sectionName);
  if (value.steps) return instructionRecords(value.steps, sectionName);
  const text = asText(value.text ?? value.name);
  return text ? [{ text, sectionName }] : [];
}

function splitAuthoredInstructions(records: ImportedInstructionRecord[]) {
  return records.flatMap((record) => {
    const sentences = record.text
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 2);
    return (sentences.length > 1 ? sentences : [record.text]).map((text) => ({
      text,
      sectionName: record.sectionName,
    }));
  });
}

function parseDuration(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 1_440 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

function numericQuantity(value: string): number {
  const normalizedValue = value.replace(",", ".");
  if (/^\d+(?:\.\d+)?\s+\d+\/\d+$/.test(normalizedValue)) {
    const [whole, fraction] = normalizedValue.split(/\s+/);
    return Number(whole) + numericQuantity(fraction!);
  }
  if (/^\d+\/\d+$/.test(normalizedValue)) {
    const [left, right] = normalizedValue.split("/").map(Number);
    return right ? left! / right : 0;
  }
  return Number(normalizedValue);
}

function asciiFractions(value: string) {
  const fractions: Record<string, string> = {
    "¼": "1/4",
    "½": "1/2",
    "¾": "3/4",
    "⅓": "1/3",
    "⅔": "2/3",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
  };
  return value.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) =>
    fractions[fraction] ? ` ${fractions[fraction]} ` : fraction,
  );
}

function gramsFrom(value: string, unit: string) {
  const quantity = numericQuantity(value);
  const normalizedUnit = normalize(unit);
  if (/^(kg|quilo|quilos|quilograma|quilogramas)$/.test(normalizedUnit))
    return quantity * 1_000;
  if (/^(mg|miligrama|miligramas)$/.test(normalizedUnit))
    return quantity * 0.001;
  return quantity;
}

function explicitMassReading(text: string, leadingQuantity: number) {
  const matches = [
    ...text.matchAll(
      /(\d+(?:[.,]\d+)?)\s*(quilogramas?|quilos?|kg|miligramas?|mg|gramas?|gr|g)\b/gi,
    ),
  ];
  if (matches.length === 0) return null;
  const candidates = matches.map((match) => {
    const quantityG = gramsFrom(match[1]!, match[2]!);
    const after = text.slice(
      (match.index ?? 0) + match[0].length,
      (match.index ?? 0) + match[0].length + 50,
    );
    const before = text.slice(0, match.index ?? 0);
    const perUnit = /\bcada\b/i.test(after);
    return {
      quantityG: perUnit ? quantityG * leadingQuantity : quantityG,
      perUnitG: perUnit ? quantityG : null,
      alternative: /\bou\b/i.test(before),
    };
  });
  return candidates.reduce((best, candidate) =>
    candidate.quantityG > best.quantityG ? candidate : best,
  );
}

function isEquipmentLine(value: string) {
  const key = normalize(value);
  return (
    /\bforma de \d+(?:[.,]\d+)?\s*cm\b/.test(key) ||
    /\bassadeira de \d+(?:[.,]\d+)?\s*cm\b/.test(key) ||
    /\baro de \d+(?:[.,]\d+)?\s*cm\b/.test(key)
  );
}

function canonicalIngredient(value: string) {
  const key = normalize(value);
  if (key.includes("mascarpone"))
    return {
      name: "Queijo mascarpone",
      category: "Cremes e laticínios",
      perishable: true,
    };
  if (key.includes("creme de leite"))
    return {
      name: "Creme de leite fresco",
      category: "Cremes e laticínios",
      perishable: true,
    };
  if (key.includes("acido tartarico"))
    return {
      name: "Ácido tartárico",
      category: "Aromas e extratos",
      perishable: false,
    };
  if (key.includes("vinho marsala"))
    return {
      name: "Vinho marsala",
      category: "Bebidas e licores",
      perishable: false,
    };
  if (
    key.includes("raspas") &&
    key.includes("laranja") &&
    key.includes("limao")
  )
    return {
      name: "Raspas cítricas",
      category: "Frutas",
      perishable: true,
    };
  if (key.includes("raspas") && key.includes("laranja"))
    return {
      name: "Raspas de laranja",
      category: "Frutas",
      perishable: true,
    };
  if (key.includes("raspas") && key.includes("limao"))
    return {
      name: "Raspas de limão",
      category: "Frutas",
      perishable: true,
    };
  if (key.includes("manteiga"))
    return {
      name: "Manteiga sem sal",
      category: "Cremes e laticínios",
      perishable: true,
    };
  if (key.includes("chips de chocolate") || key.includes("gotas de chocolate"))
    return {
      name: "Gotas de chocolate",
      category: "Chocolates e cacaus",
      perishable: false,
    };
  if (key.includes("chocolate") && key.includes("70"))
    return {
      name: "Chocolate amargo 70%",
      category: "Chocolates e cacaus",
      perishable: false,
    };
  if (key.includes("chocolate"))
    return {
      name: "Chocolate",
      category: "Chocolates e cacaus",
      perishable: false,
    };
  if (key.includes("acucar"))
    return {
      name: "Açúcar refinado",
      category: "Açúcares e adoçantes",
      perishable: false,
    };
  if (/\bovos?\b/.test(key))
    return { name: "Ovo", category: "Ovos", perishable: true };
  if (key.includes("baunilha"))
    return {
      name: "Essência de baunilha",
      category: "Aromas e extratos",
      perishable: false,
    };
  if (key.includes("cacau"))
    return {
      name: "Cacau em pó",
      category: "Chocolates e cacaus",
      perishable: false,
    };
  if (key.includes("farinha") && key.includes("trigo"))
    return {
      name: "Farinha de trigo",
      category: "Farinhas e secos",
      perishable: false,
    };
  if (key.includes("sal marinho"))
    return { name: "Sal marinho", category: "Temperos", perishable: false };
  if (/\bsal\b/.test(key))
    return { name: "Sal fino", category: "Temperos", perishable: false };
  if (key.includes("cafe") && /forte|passado|liquido/.test(key))
    return { name: "Café forte", category: "Cafés", perishable: false };
  if (key.includes("cafe"))
    return { name: "Café solúvel", category: "Cafés", perishable: false };
  if (key.includes("nozes") || key.includes("noz"))
    return {
      name: "Nozes",
      category: "Castanhas e sementes",
      perishable: false,
    };
  return {
    name: titleCase(
      value
        .replace(/\b(temperatura ambiente|torrad[ao]s?|picad[ao]s?)\b/gi, "")
        .trim(),
    ),
    category: "Outros ingredientes",
    perishable: false,
  };
}

function importedIngredientNote(value: string, canonicalName: string) {
  const clean = asciiFractions(decodeHtml(value))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^((?:\d+(?:[.,]\d+)?\s+)?\d+\/\d+|\d+(?:[.,]\d+)?)\s*/, "")
    .replace(
      /^(?:litros?|l|quilogramas?|quilos?|kg|miligramas?|mg|gramas?|gr|g|mililitros?|ml|x[ií]caras?(?:\s+de\s+ch[aá])?|colher(?:es)?(?:\s+de\s+(?:sopa|chá|café))?|unidades?|un)\b\s*(?:de\s+)?/i,
      "",
    )
    .replace(/^de\s+/i, "")
    .trim();
  if (!clean || normalize(clean) === normalize(canonicalName)) return null;

  let detail = clean;
  const canonicalKey = normalize(canonicalName);
  if (canonicalKey === "creme de leite fresco") {
    detail = detail
      .replace(/^creme de leite(?:\s+fresco)?\b\s*/i, "")
      .replace(/^(?:do\s+tipo|tipo)\s+/i, "");
  } else if (canonicalKey === "queijo mascarpone") {
    detail = detail.replace(/^(?:do\s+)?(?:queijo\s+)?mascarpone\b\s*/i, "");
  } else if (canonicalKey === "vinho marsala") {
    detail = detail.replace(/^(?:do\s+)?vinho\s+marsala\b\s*/i, "");
  } else if (canonicalKey === "acido tartarico") {
    detail = detail.replace(/^(?:do\s+)?[aá]cido\s+tart[aá]rico\b\s*/i, "");
  }

  detail = detail.replace(/^[,;:\s–—-]+/, "").trim();
  if (!detail) return null;
  return `${detail.charAt(0).toLocaleUpperCase("pt-BR")}${detail.slice(1)}`.slice(
    0,
    500,
  );
}

function inferredFactor(name: string, unitLabel: string) {
  const key = normalize(name);
  const label = normalize(unitLabel);
  if (key === "ovo")
    return {
      factor: 50,
      source: "Estimativa culinária: 50 g por ovo sem casca",
    };
  if (
    (key.includes("creme de leite") ||
      key.includes("vinho marsala") ||
      key.includes("cafe forte")) &&
    /ml|litro|xicara/.test(label)
  )
    return {
      factor: 1,
      source: "Conversão volumétrica inicial: densidade aproximada de 1 g/ml",
    };
  if (key.includes("acido tartarico") && label.includes("cha"))
    return {
      factor: 4,
      source: "Conversão inicial: 4 g por colher de chá",
    };
  if (key.includes("acucar") && label.includes("cha"))
    return {
      factor: 4,
      source: "Conversão inicial: 4 g por colher de chá rasa",
    };
  if (key.includes("vinho marsala") && label.includes("sopa"))
    return {
      factor: 15,
      source: "Conversão inicial: 15 g por colher de sopa",
    };
  if (key.includes("baunilha"))
    return { factor: 5, source: "Conversão inicial: 5 g por colher de chá" };
  if (key.includes("cafe"))
    return { factor: 2, source: "Conversão inicial: 2 g por colher de chá" };
  if (key.includes("sal marinho"))
    return { factor: 4, source: "Conversão inicial: 4 g por colher de chá" };
  if (key.includes("sal") && label.includes("cafe"))
    return { factor: 2, source: "Conversão inicial: 2 g por colher de café" };
  if (key.includes("sal"))
    return { factor: 5, source: "Conversão inicial: 5 g por colher de chá" };
  if (key.includes("raspas"))
    return {
      factor: 1,
      source: "Conversão provisória: pesar as raspas na primeira execução",
    };
  if (label.includes("sopa"))
    return {
      factor: 15,
      source: "Conversão provisória: 15 g por colher de sopa",
    };
  if (label.includes("cha") || label === "colher")
    return {
      factor: 5,
      source: "Conversão provisória: 5 g por colher",
    };
  return {
    factor: 1,
    source: "Conversão provisória: pesar na primeira execução",
  };
}

function parseIngredient(originalText: string): ImportedIngredient {
  const clean = decodeHtml(originalText);
  const parseable = asciiFractions(clean).replace(/\s+/g, " ").trim();
  const quantityMatch = parseable.match(
    /^\s*((?:\d+(?:[.,]\d+)?\s+)?\d+\/\d+|\d+(?:[.,]\d+)?)\s*/,
  );
  let inputQuantity = quantityMatch ? numericQuantity(quantityMatch[1]!) : 1;
  let remainder = parseable.slice(quantityMatch?.[0].length ?? 0).trim();
  let inputUnit: ImportedIngredient["inputUnit"] = "unit";
  let unitLabel = "unidade";
  remainder = remainder.replace(/^de\s+/i, "").trim();
  const unitPatterns: Array<
    [RegExp, ImportedIngredient["inputUnit"], string, number?]
  > = [
    [/^(litros?|l)\b\s*(?:de\s+)?/i, "ml", "litro", 1_000],
    [/^(quilogramas?|quilos?|kg)\b\s*(?:de\s+)?/i, "kg", "kg"],
    [/^(miligramas?|mg)\b\s*(?:de\s+)?/i, "mg", "mg"],
    [/^(gramas?|gr|g)\b\s*(?:de\s+)?/i, "g", "g"],
    [/^(mililitros?|ml)\b\s*(?:de\s+)?/i, "ml", "ml"],
    [
      /^(x[ií]caras?(?:\s+de\s+ch[aá])?)(?=\s|$)\s*(?:de\s+)?/i,
      "ml",
      "xícara",
      240,
    ],
    [
      /^(colher(?:es)?\s+de\s+sopa)(?=\s|$)\s*(?:de\s+)?/i,
      "unit",
      "colher de sopa",
    ],
    [
      /^(colher(?:es)?\s+de\s+chá)(?=\s|$)\s*(?:de\s+)?/i,
      "unit",
      "colher de chá",
    ],
    [
      /^(colher(?:es)?\s+de\s+café)(?=\s|$)\s*(?:de\s+)?/i,
      "unit",
      "colher de café",
    ],
    [/^colher(?:es)?\s+(?:de\s+)?/i, "unit", "colher"],
    [/^(unidades?|un)\b\s*(?:de\s+)?/i, "unit", "unidade"],
  ];
  for (const [pattern, unit, label, multiplier = 1] of unitPatterns) {
    const match = remainder.match(pattern);
    if (!match) continue;
    inputUnit = unit;
    unitLabel = label;
    inputQuantity *= multiplier;
    remainder = remainder.slice(match[0].length).trim();
    break;
  }
  remainder = remainder.replace(/^de\s+/i, "").trim();
  const canonical = canonicalIngredient(remainder);
  const explicitMass = explicitMassReading(clean, inputQuantity);
  const explicitPerUnitMass =
    inputUnit === "unit" ? explicitMass?.perUnitG : null;
  const usesAlternativeMass =
    inputUnit !== "g" &&
    inputUnit !== "kg" &&
    inputUnit !== "mg" &&
    Boolean(explicitMass?.alternative) &&
    !explicitPerUnitMass;
  if (usesAlternativeMass && explicitMass) {
    inputQuantity = explicitMass.quantityG;
    inputUnit = "g";
    unitLabel = "g";
  }
  const standardFactor =
    inputUnit === "kg"
      ? 1_000
      : inputUnit === "mg"
        ? 0.001
        : inputUnit === "g"
          ? 1
          : null;
  const inferred =
    standardFactor === null && !explicitPerUnitMass
      ? inferredFactor(canonical.name, unitLabel)
      : null;
  const conversionFactorToG =
    standardFactor ?? explicitPerUnitMass ?? inferred!.factor;
  const conversionSource = explicitPerUnitMass
    ? `Peso informado pela fonte: ${explicitPerUnitMass} g por unidade`
    : (inferred?.source ?? null);
  const warnings = [
    ...(inferred
      ? [`${canonical.name}: ${inferred.source.toLocaleLowerCase("pt-BR")}.`]
      : []),
    ...(usesAlternativeMass
      ? [
          `${canonical.name}: a medida alternativa de ${inputQuantity} g informada pela fonte foi priorizada.`,
        ]
      : []),
  ];
  return {
    originalText: clean,
    name: canonical.name,
    category: canonical.category,
    notes: importedIngredientNote(remainder, canonical.name),
    inputQuantity,
    inputUnit,
    quantityG: Math.round(inputQuantity * conversionFactorToG * 1000) / 1000,
    conversionFactorToG,
    conversionSource,
    conversionConfidence: inferred ? "inferred" : "imported",
    perishable: canonical.perishable,
    warnings,
  };
}

function normalizeAiIngredient(ingredient: ImportedIngredient) {
  const fromName = canonicalIngredient(ingredient.name);
  const canonical =
    fromName.category !== "Outros ingredientes"
      ? fromName
      : canonicalIngredient(ingredient.originalText);
  if (canonical.category === "Outros ingredientes") {
    return {
      ...ingredient,
      notes:
        ingredient.notes ??
        importedIngredientNote(ingredient.originalText, ingredient.name),
    };
  }
  return {
    ...ingredient,
    name: canonical.name,
    category: canonical.category,
    perishable: canonical.perishable,
    notes:
      ingredient.notes ??
      importedIngredientNote(ingredient.originalText, canonical.name),
  };
}

function normalizeAiDraft(draft: ImportedRecipeDraft): ImportedRecipeDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.map(normalizeAiIngredient),
  };
}

function classifyStep(text: string) {
  const key = normalize(text);
  if (/separ(?:e|ar).{0,30}pes(?:e|ar)|mise en place/.test(key))
    return {
      kind: "active" as const,
      equipment: "utensil" as const,
      moment: "Mise en place",
    };
  if (/quebre os ovos/.test(key))
    return {
      kind: "active" as const,
      equipment: "utensil" as const,
      moment: "Massa",
    };
  if (/retire.{0,35}fogo.{0,35}bat|apague.{0,35}fogo.{0,35}bat/.test(key))
    return {
      kind: "active" as const,
      equipment: "mixer" as const,
      moment: "Massa",
    };
  if (/geladeira|refrigere|refrigerador|freezer/.test(key))
    return {
      kind: "cold" as const,
      equipment: "refrigeration" as const,
      moment: "Finalização",
    };
  if (/deixe.{0,30}descans|repous/.test(key))
    return { kind: "rest" as const, equipment: null, moment: "Finalização" };
  if (/porcion|cort(?:e|ar)/.test(key))
    return {
      kind: "assembly" as const,
      equipment: "utensil" as const,
      moment: "Finalização",
    };
  if (/esfri|resfr|gelar|retire.{0,30}forno|desenform/.test(key))
    return { kind: "cooling" as const, equipment: null, moment: "Finalização" };
  if (
    /test(?:e|ar).{0,20}ponto|verific(?:ar|ue).{0,20}ponto|pressione.{0,40}superficie|textura.{0,20}esponja|palito|garfo/.test(
      key,
    )
  )
    return {
      kind: "oven" as const,
      equipment: "oven" as const,
      moment: "Forno",
    };
  if (/\basse\b|leve.{0,30}\bforno\b|assar por|cozimento/.test(key))
    return {
      kind: "oven" as const,
      equipment: "oven" as const,
      moment: "Forno",
    };
  if (
    /pre aque|preaqu|prepar(?:e|ar).{0,30}\bforma\b|unt(?:e|ar).{0,30}\bforma\b|papel manteiga/.test(
      key,
    )
  )
    return {
      kind: /\bforno\b/.test(key) ? ("heating" as const) : ("active" as const),
      equipment: /\bforno\b/.test(key)
        ? ("oven" as const)
        : ("utensil" as const),
      moment: "Preparação",
    };
  if (/\bforno\b|assar|asse|leve ao forno|cozimento/.test(key))
    return {
      kind: "oven" as const,
      equipment: "oven" as const,
      moment: "Forno",
    };
  if (/\bderret(?:a|er|endo)?\b|fogo|panela|frigideira|aque[cç]/.test(key))
    return {
      kind: "heating" as const,
      equipment: "stove" as const,
      moment: "Base de chocolate",
    };
  if (/mont|reche|decor|finaliz/.test(key))
    return {
      kind: "assembly" as const,
      equipment: "utensil" as const,
      moment: "Finalização",
    };
  return {
    kind: "active" as const,
    equipment: /batedeira|mixer/.test(key)
      ? ("mixer" as const)
      : ("utensil" as const),
    moment: /\bforma\b|pre aque/.test(key) ? "Preparação" : "Massa",
  };
}

function consolidatedInstructionTexts(instructions: string[]) {
  const normalized = instructions.map(normalize);
  const preheatIndex = normalized.findIndex((text) =>
    /pre aque|preaqu/.test(text),
  );
  const ovenGuidanceIndexes = normalized
    .map((text, index) => ({ text, index }))
    .filter(
      ({ text, index }) =>
        index !== preheatIndex &&
        /forno de confianca|precisao.{0,30}temperatura|assad.{0,30}temperatura baixa/.test(
          text,
        ),
    )
    .map(({ index }) => index);
  const bakeIndex = normalized.findIndex(
    (text) =>
      /transfir|despej|coloque|leve/.test(text) &&
      /\bforma\b|\bforno\b/.test(text) &&
      /\bforno\b|assar|asse/.test(text),
  );
  const bakeTimeIndex = normalized.findIndex(
    (text, index) =>
      index !== bakeIndex &&
      /\bforma\b/.test(text) &&
      /\bforno\b|cozimento/.test(text) &&
      /\d+\s*min/.test(text),
  );
  const skip = new Set<number>();
  const replacements = new Map<number, string>();

  if (preheatIndex >= 0 && ovenGuidanceIndexes.length > 0) {
    ovenGuidanceIndexes.forEach((index) => skip.add(index));
    const ordered = [...ovenGuidanceIndexes, preheatIndex].sort(
      (a, b) => a - b,
    );
    replacements.set(
      Math.min(...ordered),
      ordered.map((index) => instructions[index]!).join(" "),
    );
    skip.add(preheatIndex);
  }
  if (bakeIndex >= 0 && bakeTimeIndex >= 0) {
    replacements.set(
      bakeIndex,
      `${instructions[bakeIndex]!} ${instructions[bakeTimeIndex]!}`,
    );
    skip.add(bakeTimeIndex);
  }

  return instructions.flatMap((instruction, index) => {
    const replacement = replacements.get(index);
    if (replacement) return [replacement];
    return skip.has(index) ? [] : [instruction];
  });
}

const importedMomentOrder = [
  "Mise en place",
  "Base de chocolate",
  "Massa",
  "Preparação",
  "Forno",
  "Finalização",
] as const;

function chronologicallyOrderedMoments(
  moments: Map<string, ImportedRecipeDraft["moments"][number]>,
) {
  const rank = new Map(importedMomentOrder.map((name, index) => [name, index]));
  return [...moments.values()].sort(
    (left, right) =>
      (rank.get(left.name as (typeof importedMomentOrder)[number]) ?? 99) -
      (rank.get(right.name as (typeof importedMomentOrder)[number]) ?? 99),
  );
}

function hasAuthoredPreparationSections(draft: ImportedRecipeDraft) {
  const generic = new Set<string>(importedMomentOrder);
  return (
    draft.moments.filter((moment) => !generic.has(moment.name)).length >= 2
  );
}

function explicitStepDuration(text: string) {
  const key = normalize(text);
  const hourRange = key.match(/(\d+)\s*(?:a|ate|ou)\s*(\d+)\s*h(?:oras?)?\b/);
  if (hourRange) return Number(hourRange[2]) * 60;
  const hours = key.match(/(\d+)\s*(?:h|hora|horas)\b/);
  if (hours) return Number(hours[1]) * 60;
  const range = key.match(/(\d+)\s*(?:a|ate|ou)\s*(\d+)s?\s*min/);
  if (range) return Number(range[2]);
  const explicit = key.match(/(?:por\s+)?(?:aproximadamente\s+)?(\d+)\s*min/);
  if (explicit) return Number(explicit[1]);
  return null;
}

function stepDuration(
  text: string,
  kind: ReturnType<typeof classifyStep>["kind"],
) {
  const explicit = explicitStepDuration(text);
  if (explicit !== null) return explicit;
  if (
    /test(?:e|ar).{0,20}ponto|pressione.{0,40}superficie|textura.{0,20}esponja|palito|garfo/.test(
      normalize(text),
    )
  )
    return 2;
  if (kind === "cooling") return 60;
  if (kind === "cold") return 60;
  if (kind === "rest") return 30;
  if (kind === "oven") return 25;
  if (kind === "heating") return 8;
  return 5;
}

function fitInferredDurationsToDeclaredTotal(
  records: Array<{
    text: string;
    step: { durationMinutes: number };
  }>,
  declaredTotal: number | null,
) {
  if (declaredTotal === null) return false;
  const inferred = records.filter(
    (record) => explicitStepDuration(record.text) === null,
  );
  if (inferred.length === 0) return false;
  const fixedTotal = records
    .filter((record) => explicitStepDuration(record.text) !== null)
    .reduce((total, record) => total + record.step.durationMinutes, 0);
  const available = declaredTotal - fixedTotal;
  if (available < inferred.length) return false;

  const distributable = available - inferred.length;
  const weights = inferred.map((record) =>
    Math.max(0, record.step.durationMinutes - 1),
  );
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  const allocations = inferred.map((record, index) => {
    const exact = weightTotal
      ? (distributable * weights[index]!) / weightTotal
      : distributable / inferred.length;
    const whole = Math.floor(exact);
    return { record, minutes: 1 + whole, fraction: exact - whole };
  });
  let remainder =
    available - allocations.reduce((total, item) => total + item.minutes, 0);
  allocations
    .sort((left, right) => right.fraction - left.fraction)
    .forEach((item) => {
      if (remainder <= 0) return;
      item.minutes += 1;
      remainder -= 1;
    });
  for (const item of allocations)
    item.record.step.durationMinutes = item.minutes;
  return true;
}

function stepName(text: string, index: number) {
  const key = normalize(text);
  if (/separ(?:e|ar).{0,30}pes(?:e|ar)|mise en place/.test(key))
    return "Separar e pesar os ingredientes";
  if (
    /test(?:e|ar).{0,20}ponto|pressione.{0,40}superficie|textura.{0,20}esponja|palito|garfo/.test(
      key,
    )
  )
    return "Verificar o ponto do bolo";
  if (/certifique.{0,40}farinha|bolsas de farinha/.test(key))
    return "Conferir a incorporação da farinha";
  if (/model(?:e|ar).{0,40}biscoit/.test(key) && /assar|asse/.test(key))
    return "Modelar e assar os biscoitos";
  if (/pao de lo/.test(key) && /assar|asse/.test(key))
    return "Preparar e assar o pão-de-ló";
  if (/biscoit/.test(key) && /\basse\b|assar/.test(key))
    return "Assar os biscoitos";
  if (/polvilhe.{0,35}a[cç]ucar/.test(key) && /\basse\b|assar/.test(key))
    return "Polvilhar açúcar e assar";
  if (/^asse\b|\bassar por/.test(key)) return "Assar";
  if (/pre aque|preaqu/.test(key)) return "Preparar e preaquecer o forno";
  if (/transfir|despej|leve/.test(key) && /\bforno\b|assar|asse/.test(key))
    return "Levar a massa ao forno";
  if (/\d+\s*min/.test(key) && /\bforno\b|assar|asse|cozimento/.test(key))
    return `Assar por ${explicitStepDuration(text) ?? "o tempo indicado"} minutos`;
  if (/retire.{0,30}forno|esfri|resfr|desenform/.test(key))
    return "Esfriar e desenformar";
  if (/geladeira.{0,35}\d+\s*horas?|refrigere.{0,35}\d+\s*horas?/.test(key))
    return `Refrigerar por ${explicitStepDuration(text) ?? "o tempo indicado"} minutos`;
  if (/forno de confianca|precisao.{0,30}temperatura/.test(key))
    return "Regular o forno com precisão";
  if (/\bforno\b|assar|asse/.test(key)) return "Assar";
  if (key.includes("chocolate") && key.includes("ovos"))
    return "Incorporar a base de chocolate";
  if (/\bderret(?:a|er|endo)?\b/.test(key))
    return "Dourar a manteiga e derreter o chocolate";
  if (/\bforma\b/.test(key)) return "Preparar a forma";
  if (/cort(?:e|ar).{0,35}tiras/.test(key)) return "Cortar em tiras";
  if (key.includes("secos") || key.includes("peneir"))
    return "Peneirar os ingredientes secos";
  if (key.includes("quebre os ovos")) return "Separar os ovos";
  if (key.includes("ovos") && key.includes("acucar"))
    return "Aerar ovos e açúcar";
  if (/raspas|baunilha/.test(key) && /mistura|massa|bat/.test(key))
    return "Aromatizar a massa";
  if (/incorpore.{0,30}farinha|adicione.{0,30}farinha/.test(key))
    return /3 partes|tres partes/.test(key)
      ? "Incorporar a farinha em três partes"
      : "Incorporar a farinha";
  if (key.includes("espatula")) return "Homogeneizar a massa";
  if (key.includes("esfri")) return "Resfriar e porcionar";
  const firstAction = text.split(/[.!?]/)[0]?.trim();
  if (!firstAction) return `Etapa ${index + 1}`;
  if (firstAction.length <= 96) return firstAction;
  const shortened = firstAction.slice(0, 96).replace(/\s+\S*$/, "");
  return shortened || firstAction.slice(0, 96);
}

function assignedStepRef(
  ingredient: ImportedIngredient,
  steps: Array<{ ref: string; text: string }>,
) {
  const ingredientTokens = normalize(ingredient.name)
    .split(" ")
    .filter(
      (token) => token.length > 3 && !["sem", "fino", "amargo"].includes(token),
    );
  const found = steps.find((step) => {
    const normalizedStep = normalize(step.text);
    return ingredientTokens.some((token) => normalizedStep.includes(token));
  });
  return (
    found?.ref ??
    steps.find((step) => normalize(step.text).includes("mist"))?.ref ??
    steps[0]!.ref
  );
}

function privateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 0
  );
}

function privateAddress(address: string) {
  if (isIP(address) === 4) return privateIpv4(address);
  const key = address.toLowerCase();
  return (
    key === "::1" ||
    key === "::" ||
    key.startsWith("fc") ||
    key.startsWith("fd") ||
    key.startsWith("fe80:")
  );
}

async function validatePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Informe um endereço completo, começando por https://.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("A importação aceita somente páginas http ou https.");
  if (url.username || url.password)
    throw new Error("A URL não pode conter credenciais.");
  if (
    ["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())
  )
    throw new Error("Este endereço não está disponível para importação.");
  const addresses = await lookup(url.hostname, { all: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => privateAddress(entry.address))
  )
    throw new Error("Este endereço não está disponível para importação.");
  return url;
}

async function fetchPublicPage(value: string) {
  let url = await validatePublicUrl(value);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(fetchTimeoutMs),
      headers: { "user-agent": "Zucchero Recipe Importer/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error("A página respondeu com um redirecionamento inválido.");
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok)
      throw new Error(`A página respondeu com status ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html"))
      throw new Error("O endereço informado não é uma página HTML.");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maximumPageBytes)
      throw new Error("A página é grande demais para importação automática.");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > maximumPageBytes)
      throw new Error("A página é grande demais para importação automática.");
    return { html, url: url.toString() };
  }
  throw new Error("A página redirecionou vezes demais.");
}

export function parseStructuredRecipeHtml(
  html: string,
  sourceUrl: string,
): ImportedRecipeDraft {
  const recipe = structuredRecipeFromHtml(html);
  if (!recipe)
    throw new Error(
      "Não encontramos uma receita estruturada nesta página. Revise a URL ou cadastre manualmente.",
    );
  const ingredientsVisibleOnPage = visibleIngredientRecords(html);
  const sourceIngredientRecords =
    ingredientsVisibleOnPage.length > 0
      ? ingredientsVisibleOnPage
      : ingredientTexts(recipe).map((text) => ({ text, groupName: null }));
  const equipmentLines = sourceIngredientRecords
    .filter((ingredient) => isEquipmentLine(ingredient.text))
    .map((ingredient) => ingredient.text);
  const parsedIngredientRecords = sourceIngredientRecords
    .filter((ingredient) => !isEquipmentLine(ingredient.text))
    .map((ingredient) => ({
      ...ingredient,
      ingredient: parseIngredient(ingredient.text),
    }));
  const ingredients = parsedIngredientRecords.map(
    (ingredient) => ingredient.ingredient,
  );
  const extractedInstructionRecords = instructionRecords(
    recipe.recipeInstructions ?? recipe.step,
  );
  const authoredSectionNames = [
    ...new Set(
      extractedInstructionRecords
        .map((instruction) => instruction.sectionName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const preserveAuthoredSections = authoredSectionNames.length >= 2;
  const parsedInstructionRecords = preserveAuthoredSections
    ? splitAuthoredInstructions(extractedInstructionRecords)
    : consolidatedInstructionTexts(
        extractedInstructionRecords.map((instruction) => instruction.text),
      ).map((text) => ({ text, sectionName: null }));
  if (ingredients.length === 0 || parsedInstructionRecords.length === 0)
    throw new Error(
      "A página não informou ingredientes e etapas suficientes para importar.",
    );
  const sourceNameMatch = html.match(
    /<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i,
  );
  const sourceName = decodeHtml(
    sourceNameMatch?.[1] ?? new URL(sourceUrl).hostname.replace(/^www\./, ""),
  );
  const declaredTotalDuration =
    parseDuration(recipe.totalTime ?? recipe.totalDuration) ?? null;
  const standardMiseEnPlaceText =
    "Separe e pese todos os ingredientes nas quantidades da ficha antes de começar.";
  const instructionsWithMiseEnPlace: ImportedInstructionRecord[] = [
    { text: standardMiseEnPlaceText, sectionName: "Mise en place" },
    ...parsedInstructionRecords,
  ];
  const stepRecords = instructionsWithMiseEnPlace.map((instruction, index) => {
    const classification = classifyStep(instruction.text);
    return {
      ref: `import-step-${index + 1}`,
      text: instruction.text,
      moment:
        preserveAuthoredSections && instruction.sectionName
          ? instruction.sectionName
          : classification.moment,
      step: {
        ref: `import-step-${index + 1}`,
        name: stepName(instruction.text, index),
        instructions: instruction.text,
        durationMinutes: stepDuration(instruction.text, classification.kind),
        kind: classification.kind,
        requiredEquipmentKind: classification.equipment,
        parallelizable: /pre aque|peneir|secos/.test(
          normalize(instruction.text),
        ),
      },
    };
  });
  const durationsAdjusted = preserveAuthoredSections
    ? false
    : fitInferredDurationsToDeclaredTotal(stepRecords, declaredTotalDuration);
  const momentsByName = new Map<
    string,
    ImportedRecipeDraft["moments"][number]
  >();
  for (const record of stepRecords) {
    const existing = momentsByName.get(record.moment);
    if (existing) existing.steps.push(record.step);
    else
      momentsByName.set(record.moment, {
        ref: `import-moment-${momentsByName.size + 1}`,
        name: record.moment,
        description: "",
        preparationRole:
          record.moment === "Finalização" ? "final" : "intermediate",
        steps: [record.step],
      });
  }
  const producerGroupsExcludedFromYield = new Set<string>();
  parsedIngredientRecords.forEach((record) => {
    if (!/preparad[oa]|de v[eé]spera/i.test(record.text)) return;
    const tokens = normalize(record.ingredient.name)
      .split(" ")
      .filter((token) => token.length > 4 && token !== "queijo");
    parsedIngredientRecords.forEach((candidate) => {
      if (
        candidate.groupName &&
        candidate.groupName !== record.groupName &&
        tokens.some((token) => normalize(candidate.groupName!).includes(token))
      ) {
        producerGroupsExcludedFromYield.add(candidate.groupName);
      }
    });
  });
  const ingredientsUsedForYield = parsedIngredientRecords.filter(
    (record) =>
      !record.groupName ||
      !producerGroupsExcludedFromYield.has(record.groupName),
  );
  const rawMassG = ingredientsUsedForYield.reduce(
    (total, record) => total + record.ingredient.quantityG,
    0,
  );
  const expectedLossPercentage = 7;
  const yieldMassG = Math.max(
    50,
    Math.round((rawMassG * (1 - expectedLossPercentage / 100)) / 10) * 10,
  );
  const yieldText = asText(recipe.recipeYield ?? recipe.yield);
  const yieldUnitsMatch = yieldText.match(/\d+/);
  const yieldUnits = yieldUnitsMatch ? Number(yieldUnitsMatch[0]) : null;
  const yieldRangeMatch = yieldText.match(/(\d+)\s*(?:a|até|[-–—])\s*(\d+)/i);
  const orderedMoments = chronologicallyOrderedMoments(momentsByName).map(
    (moment, index, all) => ({
      ...moment,
      ref: `import-moment-${index + 1}`,
      preparationRole:
        index === all.length - 1
          ? ("final" as const)
          : ("intermediate" as const),
    }),
  );
  const orderedSteps = orderedMoments.flatMap((moment) => moment.steps);
  const longestExplicitStep = stepRecords.reduce(
    (longest, record) =>
      explicitStepDuration(record.text) !== null &&
      record.step.durationMinutes > longest.durationMinutes
        ? {
            name: record.step.name,
            durationMinutes: record.step.durationMinutes,
          }
        : longest,
    { name: "", durationMinutes: 0 },
  );
  const warnings = [
    ...ingredients.flatMap((ingredient) => ingredient.warnings),
    ...equipmentLines.map(
      (line) =>
        `“${decodeHtml(line)}” foi reconhecido como utensílio e não entrou no estoque nem no cálculo de rendimento.`,
    ),
    ...(yieldRangeMatch
      ? [
          `A fonte informa rendimento de ${yieldRangeMatch[1]} a ${yieldRangeMatch[2]} unidades; registramos ${yieldRangeMatch[1]} como valor conservador.`,
        ]
      : []),
    `Rendimento em peso estimado em ${yieldMassG} g a partir dos ingredientes que chegam ao produto final e de ${expectedLossPercentage}% de perda. Confirme pesando a primeira produção.`,
    durationsAdjusted
      ? `Tempos não explícitos foram distribuídos dentro dos ${declaredTotalDuration} minutos informados pela fonte e devem ser revisados antes da publicação.`
      : "Tempos não explícitos foram estimados e devem ser revisados antes da publicação.",
    "O Zucchero incluiu uma etapa padrão de mise en place para separar e pesar os ingredientes antes do preparo.",
    ...(preserveAuthoredSections
      ? [
          `As ${authoredSectionNames.length} subpreparações nomeadas pela fonte foram preservadas na ordem original.`,
        ]
      : []),
    ...(declaredTotalDuration !== null &&
    longestExplicitStep.durationMinutes > declaredTotalDuration
      ? [
          `A fonte resume o tempo total em ${declaredTotalDuration} minutos, mas “${longestExplicitStep.name}” declara ${longestExplicitStep.durationMinutes} minutos. Mantivemos os dois valores para revisão, pois o resumo pode desconsiderar preparos feitos de véspera.`,
        ]
      : []),
    ...[...producerGroupsExcludedFromYield].map(
      (groupName) =>
        `Os insumos de “${groupName}” não foram somados novamente ao rendimento porque a própria receita utiliza uma quantidade do preparo resultante.`,
    ),
  ];
  const steps = stepRecords.map((record) => ({
    ref: record.ref,
    text: record.text,
  }));
  return {
    source: {
      name: sourceName,
      url: sourceUrl,
      author: authorName(recipe.author),
      accessedAt: new Date().toISOString(),
      method: "structured_data",
    },
    name: asText(recipe.name) || "Receita importada",
    yieldMassG,
    yieldUnits,
    expectedLossPercentage,
    totalDurationMinutes:
      declaredTotalDuration ??
      stepRecords.reduce(
        (total, record) => total + record.step.durationMinutes,
        0,
      ),
    ingredients,
    moments: orderedMoments,
    dependencies: orderedSteps.slice(1).map((step, index) => ({
      predecessorStepRef: orderedSteps[index]!.ref,
      successorStepRef: step.ref,
    })),
    ingredientStepRefs: ingredients.map((ingredient) =>
      assignedStepRef(ingredient, steps),
    ),
    warnings: [...new Set(warnings)],
    confidence: warnings.length <= 2 ? "high" : "medium",
  };
}

export async function importRecipeFromUrl(
  url: string,
): Promise<ImportedRecipeDraft> {
  const page = await fetchPublicPage(url);
  let deterministicDraft: ImportedRecipeDraft | null = null;
  let deterministicError: Error | null = null;
  try {
    deterministicDraft = parseStructuredRecipeHtml(page.html, page.url);
  } catch (error) {
    deterministicError =
      error instanceof Error
        ? error
        : new Error("Não foi possível interpretar esta receita.");
  }

  if (
    deterministicDraft &&
    hasAuthoredPreparationSections(deterministicDraft)
  ) {
    return deterministicDraft;
  }

  if (recipeAiEnabled()) {
    try {
      return normalizeAiDraft(
        await refineRecipeWithAi({
          sourceUrl: page.url,
          pageText: pageTextForAi(page.html),
          deterministicDraft,
        }),
      );
    } catch (error) {
      if (!deterministicDraft) throw error;
      return {
        ...deterministicDraft,
        confidence: "low" as const,
        warnings: [
          ...deterministicDraft.warnings,
          `A análise por IA local não ficou disponível nesta tentativa: ${
            error instanceof Error ? error.message : "falha desconhecida"
          } O Zucchero manteve a leitura estruturada como contingência.`,
        ],
      };
    }
  }

  if (deterministicDraft) return deterministicDraft;
  throw (
    deterministicError ??
    new Error("Não foi possível interpretar esta receita.")
  );
}
