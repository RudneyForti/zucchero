"use client";

import {
  BookOpenCheck,
  Calculator,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  Clock3,
  Coins,
  FilePenLine,
  GripVertical,
  History,
  Link2,
  ListChecks,
  Plus,
  Scale,
  Trash2,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  confirmRecipeImportAction,
  createRecipeAction,
  previewRecipeImportAction,
  type RecipeImportActionState,
  type RecipeImportPreviewState,
  type RecipeActionState,
} from "@/app/receitas/actions";
import { PageBackButton } from "@/components/page-back-button";
import {
  NumberField,
  SearchableCombobox,
  TextField,
  TextAreaField,
  type ComboboxOption,
} from "@/components/form-controls";
import { SystemNotifications } from "@/components/system-notifications";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import {
  scaleRecipe,
  type RecipeSummary,
  type RecipeWorkspace,
} from "@/lib/recipes";

type IngredientDraft = {
  id: string;
  ingredientGroupId: string;
  recipeStepRef: string;
  inputQuantity: string;
  inputUnit: MeasurementUnit;
  conversionFactorToG: string;
  conversionSource: string;
  conversionConfidence: "provided" | "imported" | "inferred";
  notes: string;
  selectionPolicy: "generic" | "preferred" | "required";
  preferredCommercialItemId: string;
  wastePercentage: string;
};

type MeasurementUnit = "g" | "kg" | "mg" | "ml" | "unit";

type SubrecipeDraft = {
  id: string;
  referencedRecipeVersionId: string;
  recipeMomentRef: string;
  requiredYieldG: string;
  notes: string;
};

type StepKind =
  "active" | "heating" | "oven" | "rest" | "cooling" | "cold" | "assembly";
type EquipmentKind =
  "" | "oven" | "mixer" | "refrigeration" | "stove" | "utensil" | "other";
type PreparationRole = "intermediate" | "final";

type StepDraft = {
  id: string;
  name: string;
  instructions: string;
  durationMinutes: string;
  kind: StepKind;
  requiredEquipmentKind: EquipmentKind;
  parallelizable: boolean;
  predecessorStepRefs: string[];
};

type MomentDraft = {
  id: string;
  name: string;
  description: string;
  preparationRole: PreparationRole;
  steps: StepDraft[];
};

type RecipesDashboardProps = {
  initialWorkspace: RecipeWorkspace;
};

type EditorMode = "create" | "new-version" | "edit-draft";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const preciseNumber = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

const stepKinds: Array<{ value: StepKind; label: string }> = [
  { value: "active", label: "Trabalho ativo" },
  { value: "heating", label: "Fogão" },
  { value: "oven", label: "Forno" },
  { value: "rest", label: "Descanso" },
  { value: "cooling", label: "Resfriamento" },
  { value: "cold", label: "Geladeira/freezer" },
  { value: "assembly", label: "Montagem" },
];

const equipmentKinds: Array<{ value: EquipmentKind; label: string }> = [
  { value: "", label: "Não precisa reservar equipamento" },
  { value: "oven", label: "Forno" },
  { value: "mixer", label: "Batedeira" },
  { value: "refrigeration", label: "Geladeira ou freezer" },
  { value: "stove", label: "Fogão" },
  { value: "utensil", label: "Ferramenta específica" },
  { value: "other", label: "Outro equipamento" },
];

const preparationRoles: Array<{ value: PreparationRole; label: string }> = [
  { value: "intermediate", label: "Preparação intermediária" },
  { value: "final", label: "Avanço do produto final" },
];

const measurementUnits: Array<{
  value: MeasurementUnit;
  label: string;
}> = [
  { value: "g", label: "gramas (g)" },
  { value: "kg", label: "quilos (kg)" },
  { value: "mg", label: "miligramas (mg)" },
  { value: "ml", label: "mililitros (ml)" },
  { value: "unit", label: "unidades" },
];

function freshId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isAutomaticImportMessage(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return (
    text.startsWith("Etapas reconhecidas automaticamente na fonte ") ||
    text.startsWith("Subpreparação preservada da divisão original de ")
  );
}

function emptyStep(id = "step-initial"): StepDraft {
  return {
    id,
    name: "",
    instructions: "",
    durationMinutes: "15",
    kind: "active",
    requiredEquipmentKind: "",
    parallelizable: false,
    predecessorStepRefs: [],
  };
}

function standardConversionFactor(unit: MeasurementUnit) {
  if (unit === "kg") return 1_000;
  if (unit === "mg") return 0.001;
  if (unit === "g") return 1;
  return null;
}

function convertedIngredientMass(ingredient: IngredientDraft) {
  const quantity = Number(ingredient.inputQuantity) || 0;
  const factor =
    standardConversionFactor(ingredient.inputUnit) ??
    (Number(ingredient.conversionFactorToG) || 0);
  return quantity * factor;
}

function emptyMoment(
  id = "moment-initial",
  stepId = "step-initial",
): MomentDraft {
  return {
    id,
    name: "",
    description: "",
    preparationRole: "final",
    steps: [emptyStep(stepId)],
  };
}

function formatDuration(total: number) {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

function meaningfulStepName(step: StepDraft, stepIndex: number) {
  const name = step.name.trim();
  if (name && !/^etapa\s+\d+$/i.test(name)) return name;
  const instructionName = step.instructions.split(/[.!?]/)[0]?.trim();
  return instructionName || `Etapa ${stepIndex + 1}`;
}

function RecipeSectionSummary({
  index,
  title,
  meta,
}: {
  index?: number;
  title: string;
  meta: string;
}) {
  return (
    <summary className="recipe-collapsible-summary">
      <span className="recipe-collapsible-title">
        {index ? <i aria-hidden="true">{index}</i> : null}
        <span>
          <strong>{title}</strong>
          <small>{meta}</small>
        </span>
      </span>
      <ChevronDown aria-hidden="true" />
    </summary>
  );
}

type CollapsibleDetailsProps = Omit<
  ComponentPropsWithoutRef<"details">,
  "open" | "onToggle"
> & {
  initialOpen?: boolean;
};

function CollapsibleDetails({
  initialOpen = false,
  ...props
}: CollapsibleDetailsProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      {...props}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    />
  );
}

export function RecipesDashboard({ initialWorkspace }: RecipesDashboardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailsDialogRef = useRef<HTMLDialogElement>(null);
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editingRecipeId, setEditingRecipeId] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [simulationMassG, setSimulationMassG] = useState("1200");
  const [name, setName] = useState("");
  const [yieldMassG, setYieldMassG] = useState("1200");
  const [yieldUnits, setYieldUnits] = useState("12");
  const [expectedLossPercentage, setExpectedLossPercentage] = useState("0");
  const [recipeSource, setRecipeSource] =
    useState<RecipeSummary["source"]>(null);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    {
      id: "ingredient-initial",
      ingredientGroupId: initialWorkspace.catalog[0]?.id ?? "",
      recipeStepRef: "step-initial",
      inputQuantity: "500",
      inputUnit: "g",
      conversionFactorToG: "1",
      conversionSource: "",
      conversionConfidence: "provided",
      notes: "",
      selectionPolicy: "generic",
      preferredCommercialItemId: "",
      wastePercentage: "0",
    },
  ]);
  const [moments, setMoments] = useState<MomentDraft[]>([emptyMoment()]);
  const [subrecipes, setSubrecipes] = useState<SubrecipeDraft[]>([]);
  const [dismissedNotification, setDismissedNotification] = useState<
    number | null
  >(null);
  const initialState: RecipeActionState = {
    status: "idle",
    message: "",
    workspace: initialWorkspace,
    notificationId: null,
  };
  const [actionState, formAction, pending] = useActionState(
    createRecipeAction,
    initialState,
  );
  const importPreviewInitialState: RecipeImportPreviewState = {
    status: "idle",
    message: "",
    preview: null,
  };
  const [importPreviewState, importPreviewAction, importPreviewPending] =
    useActionState(previewRecipeImportAction, importPreviewInitialState);
  const importInitialState: RecipeImportActionState = {
    status: "idle",
    message: "",
    workspace: initialWorkspace,
    notificationId: null,
  };
  const [importActionState, importAction, importPending] = useActionState(
    confirmRecipeImportAction,
    importInitialState,
  );

  useEffect(() => {
    if (actionState.status === "success" && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [actionState.notificationId, actionState.status]);

  useEffect(() => {
    if (
      importActionState.status === "success" &&
      importDialogRef.current?.open
    ) {
      importDialogRef.current.close();
    }
  }, [importActionState.notificationId, importActionState.status]);

  const workspace =
    importActionState.status === "success"
      ? importActionState.workspace
      : actionState.workspace;
  const selectedRecipe = selectedRecipeId
    ? (workspace.recipes.find((recipe) => recipe.id === selectedRecipeId) ??
      null)
    : null;
  const editingRecipe = editingRecipeId
    ? (workspace.recipes.find((recipe) => recipe.id === editingRecipeId) ??
      null)
    : null;
  const publicationVersionNumber =
    editorMode === "new-version"
      ? (editingRecipe?.versionNumber ?? 0) + 1
      : editorMode === "edit-draft"
        ? (editingRecipe?.versionNumber ?? 1)
        : 1;
  const simulation = selectedRecipe
    ? scaleRecipe(selectedRecipe, Number(simulationMassG) || 0)
    : null;
  const groupOptions: ComboboxOption[] = workspace.catalog.map((group) => ({
    value: group.id,
    label: group.name,
    keywords: `${group.name} ${group.category}`,
  }));
  const stepOptions: ComboboxOption[] = moments.flatMap((moment, momentIndex) =>
    moment.steps.map((step, stepIndex) => ({
      value: step.id,
      label: `${moment.name.trim() || `Momento ${momentIndex + 1}`} · ${stepIndex + 1}. ${meaningfulStepName(step, stepIndex)}`,
      keywords: `${name} ${moment.description} ${step.instructions}`,
      group: `Momento ${momentIndex + 1} · ${moment.name.trim() || "Sem nome"}`,
    })),
  );
  const dependencyOptions = moments.flatMap((moment, momentIndex) =>
    moment.steps.map((step, stepIndex) => ({
      value: step.id,
      label: `${moment.name.trim() || `Momento ${momentIndex + 1}`} · ${
        step.name.trim() || `Etapa ${stepIndex + 1}`
      }`,
    })),
  );
  const momentOptions: ComboboxOption[] = moments.map((moment, index) => ({
    value: moment.id,
    label: moment.name.trim() || `Momento ${index + 1}`,
    keywords: moment.description,
  }));
  const subrecipeOptions: ComboboxOption[] = (
    workspace.availableSubrecipes ?? []
  )
    .filter((recipe) => recipe.recipeId !== editingRecipeId)
    .map((recipe) => ({
      value: recipe.recipeVersionId,
      label: `${recipe.recipeName} · versão ${recipe.versionNumber}`,
      keywords: `${recipe.recipeName} ${recipe.yieldMassG} g`,
    }));
  const previewCost = useMemo(
    () =>
      ingredients.reduce((total, ingredient) => {
        const group = workspace.catalog.find(
          (entry) => entry.id === ingredient.ingredientGroupId,
        );
        const preferred = group?.items.find(
          (item) => item.id === ingredient.preferredCommercialItemId,
        );
        const reference =
          preferred ??
          [...(group?.items ?? [])].sort(
            (left, right) => left.lastUnitCost - right.lastUnitCost,
          )[0];
        const quantity = convertedIngredientMass(ingredient);
        const waste = Number(ingredient.wastePercentage) || 0;
        return (
          total + quantity * (1 + waste / 100) * (reference?.lastUnitCost ?? 0)
        );
      }, 0),
    [ingredients, workspace.catalog],
  );
  const previewDuration = moments.reduce(
    (total, moment) =>
      total +
      moment.steps.reduce(
        (subtotal, step) => subtotal + (Number(step.durationMinutes) || 0),
        0,
      ),
    0,
  );
  const previewIngredientMass = ingredients.reduce(
    (total, ingredient) => total + convertedIngredientMass(ingredient),
    0,
  );
  const previewStepCount = moments.reduce(
    (total, moment) => total + moment.steps.length,
    0,
  );
  const previewSubrecipeMass = subrecipes.reduce(
    (total, subrecipe) => total + (Number(subrecipe.requiredYieldG) || 0),
    0,
  );
  const previewSubrecipeCost = subrecipes.reduce((total, subrecipe) => {
    const referenced = (workspace.availableSubrecipes ?? []).find(
      (entry) => entry.recipeVersionId === subrecipe.referencedRecipeVersionId,
    );
    const summary = workspace.recipes.find(
      (entry) => entry.versionId === referenced?.recipeVersionId,
    );
    return referenced && summary
      ? total +
          summary.estimatedCost *
            ((Number(subrecipe.requiredYieldG) || 0) / referenced.yieldMassG)
      : total;
  }, 0);
  const notification = [
    actionState.status === "success" && actionState.notificationId
      ? { id: actionState.notificationId, message: actionState.message }
      : null,
    importActionState.status === "success" && importActionState.notificationId
      ? {
          id: importActionState.notificationId,
          message: importActionState.message,
        }
      : null,
  ].filter((entry): entry is { id: number; message: string } =>
    Boolean(entry && entry.id !== dismissedNotification),
  );

  function updateIngredient(id: string, patch: Partial<IngredientDraft>) {
    setIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, ...patch } : ingredient,
      ),
    );
  }

  function updateMoment(id: string, patch: Partial<MomentDraft>) {
    setMoments((current) =>
      current.map((moment) =>
        moment.id === id ? { ...moment, ...patch } : moment,
      ),
    );
  }

  function updateStep(
    momentId: string,
    stepId: string,
    patch: Partial<StepDraft>,
  ) {
    setMoments((current) =>
      current.map((moment) =>
        moment.id === momentId
          ? {
              ...moment,
              steps: moment.steps.map((step) =>
                step.id === stepId ? { ...step, ...patch } : step,
              ),
            }
          : moment,
      ),
    );
  }

  function keepIngredientAssignments(nextMoments: MomentDraft[]) {
    const availableRefs = new Set(
      nextMoments.flatMap((moment) => moment.steps.map((step) => step.id)),
    );
    const fallbackRef = nextMoments[0]?.steps[0]?.id ?? "";
    setIngredients((current) =>
      current.map((ingredient) => ({
        ...ingredient,
        recipeStepRef: availableRefs.has(ingredient.recipeStepRef)
          ? ingredient.recipeStepRef
          : fallbackRef,
      })),
    );
  }

  function removeMoment(momentId: string) {
    const nextMoments = moments.filter((moment) => moment.id !== momentId);
    setMoments(nextMoments);
    keepIngredientAssignments(nextMoments);
    setSubrecipes((current) =>
      current.filter((subrecipe) => subrecipe.recipeMomentRef !== momentId),
    );
  }

  function removeStep(momentId: string, stepId: string) {
    const nextMoments = moments.map((moment) =>
      moment.id === momentId
        ? {
            ...moment,
            steps: moment.steps.filter((step) => step.id !== stepId),
          }
        : moment,
    );
    setMoments(
      nextMoments.map((moment) => ({
        ...moment,
        steps: moment.steps.map((step) => ({
          ...step,
          predecessorStepRefs: step.predecessorStepRefs.filter(
            (reference) => reference !== stepId,
          ),
        })),
      })),
    );
    keepIngredientAssignments(nextMoments);
  }

  function resetEditor() {
    const initialMoment = emptyMoment(freshId("moment"), freshId("step"));
    setEditorMode("create");
    setEditingRecipeId("");
    setName("");
    setYieldMassG("1200");
    setYieldUnits("12");
    setExpectedLossPercentage("0");
    setRecipeSource(null);
    setIngredients([
      {
        id: freshId("ingredient"),
        ingredientGroupId: workspace.catalog[0]?.id ?? "",
        recipeStepRef: initialMoment.steps[0]!.id,
        inputQuantity: "500",
        inputUnit: "g",
        conversionFactorToG: "1",
        conversionSource: "",
        conversionConfidence: "provided",
        notes: "",
        selectionPolicy: "generic",
        preferredCommercialItemId: "",
        wastePercentage: "0",
      },
    ]);
    setMoments([initialMoment]);
    setSubrecipes([]);
  }

  function openNewRecipe() {
    resetEditor();
    dialogRef.current?.showModal();
  }

  function openRecipeImport() {
    importDialogRef.current?.showModal();
  }

  function openRecipeDetails(recipe: RecipeSummary) {
    setSelectedRecipeId(recipe.id);
    setSimulationMassG(String(recipe.yieldMassG));
    detailsDialogRef.current?.showModal();
  }

  function openRecipeEditor(recipe: RecipeSummary) {
    setEditorMode(recipe.status === "draft" ? "edit-draft" : "new-version");
    setEditingRecipeId(recipe.id);
    setName(recipe.name);
    setYieldMassG(String(recipe.yieldMassG));
    setYieldUnits(recipe.yieldUnits ? String(recipe.yieldUnits) : "");
    setExpectedLossPercentage(String(recipe.expectedLossPercentage));
    setRecipeSource(recipe.source);
    setIngredients(
      recipe.ingredients.map((ingredient) => ({
        id: freshId("ingredient"),
        ingredientGroupId: ingredient.ingredientGroupId,
        recipeStepRef: ingredient.recipeStepRef,
        inputQuantity: String(ingredient.inputQuantity),
        inputUnit: ingredient.inputUnit,
        conversionFactorToG: String(ingredient.conversionFactorToG),
        conversionSource: ingredient.conversionSource ?? "",
        conversionConfidence: ingredient.conversionConfidence,
        notes: ingredient.notes ?? "",
        selectionPolicy: ingredient.selectionPolicy,
        preferredCommercialItemId: ingredient.preferredCommercialItemId ?? "",
        wastePercentage: String(ingredient.wastePercentage),
      })),
    );
    setMoments(
      recipe.moments.map((moment) => ({
        id: freshId("moment"),
        name: moment.name,
        description: isAutomaticImportMessage(moment.description)
          ? ""
          : (moment.description ?? ""),
        preparationRole: moment.preparationRole,
        steps: moment.steps.map((step) => ({
          id: step.ref,
          name: step.name,
          instructions: step.instructions,
          durationMinutes: String(step.durationMinutes),
          kind: step.kind,
          requiredEquipmentKind: step.requiredEquipmentKind ?? "",
          parallelizable: step.parallelizable,
          predecessorStepRefs: step.predecessorStepRefs,
        })),
      })),
    );
    setSubrecipes(
      recipe.subrecipes.map((subrecipe) => ({
        id: freshId("subrecipe"),
        referencedRecipeVersionId: subrecipe.referencedRecipeVersionId,
        recipeMomentRef: subrecipe.recipeMomentRef,
        requiredYieldG: String(subrecipe.requiredYieldG),
        notes: subrecipe.notes ?? "",
      })),
    );
    detailsDialogRef.current?.close();
    dialogRef.current?.showModal();
  }

  function preparePayload(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status = submitter?.value === "published" ? "published" : "draft";
    const payload = {
      name,
      yieldMassG: Number(yieldMassG),
      yieldUnits: yieldUnits ? Number(yieldUnits) : undefined,
      expectedLossPercentage: Number(expectedLossPercentage) || 0,
      status,
      ingredients: ingredients.map((ingredient) => ({
        ingredientGroupId: ingredient.ingredientGroupId,
        recipeStepRef: ingredient.recipeStepRef,
        quantityG: convertedIngredientMass(ingredient),
        inputQuantity: Number(ingredient.inputQuantity),
        inputUnit: ingredient.inputUnit,
        conversionFactorToG:
          standardConversionFactor(ingredient.inputUnit) ??
          Number(ingredient.conversionFactorToG),
        conversionSource:
          ingredient.inputUnit === "ml" || ingredient.inputUnit === "unit"
            ? ingredient.conversionSource || undefined
            : undefined,
        conversionConfidence: ingredient.conversionConfidence,
        notes: ingredient.notes.trim() || undefined,
        selectionPolicy: ingredient.selectionPolicy,
        preferredCommercialItemId:
          ingredient.selectionPolicy === "generic"
            ? undefined
            : ingredient.preferredCommercialItemId || undefined,
        wastePercentage: Number(ingredient.wastePercentage) || 0,
      })),
      moments: moments.map((moment) => ({
        ref: moment.id,
        name: moment.name,
        description: moment.description || undefined,
        preparationRole: moment.preparationRole,
        steps: moment.steps.map((step) => ({
          ref: step.id,
          name: step.name,
          instructions: step.instructions,
          durationMinutes: Number(step.durationMinutes),
          kind: step.kind,
          requiredEquipmentKind: step.requiredEquipmentKind || undefined,
          parallelizable: step.parallelizable,
        })),
      })),
      subrecipes: subrecipes.map((subrecipe) => ({
        referencedRecipeVersionId: subrecipe.referencedRecipeVersionId,
        recipeMomentRef: subrecipe.recipeMomentRef,
        requiredYieldG: Number(subrecipe.requiredYieldG),
        notes: subrecipe.notes || undefined,
      })),
      dependencies: moments.flatMap((moment) =>
        moment.steps.flatMap((step) =>
          step.predecessorStepRefs.map((predecessorStepRef) => ({
            predecessorStepRef,
            successorStepRef: step.id,
          })),
        ),
      ),
      source: recipeSource ?? undefined,
    };
    if (payloadRef.current) payloadRef.current.value = JSON.stringify(payload);
  }

  function revealInvalidField(event: FormEvent<HTMLFormElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    let section = event.target.closest<HTMLDetailsElement>("details");
    while (section) {
      section.open = true;
      section =
        section.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
    }
  }

  return (
    <section className="view recipes-view" aria-labelledby="recipes-title">
      <PageBackButton />
      <header className="page-head recipes-page-head">
        <div>
          <p className="eyebrow">Caderno de receitas</p>
          <h1 id="recipes-title">
            Para repetir o carinho, sem depender da memória.
          </h1>
          <p className="lead">
            Rendimento, custo e ritmo de produção reunidos no mesmo preparo.
          </p>
        </div>
        <div className="recipes-page-actions">
          <button
            className="button button-secondary"
            type="button"
            aria-haspopup="dialog"
            aria-controls="recipe-import-panel"
            onClick={openRecipeImport}
          >
            <Link2 aria-hidden="true" />
            Importar por link
          </button>
          <button
            className="button button-primary"
            type="button"
            aria-haspopup="dialog"
            aria-controls="recipe-panel"
            onClick={openNewRecipe}
          >
            <Plus aria-hidden="true" />
            Nova receita
          </button>
        </div>
      </header>

      <div
        className="pantry-glance recipe-glance"
        aria-label="Resumo das receitas"
      >
        <span>
          <strong>{workspace.summary.recipeCount}</strong> receitas no caderno
        </span>
        <span>
          <strong>{workspace.summary.publishedCount}</strong> prontas para
          pedidos
        </span>
        <span>
          <strong>{workspace.summary.draftCount}</strong>{" "}
          {workspace.summary.draftCount === 1
            ? "receita em edição"
            : "receitas em edição"}
        </span>
      </div>

      <section
        className="recipe-library"
        aria-labelledby="recipe-library-title"
      >
        <div className="section-head">
          <h2 id="recipe-library-title">Do seu jeito, agora com método</h2>
          <span>Versões publicadas não mudam pedidos antigos</span>
        </div>

        <div className="recipe-list">
          {workspace.recipes.map((recipe) => (
            <article className="recipe-card" key={recipe.id}>
              <button
                className="recipe-card-trigger"
                type="button"
                aria-haspopup="dialog"
                aria-label={
                  recipe.status === "published"
                    ? `Abrir detalhes de ${recipe.name}, versão ${recipe.versionNumber}`
                    : `Abrir edição de ${recipe.name}`
                }
                onClick={() => openRecipeDetails(recipe)}
              >
                <div className="recipe-card-main">
                  <div className="recipe-card-title">
                    <span className={`recipe-status is-${recipe.status}`}>
                      {recipe.status === "published"
                        ? "Publicada"
                        : "Em edição"}
                    </span>
                    <h3>{recipe.name}</h3>
                    <p>
                      {recipe.status === "published"
                        ? `Versão ${recipe.versionNumber} · rende `
                        : "Rende "}
                      {number.format(recipe.yieldMassG)} g
                      {recipe.yieldUnits
                        ? ` · ${recipe.yieldUnits} porções`
                        : ""}
                    </p>
                  </div>
                  <div
                    className="recipe-facts"
                    aria-label="Informações da receita"
                  >
                    <span>
                      <Coins aria-hidden="true" />
                      <strong>{currency.format(recipe.estimatedCost)}</strong>
                      <small>custo atual</small>
                    </span>
                    <span>
                      <Clock3 aria-hidden="true" />
                      <strong>{formatDuration(recipe.durationMinutes)}</strong>
                      <small>tempo total</small>
                    </span>
                    <span>
                      <ListChecks aria-hidden="true" />
                      <strong>{recipe.ingredientCount}</strong>
                      <small>ingredientes</small>
                    </span>
                  </div>
                </div>
                <div
                  className="recipe-moments"
                  aria-label="Momentos da receita"
                  style={
                    {
                      "--moment-count": recipe.momentNames.length,
                    } as CSSProperties
                  }
                >
                  <div className="recipe-moments-line" aria-hidden="true" />
                  {recipe.momentNames.map((moment, index) => (
                    <span key={`${recipe.id}-${moment}`}>
                      <i>{index + 1}</i>
                      <small>{moment}</small>
                    </span>
                  ))}
                </div>
                <span className="recipe-card-hint">
                  Ver receita <span aria-hidden="true">→</span>
                </span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <dialog
        className="purchase-dialog recipe-import-dialog"
        ref={importDialogRef}
        aria-labelledby="recipe-import-title"
        aria-describedby="recipe-import-description"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget)
            importDialogRef.current?.close();
        }}
      >
        <section
          className="purchase-panel recipe-import-panel rounded-scroll-shell"
          id="recipe-import-panel"
        >
          <ModalGlassHeader
            title="Importar receita"
            eyebrow="Caderno de receitas"
            closeLabel="Fechar importação de receita"
            onClose={() => importDialogRef.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head recipe-import-head">
              <div>
                <p className="eyebrow">Trazer para o caderno</p>
                <h2 id="recipe-import-title">
                  Cole a fonte. O Zucchero organiza a receita.
                </h2>
              </div>
              <p id="recipe-import-description">
                Primeiro mostramos uma prévia. Nada entra na despensa ou no
                caderno sem a sua confirmação.
              </p>
            </header>

            <form className="recipe-import-form" action={importPreviewAction}>
              <div className="form-field">
                <label htmlFor="recipe-source-url">Link da receita</label>
                <div className="recipe-import-url-row">
                  <TextField
                    id="recipe-source-url"
                    name="recipeSourceUrl"
                    type="url"
                    required
                    aria-describedby="recipe-source-url-help"
                    defaultValue={
                      importPreviewState.preview?.source.url ??
                      "https://paolacarosella.com.br/receitas/brownie/"
                    }
                    placeholder="https://site.com/receita"
                    autoComplete="url"
                  />
                  <button
                    className="button button-secondary"
                    type="submit"
                    disabled={importPreviewPending}
                  >
                    <Link2 aria-hidden="true" />
                    {importPreviewPending ? "Lendo…" : "Analisar receita"}
                  </button>
                </div>
                <small id="recipe-source-url-help">
                  Nesta primeira versão, lemos páginas com dados estruturados de
                  receita ou passo a passo.
                </small>
              </div>
            </form>

            {importPreviewState.status === "error" ? (
              <p className="form-message is-error" role="alert">
                {importPreviewState.message}
              </p>
            ) : null}

            {importPreviewState.preview ? (
              <section
                className="recipe-import-preview"
                aria-labelledby="recipe-import-preview-title"
              >
                <div className="recipe-import-preview-head">
                  <div>
                    <p className="eyebrow">Prévia reconhecida</p>
                    <h3 id="recipe-import-preview-title">
                      {importPreviewState.preview.name}
                    </h3>
                    <p>
                      {importPreviewState.preview.source.author
                        ? `${importPreviewState.preview.source.author} · `
                        : ""}
                      {importPreviewState.preview.source.name}
                    </p>
                  </div>
                  <span className="recipe-import-confidence">
                    <CircleCheck aria-hidden="true" />
                    {importPreviewState.preview.source.method === "llm"
                      ? "Organizada com IA local"
                      : "Estrutura encontrada"}
                  </span>
                </div>

                <div className="recipe-import-facts">
                  <span>
                    <strong>
                      {number.format(importPreviewState.preview.yieldMassG)} g
                    </strong>
                    <small>rendimento estimado</small>
                  </span>
                  <span>
                    <strong>
                      {importPreviewState.preview.yieldUnits ?? "—"}
                    </strong>
                    <small>unidades informadas</small>
                  </span>
                  <span>
                    <strong>
                      {formatDuration(
                        importPreviewState.preview.totalDurationMinutes,
                      )}
                    </strong>
                    <small>tempo da fonte</small>
                  </span>
                  <span>
                    <strong>
                      {importPreviewState.preview.ingredients.length}
                    </strong>
                    <small>ingredientes</small>
                  </span>
                </div>

                <div className="recipe-import-columns">
                  <section>
                    <h4>Ingredientes culinários</h4>
                    <ul className="recipe-import-ingredients">
                      {importPreviewState.preview.ingredients.map(
                        (ingredient) => (
                          <li
                            key={`${ingredient.name}-${ingredient.originalText}`}
                          >
                            <div>
                              <strong>{ingredient.name}</strong>
                              <small>{ingredient.category}</small>
                              {ingredient.notes ? (
                                <small className="recipe-import-ingredient-note">
                                  Especificação: {ingredient.notes}
                                </small>
                              ) : null}
                              <small className="recipe-import-original-measure">
                                Fonte: {ingredient.originalText}
                              </small>
                            </div>
                            <span>
                              {number.format(ingredient.quantityG)} g
                              <small>
                                {ingredient.catalogAction === "reuse"
                                  ? "já existe"
                                  : "será criado"}
                              </small>
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  </section>
                  <section>
                    <h4>Momentos reconhecidos</h4>
                    <ol className="recipe-import-moments">
                      {importPreviewState.preview.moments.map(
                        (moment, index) => (
                          <li key={moment.ref}>
                            <details
                              className="recipe-import-moment"
                              open={index === 0}
                            >
                              <summary>
                                <span className="recipe-import-moment-index">
                                  {index + 1}
                                </span>
                                <span className="recipe-import-moment-title">
                                  <strong>{moment.name}</strong>
                                  <small>
                                    {moment.steps.length}{" "}
                                    {moment.steps.length === 1
                                      ? "etapa"
                                      : "etapas"}
                                    {" · "}
                                    {formatDuration(
                                      moment.steps.reduce(
                                        (total, step) =>
                                          total + step.durationMinutes,
                                        0,
                                      ),
                                    )}
                                  </small>
                                </span>
                              </summary>
                              <ol className="recipe-import-steps">
                                {moment.steps.map((step, stepIndex) => (
                                  <li key={step.ref}>
                                    <div className="recipe-import-step-head">
                                      <span>{stepIndex + 1}</span>
                                      <strong>{step.name}</strong>
                                      <small>
                                        <Clock3 aria-hidden="true" />
                                        {formatDuration(step.durationMinutes)}
                                      </small>
                                    </div>
                                    <p>{step.instructions}</p>
                                  </li>
                                ))}
                              </ol>
                            </details>
                          </li>
                        ),
                      )}
                    </ol>
                  </section>
                </div>

                <aside className="recipe-import-warnings">
                  <CircleAlert aria-hidden="true" />
                  <div>
                    <strong>O que precisa da sua mão</strong>
                    <p>
                      Conversões, rendimento em peso e tempos inferidos ficam
                      sinalizados na edição para revisão antes da publicação.
                    </p>
                  </div>
                </aside>

                <form className="recipe-import-actions" action={importAction}>
                  <input
                    type="hidden"
                    name="recipeSourceUrl"
                    value={importPreviewState.preview.source.url}
                  />
                  <div className="form-field recipe-import-name">
                    <label htmlFor="recipe-import-name">Nome no caderno</label>
                    <TextField
                      id="recipe-import-name"
                      name="recipeImportName"
                      defaultValue={importPreviewState.preview.name}
                      minLength={2}
                      maxLength={140}
                      required
                    />
                  </div>
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => importDialogRef.current?.close()}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={importPending}
                  >
                    <BookOpenCheck aria-hidden="true" />
                    {importPending ? "Preparando edição…" : "Levar para edição"}
                  </button>
                </form>
                {importActionState.status === "error" ? (
                  <p className="form-message is-error" role="alert">
                    {importActionState.message}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </section>
      </dialog>

      <dialog
        className="purchase-dialog recipe-details-dialog"
        ref={detailsDialogRef}
        aria-labelledby="recipe-details-title"
        aria-describedby="recipe-details-description"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget)
            detailsDialogRef.current?.close();
        }}
      >
        {selectedRecipe ? (
          <section className="purchase-panel recipe-details-panel rounded-scroll-shell">
            <ModalGlassHeader
              title={selectedRecipe.name}
              eyebrow="Ficha da receita"
              closeLabel="Fechar detalhes da receita"
              onClose={() => detailsDialogRef.current?.close()}
            />
            <div className="purchase-panel-scroll recipe-details-scroll rounded-scroll-area">
              <header className="recipe-details-head">
                <div>
                  <span className={`recipe-status is-${selectedRecipe.status}`}>
                    {selectedRecipe.status === "published"
                      ? "Publicada"
                      : "Em edição"}
                  </span>
                  <h2 id="recipe-details-title">{selectedRecipe.name}</h2>
                  <p id="recipe-details-description">
                    Esta é a receita-base. O nome da cliente aparece somente na
                    encomenda preparada a partir dela.
                  </p>
                </div>
                <div className="recipe-version-stamp">
                  {selectedRecipe.status === "published" ? (
                    <History aria-hidden="true" />
                  ) : (
                    <FilePenLine aria-hidden="true" />
                  )}
                  <span>
                    <small>
                      {selectedRecipe.status === "published"
                        ? "Versão atual"
                        : "Estado atual"}
                    </small>
                    <strong>
                      {selectedRecipe.status === "published"
                        ? selectedRecipe.versionNumber
                        : "Em edição"}
                    </strong>
                  </span>
                </div>
              </header>

              <div className="recipe-details-facts">
                <span>
                  <Scale aria-hidden="true" />
                  <small>Rendimento</small>
                  <strong>{number.format(selectedRecipe.yieldMassG)} g</strong>
                </span>
                <span>
                  <Coins aria-hidden="true" />
                  <small>Custo conhecido</small>
                  <strong>
                    {currency.format(selectedRecipe.estimatedCost)}
                  </strong>
                </span>
                <span>
                  <Clock3 aria-hidden="true" />
                  <small>Tempo total</small>
                  <strong>
                    {formatDuration(selectedRecipe.durationMinutes)}
                  </strong>
                </span>
              </div>

              {selectedRecipe.source ? (
                <aside className="recipe-source-note">
                  <Link2 aria-hidden="true" />
                  <div>
                    <small>
                      Fonte desta{" "}
                      {selectedRecipe.status === "published"
                        ? "versão"
                        : "edição"}
                    </small>
                    <strong>
                      {selectedRecipe.source.author
                        ? `${selectedRecipe.source.author} · `
                        : ""}
                      {selectedRecipe.source.name}
                    </strong>
                    <a
                      href={selectedRecipe.source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir receita original
                    </a>
                  </div>
                </aside>
              ) : null}

              <section
                className="recipe-simulator"
                aria-labelledby="recipe-simulator-title"
              >
                <div className="recipe-simulator-head">
                  <div>
                    <p className="eyebrow">Simular sem alterar a receita</p>
                    <h3 id="recipe-simulator-title">
                      Quanto você quer preparar?
                    </h3>
                    <p>
                      Ajustamos rendimento, ingredientes e custo na mesma
                      proporção. A versão publicada permanece intacta.
                    </p>
                  </div>
                  <Calculator aria-hidden="true" />
                </div>

                <div className="recipe-simulator-grid">
                  <div className="form-field recipe-simulator-input">
                    <label htmlFor="recipe-simulation-mass">
                      Rendimento desejado em gramas
                    </label>
                    <NumberField
                      id="recipe-simulation-mass"
                      name="recipeSimulationMass"
                      value={simulationMassG}
                      onValueChange={setSimulationMassG}
                      min={1}
                      step={50}
                      validationStep={1}
                      integerOnly
                    />
                  </div>
                  <div className="recipe-simulator-result">
                    <span>
                      <small>Fator da receita</small>
                      <strong>
                        {preciseNumber.format(simulation?.factor ?? 0)}×
                      </strong>
                    </span>
                    <span>
                      <small>Custo estimado</small>
                      <strong>
                        {currency.format(simulation?.estimatedCost ?? 0)}
                      </strong>
                    </span>
                    <span>
                      <small>Rendimento aproximado</small>
                      <strong>
                        {simulation?.estimatedUnits !== null
                          ? `${preciseNumber.format(simulation?.estimatedUnits ?? 0)} porções`
                          : `${number.format(Number(simulationMassG) || 0)} g`}
                      </strong>
                    </span>
                  </div>
                </div>

                <section
                  className="recipe-simulator-lines"
                  aria-labelledby="recipe-simulator-lines-title"
                >
                  <h4 id="recipe-simulator-lines-title">
                    Ingredientes para este rendimento
                  </h4>
                  <ul aria-labelledby="recipe-simulator-lines-title">
                    {simulation?.ingredients.map((ingredient) => (
                      <li
                        key={`simulation-${ingredient.ingredientGroupId}-${ingredient.recipeStepRef}`}
                      >
                        <small>{ingredient.ingredientName}</small>
                        <strong>
                          {preciseNumber.format(ingredient.quantityG)} g
                        </strong>
                      </li>
                    ))}
                    {simulation?.subrecipes.map((subrecipe) => (
                      <li
                        key={`simulation-subrecipe-${subrecipe.referencedRecipeVersionId}`}
                      >
                        <small>{subrecipe.recipeName}</small>
                        <strong>
                          {preciseNumber.format(subrecipe.requiredYieldG)} g
                        </strong>
                      </li>
                    ))}
                  </ul>
                </section>
              </section>

              <CollapsibleDetails
                className="recipe-detail-section recipe-detail-collapsible"
                initialOpen
                key={`${selectedRecipe.versionId}-ingredients`}
              >
                <RecipeSectionSummary
                  title="O que entra"
                  meta={`${selectedRecipe.ingredientCount} ingredientes · ${number.format(
                    selectedRecipe.ingredients.reduce(
                      (total, ingredient) => total + ingredient.quantityG,
                      0,
                    ),
                  )} g informados`}
                />
                <div className="recipe-detail-section-body recipe-detail-ingredients">
                  {selectedRecipe.ingredients.map((ingredient) => (
                    <article
                      key={`${ingredient.ingredientGroupId}-${ingredient.recipeStepRef}`}
                    >
                      <div>
                        <small>{ingredient.category}</small>
                        <h4>{ingredient.ingredientName}</h4>
                        <p>
                          {ingredient.preferredCommercialItemName
                            ? `${ingredient.selectionPolicy === "required" ? "Obrigatório" : "Preferencial"}: ${ingredient.preferredCommercialItemName}`
                            : "Qualquer produto comprado disponível"}
                        </p>
                        <p className="recipe-ingredient-usage">
                          {ingredient.usageMomentName &&
                          ingredient.usageStepName
                            ? `Entra em ${ingredient.usageMomentName} · ${ingredient.usageStepName}`
                            : "Etapa de uso ainda não definida"}
                        </p>
                        {ingredient.notes ? (
                          <p className="recipe-ingredient-notes">
                            Especificação: {ingredient.notes}
                          </p>
                        ) : null}
                        {ingredient.inputUnit !== "g" ? (
                          <p className="recipe-conversion-note">
                            Anotado como{" "}
                            {preciseNumber.format(ingredient.inputQuantity)}{" "}
                            {ingredient.inputUnit === "unit"
                              ? "un."
                              : ingredient.inputUnit}
                            {ingredient.conversionSource
                              ? ` · fonte: ${ingredient.conversionSource}`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      <strong>{number.format(ingredient.quantityG)} g</strong>
                    </article>
                  ))}
                </div>
              </CollapsibleDetails>

              {selectedRecipe.subrecipes.length > 0 ? (
                <details
                  className="recipe-detail-section recipe-detail-collapsible"
                  key={`${selectedRecipe.versionId}-subrecipes`}
                >
                  <RecipeSectionSummary
                    title="Preparos reutilizados"
                    meta={`${selectedRecipe.subrecipes.length} ${
                      selectedRecipe.subrecipes.length === 1
                        ? "sub-receita"
                        : "sub-receitas"
                    } · ${number.format(
                      selectedRecipe.subrecipes.reduce(
                        (total, subrecipe) => total + subrecipe.requiredYieldG,
                        0,
                      ),
                    )} g`}
                  />
                  <div className="recipe-detail-section-body recipe-detail-subrecipes">
                    {selectedRecipe.subrecipes.map((subrecipe) => (
                      <article
                        key={`${subrecipe.referencedRecipeVersionId}-${subrecipe.recipeMomentRef}`}
                      >
                        <div>
                          <small>
                            {subrecipe.recipeMomentName
                              ? `Entra em ${subrecipe.recipeMomentName}`
                              : "Momento não encontrado"}
                          </small>
                          <h4>{subrecipe.recipeName}</h4>
                          <p>
                            Versão {subrecipe.versionNumber}
                            {subrecipe.notes ? ` · ${subrecipe.notes}` : ""}
                          </p>
                        </div>
                        <span>
                          <strong>
                            {number.format(subrecipe.requiredYieldG)} g
                          </strong>
                          <small>
                            {currency.format(subrecipe.estimatedCost)}
                          </small>
                        </span>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}

              <details
                className="recipe-detail-section recipe-detail-collapsible"
                key={`${selectedRecipe.versionId}-moments`}
              >
                <RecipeSectionSummary
                  title="Momentos e etapas"
                  meta={`${selectedRecipe.moments.length} momentos · ${selectedRecipe.moments.reduce(
                    (total, moment) => total + moment.steps.length,
                    0,
                  )} etapas · ${formatDuration(selectedRecipe.durationMinutes)}`}
                />
                <div className="recipe-detail-section-body">
                  {selectedRecipe.source ? (
                    <p className="recipe-import-origin-summary">
                      Etapas reconhecidas automaticamente na fonte{" "}
                      {selectedRecipe.source.name}.
                    </p>
                  ) : null}
                  <ol className="recipe-detail-moments">
                    {selectedRecipe.moments.map((moment, momentIndex) => (
                      <li key={`${moment.name}-${momentIndex}`}>
                        <span>{momentIndex + 1}</span>
                        <CollapsibleDetails
                          className="recipe-detail-moment"
                          initialOpen={momentIndex === 0}
                        >
                          <summary>
                            <span className="recipe-moment-title">
                              <strong>{moment.name}</strong>
                              <small>
                                {moment.preparationRole === "intermediate"
                                  ? "Preparação intermediária"
                                  : "Produto final"}
                              </small>
                            </span>
                            <span className="recipe-moment-summary-meta">
                              {moment.steps.length}{" "}
                              {moment.steps.length === 1 ? "etapa" : "etapas"} ·{" "}
                              {formatDuration(
                                moment.steps.reduce(
                                  (total, step) => total + step.durationMinutes,
                                  0,
                                ),
                              )}
                            </span>
                            <ChevronDown aria-hidden="true" />
                          </summary>
                          <div className="recipe-detail-moment-body">
                            {moment.description &&
                            !isAutomaticImportMessage(moment.description) ? (
                              <p>{moment.description}</p>
                            ) : null}
                            <ul>
                              {moment.steps.map((step, stepIndex) => (
                                <li key={`${step.name}-${stepIndex}`}>
                                  <div>
                                    <strong>{step.name}</strong>
                                    <p>{step.instructions}</p>
                                    {step.requiredEquipmentKind ? (
                                      <span className="recipe-equipment-note">
                                        Reserva:{" "}
                                        {
                                          equipmentKinds.find(
                                            (option) =>
                                              option.value ===
                                              step.requiredEquipmentKind,
                                          )?.label
                                        }
                                      </span>
                                    ) : null}
                                    {step.predecessorStepRefs.length > 0 ? (
                                      <span className="recipe-dependency-note">
                                        Libera após{" "}
                                        {step.predecessorStepRefs.length}{" "}
                                        {step.predecessorStepRefs.length === 1
                                          ? "etapa"
                                          : "etapas"}
                                      </span>
                                    ) : null}
                                  </div>
                                  <small>
                                    {formatDuration(step.durationMinutes)}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CollapsibleDetails>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>

              <footer className="recipe-details-actions">
                <p>
                  {selectedRecipe.status === "published"
                    ? "A versão atual permanece nos pedidos já criados."
                    : "Esta edição ainda não está disponível para novos pedidos."}
                </p>
                <div>
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => detailsDialogRef.current?.close()}
                  >
                    Fechar
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => openRecipeEditor(selectedRecipe)}
                  >
                    <FilePenLine aria-hidden="true" />
                    {selectedRecipe.status === "draft"
                      ? "Continuar edição"
                      : "Criar nova edição"}
                  </button>
                </div>
              </footer>
            </div>
          </section>
        ) : null}
      </dialog>

      <dialog
        className="purchase-dialog recipe-dialog"
        ref={dialogRef}
        aria-labelledby="recipe-dialog-title"
        aria-describedby="recipe-dialog-description"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <section
          className="purchase-panel recipe-panel rounded-scroll-shell"
          id="recipe-panel"
        >
          <ModalGlassHeader
            title={
              editorMode === "create"
                ? "Nova receita"
                : editorMode === "new-version"
                  ? `Nova edição de ${name}`
                  : `Editando ${name}`
            }
            eyebrow="Caderno de receitas"
            closeLabel="Fechar cadastro de receita"
            onClose={() => dialogRef.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <div className="purchase-panel-head recipe-panel-head">
              <div>
                <p className="eyebrow">
                  {editorMode === "create"
                    ? "Nova receita"
                    : editorMode === "new-version"
                      ? `Nova edição de ${name}`
                      : `Editando ${name}`}
                </p>
                <h2 id="recipe-dialog-title">
                  {editorMode === "create"
                    ? "Vamos guardar o seu jeito de fazer."
                    : editorMode === "new-version"
                      ? "O que ficou ainda melhor neste preparo?"
                      : "Continue de onde você parou."}
                </h2>
              </div>
              <p id="recipe-dialog-description">
                {editorMode === "new-version"
                  ? "Partimos da versão publicada. Esta edição só passa a valer para novos pedidos quando você publicar."
                  : "Comece pelo que rende. Depois liste o que entra e os momentos do preparo."}
              </p>
            </div>

            <form
              className="purchase-form recipe-form"
              action={formAction}
              onSubmit={preparePayload}
              onInvalid={revealInvalidField}
            >
              <input
                ref={payloadRef}
                type="hidden"
                name="recipePayload"
                defaultValue="{}"
              />
              <input type="hidden" name="recipeOperation" value={editorMode} />
              <input type="hidden" name="recipeId" value={editingRecipeId} />

              <CollapsibleDetails
                className="recipe-editor-section"
                initialOpen
                key={`${moments[0]?.id ?? "empty"}-basics`}
              >
                <RecipeSectionSummary
                  index={1}
                  title="Essência da receita"
                  meta={`${name.trim() || "Sem nome"} · ${number.format(
                    Number(yieldMassG) || 0,
                  )} g${yieldUnits ? ` · ${yieldUnits} porções` : ""}`}
                />
                <fieldset>
                  <legend className="sr-only">Essência da receita</legend>
                  <div className="form-grid recipe-basics-grid">
                    <div className="form-field form-field-wide">
                      <label htmlFor="recipe-name">
                        Como você chama esta receita?
                      </label>
                      <input
                        id="recipe-name"
                        value={name}
                        required
                        readOnly={editorMode === "new-version"}
                        placeholder="Ex.: Bolo de chocolate"
                        onChange={(event) => setName(event.target.value)}
                      />
                      <small>
                        {editorMode === "new-version"
                          ? "O nome identifica a receita-base; a nova edição atualiza rendimento, composição e preparo."
                          : "Use o nome do produto. Cliente e ocasião pertencem à encomenda."}
                      </small>
                    </div>
                    <div className="form-field">
                      <label htmlFor="recipe-yield">Rendimento total</label>
                      <NumberField
                        id="recipe-yield"
                        name="yieldMassG"
                        value={yieldMassG}
                        onValueChange={setYieldMassG}
                        min={1}
                        step={1}
                        integerOnly
                        required
                      />
                      <small>
                        Todos os ingredientes comestíveis serão proporcionais a
                        este peso.
                      </small>
                    </div>
                    <div className="form-field">
                      <label htmlFor="recipe-portions">
                        Porções ou unidades
                      </label>
                      <NumberField
                        id="recipe-portions"
                        name="yieldUnits"
                        value={yieldUnits}
                        onValueChange={setYieldUnits}
                        min={1}
                        step={1}
                      />
                      <small>
                        Opcional, mas útil para fracionar encomendas.
                      </small>
                    </div>
                    <div className="form-field">
                      <label htmlFor="recipe-loss">Perda prevista (%)</label>
                      <NumberField
                        id="recipe-loss"
                        name="expectedLossPercentage"
                        value={expectedLossPercentage}
                        onValueChange={setExpectedLossPercentage}
                        min={0}
                        max={100}
                        step={0.5}
                      />
                    </div>
                  </div>
                </fieldset>
              </CollapsibleDetails>

              <details className="recipe-editor-section">
                <RecipeSectionSummary
                  index={2}
                  title="O que entra"
                  meta={`${ingredients.length} ${
                    ingredients.length === 1 ? "ingrediente" : "ingredientes"
                  } · ${number.format(previewIngredientMass)} g informados`}
                />
                <fieldset>
                  <legend className="sr-only">O que entra</legend>
                  <p className="fieldset-intro">
                    A receita pede o ingrediente. Marca é uma preferência, nunca
                    outro ingrediente.
                  </p>
                  <div className="ingredient-editor">
                    {ingredients.map((ingredient, index) => {
                      const group = workspace.catalog.find(
                        (entry) => entry.id === ingredient.ingredientGroupId,
                      );
                      const itemOptions: ComboboxOption[] = (
                        group?.items ?? []
                      ).map((item) => ({
                        value: item.id,
                        label: item.displayName,
                        keywords: `${item.displayName} ${item.brandName ?? ""}`,
                      }));
                      return (
                        <article className="ingredient-row" key={ingredient.id}>
                          <div className="dynamic-row-head">
                            <span>
                              <GripVertical aria-hidden="true" /> Ingrediente{" "}
                              {index + 1}
                            </span>
                            {ingredients.length > 1 ? (
                              <button
                                type="button"
                                className="icon-quiet"
                                aria-label={`Remover ingrediente ${index + 1}`}
                                onClick={() =>
                                  setIngredients((current) =>
                                    current.filter(
                                      (entry) => entry.id !== ingredient.id,
                                    ),
                                  )
                                }
                              >
                                <Trash2 aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                          <div className="ingredient-grid">
                            <div className="form-field form-field-wide">
                              <label
                                htmlFor={`ingredient-group-${ingredient.id}`}
                              >
                                Ingrediente culinário
                              </label>
                              <SearchableCombobox
                                id={`ingredient-group-${ingredient.id}`}
                                name={`ingredient-group-${ingredient.id}`}
                                options={groupOptions}
                                value={ingredient.ingredientGroupId}
                                onValueChange={(value) =>
                                  updateIngredient(ingredient.id, {
                                    ingredientGroupId: value,
                                    preferredCommercialItemId: "",
                                  })
                                }
                                required
                              />
                            </div>
                            <div className="form-field">
                              <label
                                htmlFor={`ingredient-quantity-${ingredient.id}`}
                              >
                                Quantidade informada
                              </label>
                              <NumberField
                                id={`ingredient-quantity-${ingredient.id}`}
                                name={`ingredient-quantity-${ingredient.id}`}
                                value={ingredient.inputQuantity}
                                onValueChange={(value) =>
                                  updateIngredient(ingredient.id, {
                                    inputQuantity: value,
                                  })
                                }
                                min={0.001}
                                step={ingredient.inputUnit === "kg" ? 0.1 : 1}
                                validationStep="any"
                                required
                              />
                            </div>
                            <div className="form-field">
                              <label
                                htmlFor={`ingredient-unit-${ingredient.id}`}
                              >
                                Unidade da anotação
                              </label>
                              <SearchableCombobox
                                id={`ingredient-unit-${ingredient.id}`}
                                name={`ingredient-unit-${ingredient.id}`}
                                options={measurementUnits}
                                value={ingredient.inputUnit}
                                onValueChange={(value) => {
                                  const unit = value as MeasurementUnit;
                                  const standard =
                                    standardConversionFactor(unit);
                                  updateIngredient(ingredient.id, {
                                    inputUnit: unit,
                                    conversionFactorToG:
                                      standard === null ? "" : String(standard),
                                    conversionSource: "",
                                    conversionConfidence: "provided",
                                  });
                                }}
                                required
                              />
                            </div>
                            <div className="form-field">
                              <label
                                htmlFor={`ingredient-waste-${ingredient.id}`}
                              >
                                Perda desta linha (%)
                              </label>
                              <NumberField
                                id={`ingredient-waste-${ingredient.id}`}
                                name={`ingredient-waste-${ingredient.id}`}
                                value={ingredient.wastePercentage}
                                onValueChange={(value) =>
                                  updateIngredient(ingredient.id, {
                                    wastePercentage: value,
                                  })
                                }
                                min={0}
                                max={100}
                                step={0.5}
                              />
                            </div>
                          </div>
                          <div className="form-field ingredient-notes-field">
                            <label
                              htmlFor={`ingredient-notes-${ingredient.id}`}
                            >
                              Especificação nesta receita{" "}
                              <small>opcional</small>
                            </label>
                            <input
                              id={`ingredient-notes-${ingredient.id}`}
                              value={ingredient.notes}
                              maxLength={500}
                              aria-describedby={`ingredient-notes-help-${ingredient.id}`}
                              placeholder="Ex.: para bater chantilly, com 35% de gordura"
                              onChange={(event) =>
                                updateIngredient(ingredient.id, {
                                  notes: event.target.value,
                                })
                              }
                            />
                            <small
                              id={`ingredient-notes-help-${ingredient.id}`}
                            >
                              Teor, variedade ou forma de uso ficam aqui sem
                              criar outro ingrediente culinário.
                            </small>
                          </div>
                          {ingredient.inputUnit === "ml" ||
                          ingredient.inputUnit === "unit" ? (
                            <div className="recipe-conversion-box">
                              <div className="form-field">
                                <label
                                  htmlFor={`ingredient-factor-${ingredient.id}`}
                                >
                                  {ingredient.inputUnit === "ml"
                                    ? "Densidade (g por ml)"
                                    : "Peso líquido por unidade (g)"}
                                </label>
                                <NumberField
                                  id={`ingredient-factor-${ingredient.id}`}
                                  name={`ingredient-factor-${ingredient.id}`}
                                  value={ingredient.conversionFactorToG}
                                  onValueChange={(value) =>
                                    updateIngredient(ingredient.id, {
                                      conversionFactorToG: value,
                                    })
                                  }
                                  min={0.001}
                                  step={0.01}
                                  validationStep="any"
                                  required
                                />
                              </div>
                              <div className="form-field form-field-wide">
                                <label
                                  htmlFor={`ingredient-source-${ingredient.id}`}
                                >
                                  De onde veio a conversão?
                                </label>
                                <input
                                  id={`ingredient-source-${ingredient.id}`}
                                  value={ingredient.conversionSource}
                                  onChange={(event) =>
                                    updateIngredient(ingredient.id, {
                                      conversionSource: event.target.value,
                                    })
                                  }
                                  placeholder="Ex.: rótulo do fabricante ou pesagem própria"
                                  required
                                />
                              </div>
                              <p>
                                Esta anotação equivale a{" "}
                                <strong>
                                  {preciseNumber.format(
                                    convertedIngredientMass(ingredient),
                                  )}{" "}
                                  g
                                </strong>
                                . A fonte ficará visível na ficha.
                              </p>
                            </div>
                          ) : null}
                          <div className="form-field ingredient-usage-field">
                            <label htmlFor={`ingredient-step-${ingredient.id}`}>
                              Em qual etapa este ingrediente entra?
                            </label>
                            <SearchableCombobox
                              key={`${ingredient.id}-${ingredient.recipeStepRef}-${stepOptions.find((option) => option.value === ingredient.recipeStepRef)?.label ?? "unassigned"}`}
                              id={`ingredient-step-${ingredient.id}`}
                              name={`ingredient-step-${ingredient.id}`}
                              options={stepOptions}
                              value={ingredient.recipeStepRef}
                              onValueChange={(value) =>
                                updateIngredient(ingredient.id, {
                                  recipeStepRef: value,
                                })
                              }
                              placeholder="Busque o momento ou a etapa"
                              emptyMessage="Crie e nomeie uma etapa para continuar."
                              required
                            />
                            <small>
                              Somente as {stepOptions.length} etapas desta
                              edição de “{name.trim() || "Nova receita"}”
                              aparecem aqui. Se o mesmo insumo entrar em duas
                              delas, crie duas linhas com as respectivas
                              quantidades.
                            </small>
                          </div>
                          <div
                            className="selection-policy"
                            role="group"
                            aria-label={`Regra de escolha do ingrediente ${index + 1}`}
                          >
                            {(
                              [
                                ["generic", "Qualquer marca"],
                                ["preferred", "Preferencial"],
                                ["required", "Obrigatória"],
                              ] as const
                            ).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={
                                  ingredient.selectionPolicy === value
                                }
                                onClick={() =>
                                  updateIngredient(ingredient.id, {
                                    selectionPolicy: value,
                                    preferredCommercialItemId:
                                      value === "generic"
                                        ? ""
                                        : ingredient.preferredCommercialItemId,
                                  })
                                }
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {ingredient.selectionPolicy !== "generic" ? (
                            <div className="form-field preferred-item-field">
                              <label
                                htmlFor={`preferred-item-${ingredient.id}`}
                              >
                                Produto comprado{" "}
                                {ingredient.selectionPolicy === "required"
                                  ? "obrigatória"
                                  : "preferida"}
                              </label>
                              <SearchableCombobox
                                id={`preferred-item-${ingredient.id}`}
                                name={`preferred-item-${ingredient.id}`}
                                options={itemOptions}
                                value={ingredient.preferredCommercialItemId}
                                onValueChange={(value) =>
                                  updateIngredient(ingredient.id, {
                                    preferredCommercialItemId: value,
                                  })
                                }
                                placeholder="Busque a marca ou o produto"
                                required
                              />
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  <button
                    className="quiet-action add-row-action"
                    type="button"
                    onClick={() =>
                      setIngredients((current) => [
                        ...current,
                        {
                          id: freshId("ingredient"),
                          ingredientGroupId: workspace.catalog[0]?.id ?? "",
                          recipeStepRef: stepOptions[0]?.value ?? "",
                          inputQuantity: "100",
                          inputUnit: "g",
                          conversionFactorToG: "1",
                          conversionSource: "",
                          conversionConfidence: "provided",
                          notes: "",
                          selectionPolicy: "generic",
                          preferredCommercialItemId: "",
                          wastePercentage: "0",
                        },
                      ])
                    }
                  >
                    <Plus aria-hidden="true" />
                    Adicionar ingrediente
                  </button>
                </fieldset>
              </details>

              <details className="recipe-editor-section">
                <RecipeSectionSummary
                  index={3}
                  title="Momentos e etapas"
                  meta={`${moments.length} ${
                    moments.length === 1 ? "momento" : "momentos"
                  } · ${previewStepCount} ${
                    previewStepCount === 1 ? "etapa" : "etapas"
                  } · ${formatDuration(previewDuration)}`}
                />
                <fieldset>
                  <legend className="sr-only">Momentos e etapas</legend>
                  <p className="fieldset-intro">
                    Cada círculo do andamento nasce de um momento. Dentro dele
                    ficam as ações reais da cozinha.
                  </p>
                  <div className="moment-editor">
                    {moments.map((moment, momentIndex) => (
                      <CollapsibleDetails
                        className="moment-card moment-editor-collapsible"
                        initialOpen={momentIndex === 0}
                        key={moment.id}
                      >
                        <summary>
                          <span className="moment-editor-summary-title">
                            <i>{momentIndex + 1}</i>
                            <span>
                              <strong>
                                {moment.name.trim() ||
                                  `Momento ${momentIndex + 1}`}
                              </strong>
                              <small>
                                {moment.preparationRole === "intermediate"
                                  ? "Preparação intermediária"
                                  : "Produto final"}
                              </small>
                            </span>
                          </span>
                          <span className="moment-editor-summary-meta">
                            {moment.steps.length}{" "}
                            {moment.steps.length === 1 ? "etapa" : "etapas"} ·{" "}
                            {formatDuration(
                              moment.steps.reduce(
                                (total, step) =>
                                  total + (Number(step.durationMinutes) || 0),
                                0,
                              ),
                            )}
                          </span>
                          <ChevronDown aria-hidden="true" />
                        </summary>
                        <div className="moment-card-content">
                          {moments.length > 1 ? (
                            <div className="moment-card-actions">
                              <button
                                type="button"
                                className="quiet-action"
                                onClick={() => removeMoment(moment.id)}
                              >
                                <Trash2 aria-hidden="true" />
                                Remover momento
                              </button>
                            </div>
                          ) : null}
                          <div className="form-grid moment-name-grid">
                            <div className="form-field">
                              <label htmlFor={`moment-name-${moment.id}`}>
                                Nome do momento
                              </label>
                              <input
                                id={`moment-name-${moment.id}`}
                                value={moment.name}
                                required
                                placeholder="Ex.: Massa, Ganache, Montagem"
                                onChange={(event) =>
                                  updateMoment(moment.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="form-field">
                              <label htmlFor={`moment-role-${moment.id}`}>
                                Como ele participa?
                              </label>
                              <SearchableCombobox
                                id={`moment-role-${moment.id}`}
                                name={`moment-role-${moment.id}`}
                                options={preparationRoles}
                                value={moment.preparationRole}
                                onValueChange={(value) =>
                                  updateMoment(moment.id, {
                                    preparationRole: value as PreparationRole,
                                  })
                                }
                                required
                              />
                              <small className="field-help">
                                {moment.preparationRole === "intermediate"
                                  ? "Gera uma preparação deste pedido, como massa, recheio ou ganache."
                                  : "Continua a montagem, acabamento ou conferência do produto final."}
                              </small>
                            </div>
                            <div className="form-field form-field-wide moment-description-field">
                              <label
                                htmlFor={`moment-description-${moment.id}`}
                              >
                                Resultado deste momento
                              </label>
                              <TextAreaField
                                id={`moment-description-${moment.id}`}
                                value={moment.description}
                                maxLength={300}
                                placeholder="Ex.: massa assada pronta para esfriar e seguir para a montagem"
                                onValueChange={(value) =>
                                  updateMoment(moment.id, {
                                    description: value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div className="step-list">
                            {moment.steps.map((step, stepIndex) => (
                              <div className="step-row" key={step.id}>
                                <div className="step-row-label">
                                  Etapa {stepIndex + 1}
                                </div>
                                <div className="form-grid step-grid">
                                  <div className="form-field">
                                    <label htmlFor={`step-name-${step.id}`}>
                                      O que fazer
                                    </label>
                                    <input
                                      id={`step-name-${step.id}`}
                                      value={step.name}
                                      required
                                      placeholder="Ex.: Preparar a ganache"
                                      onChange={(event) =>
                                        updateStep(moment.id, step.id, {
                                          name: event.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="form-field">
                                    <label htmlFor={`step-kind-${step.id}`}>
                                      Tipo
                                    </label>
                                    <SearchableCombobox
                                      id={`step-kind-${step.id}`}
                                      name={`step-kind-${step.id}`}
                                      options={stepKinds}
                                      value={step.kind}
                                      onValueChange={(value) =>
                                        updateStep(moment.id, step.id, {
                                          kind: value as StepKind,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="form-field">
                                    <label htmlFor={`step-duration-${step.id}`}>
                                      Duração em minutos
                                    </label>
                                    <NumberField
                                      id={`step-duration-${step.id}`}
                                      name={`step-duration-${step.id}`}
                                      value={step.durationMinutes}
                                      onValueChange={(value) =>
                                        updateStep(moment.id, step.id, {
                                          durationMinutes: value,
                                        })
                                      }
                                      min={0}
                                      step={5}
                                      validationStep={1}
                                      required
                                    />
                                  </div>
                                  <div className="form-field form-field-wide">
                                    <label
                                      htmlFor={`step-equipment-${step.id}`}
                                    >
                                      Precisa reservar algum equipamento?
                                    </label>
                                    <SearchableCombobox
                                      id={`step-equipment-${step.id}`}
                                      name={`step-equipment-${step.id}`}
                                      options={equipmentKinds}
                                      value={step.requiredEquipmentKind}
                                      onValueChange={(value) =>
                                        updateStep(moment.id, step.id, {
                                          requiredEquipmentKind:
                                            value as EquipmentKind,
                                        })
                                      }
                                    />
                                    <small className="field-help">
                                      Escolha apenas quando esta etapa realmente
                                      ocupa o equipamento durante todo o tempo.
                                    </small>
                                  </div>
                                  <div className="form-field form-field-wide">
                                    <label
                                      htmlFor={`step-instructions-${step.id}`}
                                    >
                                      Como fazer
                                    </label>
                                    <TextAreaField
                                      id={`step-instructions-${step.id}`}
                                      value={step.instructions}
                                      required
                                      maxLength={2000}
                                      placeholder="Escreva a orientação que você gostaria de encontrar durante a produção."
                                      onValueChange={(value) =>
                                        updateStep(moment.id, step.id, {
                                          instructions: value,
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                                <details className="recipe-dependency-picker">
                                  <summary>
                                    Precedências
                                    <span>
                                      {step.predecessorStepRefs.length === 0
                                        ? "nenhuma"
                                        : `${step.predecessorStepRefs.length} selecionada${step.predecessorStepRefs.length > 1 ? "s" : ""}`}
                                    </span>
                                  </summary>
                                  <p>
                                    Marque o que precisa estar concluído antes
                                    desta etapa ficar disponível.
                                  </p>
                                  <div>
                                    {dependencyOptions
                                      .filter(
                                        (option) => option.value !== step.id,
                                      )
                                      .map((option) => (
                                        <label
                                          className="check-field"
                                          key={`${step.id}-${option.value}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={step.predecessorStepRefs.includes(
                                              option.value,
                                            )}
                                            onChange={(event) =>
                                              updateStep(moment.id, step.id, {
                                                predecessorStepRefs: event
                                                  .target.checked
                                                  ? [
                                                      ...step.predecessorStepRefs,
                                                      option.value,
                                                    ]
                                                  : step.predecessorStepRefs.filter(
                                                      (reference) =>
                                                        reference !==
                                                        option.value,
                                                    ),
                                              })
                                            }
                                          />
                                          <span>{option.label}</span>
                                        </label>
                                      ))}
                                  </div>
                                </details>
                                <div className="step-row-actions">
                                  <label className="check-field">
                                    <input
                                      type="checkbox"
                                      checked={step.parallelizable}
                                      onChange={(event) =>
                                        updateStep(moment.id, step.id, {
                                          parallelizable: event.target.checked,
                                        })
                                      }
                                    />
                                    <span>
                                      Pode acontecer junto com outra etapa
                                    </span>
                                  </label>
                                  {moment.steps.length > 1 ? (
                                    <button
                                      type="button"
                                      className="quiet-action"
                                      onClick={() =>
                                        removeStep(moment.id, step.id)
                                      }
                                    >
                                      Remover etapa
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            className="quiet-action add-step-action"
                            type="button"
                            onClick={() =>
                              updateMoment(moment.id, {
                                steps: [
                                  ...moment.steps,
                                  emptyStep(freshId("step")),
                                ],
                              })
                            }
                          >
                            <Plus aria-hidden="true" />
                            Adicionar etapa neste momento
                          </button>
                        </div>
                      </CollapsibleDetails>
                    ))}
                  </div>
                  <button
                    className="quiet-action add-row-action"
                    type="button"
                    onClick={() =>
                      setMoments((current) => [
                        ...current,
                        emptyMoment(freshId("moment"), freshId("step")),
                      ])
                    }
                  >
                    <Plus aria-hidden="true" />
                    Adicionar momento
                  </button>
                </fieldset>
              </details>

              <details className="recipe-editor-section">
                <RecipeSectionSummary
                  index={4}
                  title="Preparos que esta receita reutiliza"
                  meta={
                    subrecipes.length === 0
                      ? "Nenhum preparo reutilizado"
                      : `${subrecipes.length} ${
                          subrecipes.length === 1
                            ? "sub-receita"
                            : "sub-receitas"
                        } · ${number.format(previewSubrecipeMass)} g`
                  }
                />
                <fieldset>
                  <legend className="sr-only">
                    Preparos que esta receita reutiliza
                  </legend>
                  <p className="fieldset-intro">
                    Vincule uma receita já publicada, como ganache ou
                    massa-base. Ela mantém sua própria versão e aparece dentro
                    do momento escolhido.
                  </p>
                  {subrecipes.length > 0 ? (
                    <div className="subrecipe-editor">
                      {subrecipes.map((subrecipe, index) => (
                        <article className="subrecipe-row" key={subrecipe.id}>
                          <div className="dynamic-row-head">
                            <span>Sub-receita {index + 1}</span>
                            <button
                              className="icon-quiet"
                              type="button"
                              aria-label={`Remover sub-receita ${index + 1}`}
                              onClick={() =>
                                setSubrecipes((current) =>
                                  current.filter(
                                    (entry) => entry.id !== subrecipe.id,
                                  ),
                                )
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                          <div className="form-grid subrecipe-grid">
                            <div className="form-field form-field-wide">
                              <label
                                htmlFor={`subrecipe-version-${subrecipe.id}`}
                              >
                                Receita publicada
                              </label>
                              <SearchableCombobox
                                id={`subrecipe-version-${subrecipe.id}`}
                                name={`subrecipe-version-${subrecipe.id}`}
                                options={subrecipeOptions}
                                value={subrecipe.referencedRecipeVersionId}
                                onValueChange={(value) =>
                                  setSubrecipes((current) =>
                                    current.map((entry) =>
                                      entry.id === subrecipe.id
                                        ? {
                                            ...entry,
                                            referencedRecipeVersionId: value,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                placeholder="Busque uma receita-base"
                                emptyMessage="Publique outra receita antes de vinculá-la."
                                required
                              />
                            </div>
                            <div className="form-field">
                              <label
                                htmlFor={`subrecipe-yield-${subrecipe.id}`}
                              >
                                Quanto deste preparo (g)
                              </label>
                              <NumberField
                                id={`subrecipe-yield-${subrecipe.id}`}
                                name={`subrecipe-yield-${subrecipe.id}`}
                                value={subrecipe.requiredYieldG}
                                onValueChange={(value) =>
                                  setSubrecipes((current) =>
                                    current.map((entry) =>
                                      entry.id === subrecipe.id
                                        ? { ...entry, requiredYieldG: value }
                                        : entry,
                                    ),
                                  )
                                }
                                min={1}
                                step={10}
                                required
                              />
                            </div>
                            <div className="form-field">
                              <label
                                htmlFor={`subrecipe-moment-${subrecipe.id}`}
                              >
                                Em qual momento entra
                              </label>
                              <SearchableCombobox
                                id={`subrecipe-moment-${subrecipe.id}`}
                                name={`subrecipe-moment-${subrecipe.id}`}
                                options={momentOptions}
                                value={subrecipe.recipeMomentRef}
                                onValueChange={(value) =>
                                  setSubrecipes((current) =>
                                    current.map((entry) =>
                                      entry.id === subrecipe.id
                                        ? { ...entry, recipeMomentRef: value }
                                        : entry,
                                    ),
                                  )
                                }
                                required
                              />
                            </div>
                            <div className="form-field form-field-wide">
                              <label
                                htmlFor={`subrecipe-notes-${subrecipe.id}`}
                              >
                                Observação opcional
                              </label>
                              <input
                                id={`subrecipe-notes-${subrecipe.id}`}
                                value={subrecipe.notes}
                                onChange={(event) =>
                                  setSubrecipes((current) =>
                                    current.map((entry) =>
                                      entry.id === subrecipe.id
                                        ? {
                                            ...entry,
                                            notes: event.target.value,
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                placeholder="Ex.: preparar na véspera"
                              />
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="subrecipe-empty">
                      Esta receita ainda não reutiliza outro preparo.
                    </p>
                  )}
                  <button
                    className="quiet-action add-row-action"
                    type="button"
                    disabled={subrecipeOptions.length === 0}
                    onClick={() =>
                      setSubrecipes((current) => [
                        ...current,
                        {
                          id: freshId("subrecipe"),
                          referencedRecipeVersionId:
                            subrecipeOptions[0]?.value ?? "",
                          recipeMomentRef: momentOptions[0]?.value ?? "",
                          requiredYieldG: "300",
                          notes: "",
                        },
                      ])
                    }
                  >
                    <Plus aria-hidden="true" />
                    Adicionar sub-receita
                  </button>
                </fieldset>
              </details>

              <aside className="recipe-preview" aria-label="Prévia da receita">
                <span>
                  <Scale aria-hidden="true" />
                  <small>Rendimento</small>
                  <strong>{number.format(Number(yieldMassG) || 0)} g</strong>
                </span>
                <span>
                  <Coins aria-hidden="true" />
                  <small>Custo conhecido</small>
                  <strong>
                    {currency.format(previewCost + previewSubrecipeCost)}
                  </strong>
                </span>
                <span>
                  <Clock3 aria-hidden="true" />
                  <small>Tempo informado</small>
                  <strong>{formatDuration(previewDuration)}</strong>
                </span>
              </aside>

              <p
                className={`form-message ${actionState.status === "error" ? "is-error" : ""}`}
                aria-live="polite"
              >
                {actionState.status === "error" ? actionState.message : ""}
              </p>

              <div className="purchase-actions recipe-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                >
                  Cancelar
                </button>
                <div>
                  <button
                    className="button button-secondary"
                    type="submit"
                    value="draft"
                    disabled={pending}
                  >
                    {pending ? "Guardando…" : "Guardar edição"}
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    value="published"
                    disabled={pending}
                  >
                    <BookOpenCheck aria-hidden="true" />
                    {pending
                      ? "Publicando…"
                      : `Publicar como versão ${publicationVersionNumber}`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </dialog>

      <SystemNotifications
        notifications={notification}
        onDismiss={setDismissedNotification}
      />
    </section>
  );
}
