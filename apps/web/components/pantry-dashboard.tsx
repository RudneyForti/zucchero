"use client";

import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  PackagePlus,
  Search,
  ShoppingBasket,
  Sparkles,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  createCategoryAction,
  fiscalImportAction,
  mutateStockAction,
  type CategoryActionState,
  registerPurchaseAction,
  type PurchaseActionState,
  type StockActionState,
} from "@/app/despensa/actions";
import type { FiscalImportActionState } from "@/lib/fiscal-import";
import type { PantryItemView, PantryView } from "@/lib/pantry";
import { FiscalImportDialog } from "@/components/fiscal-import-dialog";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import { PageBackButton } from "@/components/page-back-button";
import { SystemNotifications } from "@/components/system-notifications";
import {
  DatePicker,
  NumberField,
  SearchableCombobox,
  TextAreaField,
  type ComboboxOption,
} from "@/components/form-controls";

type PantryDashboardProps = {
  initialPantry: PantryView;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const inventoryReasonOptions: ComboboxOption[] = [
  { value: "physical_count", label: "Contagem física" },
  { value: "opening_balance", label: "Saldo inicial conferido" },
  { value: "data_correction", label: "Correção de lançamento" },
];

const lossReasonOptions: ComboboxOption[] = [
  { value: "expired", label: "Validade vencida" },
  { value: "damaged", label: "Embalagem ou produto danificado" },
  { value: "quality", label: "Qualidade inadequada" },
  { value: "other", label: "Outro motivo" },
];

type SelectedLot = {
  lot: PantryItemView["lots"][number];
  itemName: string;
  baseUnit: string;
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`))
    .replace(" de ", " ")
    .replace(".", "");
}

function normalizeCategoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function PantryDashboard({ initialPantry }: PantryDashboardProps) {
  const purchaseDialogRef = useRef<HTMLDialogElement>(null);
  const categoryDialogRef = useRef<HTMLDialogElement>(null);
  const stockDialogRef = useRef<HTMLDialogElement>(null);
  const [selectedItem, setSelectedItem] = useState(
    initialPantry.groups[0]?.items[0]?.id ?? "__new__",
  );
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [selectedCategory, setSelectedCategory] = useState(
    initialPantry.categories[0]?.id ?? "",
  );
  const [categoryComboboxRevision, setCategoryComboboxRevision] = useState(0);
  const lastSelectedCategoryRef = useRef(initialPantry.categories[0]?.id ?? "");
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [quickCategoryKind, setQuickCategoryKind] = useState<
    "ingredient" | "packaging" | "operational"
  >("ingredient");
  const [categoryCreationContext, setCategoryCreationContext] = useState<
    "purchase" | "manager" | null
  >(null);
  const [categoryRequestKey, setCategoryRequestKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [categoryKind, setCategoryKind] = useState<
    "ingredient" | "packaging" | "operational"
  >("ingredient");
  const [purchasePackages, setPurchasePackages] = useState(1);
  const [selectedLot, setSelectedLot] = useState<SelectedLot | null>(null);
  const [stockMode, setStockMode] = useState<"inventory" | "loss">("inventory");
  const [inventoryReason, setInventoryReason] = useState("physical_count");
  const [lossReason, setLossReason] = useState("expired");
  const [stockCommandKey, setStockCommandKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [confirmingLoss, setConfirmingLoss] = useState(false);
  const [dismissedNotification, setDismissedNotification] = useState<
    number | null
  >(null);
  const initialState: PurchaseActionState = {
    status: "idle",
    message: "",
    pantry: initialPantry,
    candidates: [],
    notificationId: null,
  };
  const [actionState, formAction, pending] = useActionState(
    registerPurchaseAction,
    initialState,
  );
  const initialCategoryState: CategoryActionState = {
    status: "idle",
    message: "",
    pantry: initialPantry,
    notificationId: null,
    createdCategoryId: null,
    requestKey: null,
  };
  const [categoryActionState, categoryFormAction, categoryPending] =
    useActionState(createCategoryAction, initialCategoryState);
  const initialStockState: StockActionState = {
    status: "idle",
    operation: null,
    message: "",
    pantry: initialPantry,
    notificationId: null,
    commandKey: null,
  };
  const [stockActionState, stockFormAction, stockPending] = useActionState(
    mutateStockAction,
    initialStockState,
  );
  const initialFiscalState: FiscalImportActionState = {
    status: "idle",
    message: "",
    document: null,
    pantry: initialPantry,
    notificationId: null,
  };
  const [fiscalActionState, fiscalFormAction, fiscalPending] = useActionState(
    fiscalImportAction,
    initialFiscalState,
  );

  useEffect(() => {
    if (
      actionState.status === "success" &&
      actionState.notificationId &&
      purchaseDialogRef.current?.open
    ) {
      purchaseDialogRef.current.close();
    }
  }, [actionState.notificationId, actionState.status]);
  useEffect(() => {
    if (categoryActionState.status !== "success") return;
    if (
      categoryCreationContext === "manager" &&
      categoryActionState.requestKey === categoryRequestKey &&
      categoryDialogRef.current?.open
    ) {
      categoryDialogRef.current.close();
    }
  }, [
    categoryActionState.notificationId,
    categoryActionState.requestKey,
    categoryActionState.status,
    categoryCreationContext,
    categoryRequestKey,
  ]);
  useEffect(() => {
    if (stockActionState.status !== "success") return;
    stockDialogRef.current?.close();
  }, [stockActionState.notificationId, stockActionState.status]);
  const pantry = [
    actionState,
    categoryActionState,
    stockActionState,
    fiscalActionState,
  ].toSorted(
    (left, right) => (right.notificationId ?? 0) - (left.notificationId ?? 0),
  )[0]!.pantry;
  const contextualCategoryId =
    categoryCreationContext === "purchase" &&
    categoryActionState.status === "success" &&
    categoryActionState.requestKey === categoryRequestKey
      ? categoryActionState.createdCategoryId
      : null;
  const effectiveSelectedCategory = contextualCategoryId ?? selectedCategory;
  const showQuickCategory = quickCategoryOpen && !contextualCategoryId;
  const categoryOptions: ComboboxOption[] = pantry.categories.map(
    (category) => ({
      value: category.id,
      label: category.name,
      keywords: `${category.name} ${category.kind}`,
    }),
  );
  const categoryFilterOptions: ComboboxOption[] = [
    { value: "__all__", label: "Todas as categorias" },
    ...categoryOptions,
  ];
  const similarCategories = useMemo(() => {
    const normalized = normalizeCategoryName(quickCategoryName);
    if (normalized.length < 2) return [];
    return pantry.categories
      .filter((category) => {
        const existing = normalizeCategoryName(category.name);
        return existing.includes(normalized) || normalized.includes(existing);
      })
      .slice(0, 3);
  }, [pantry.categories, quickCategoryName]);
  const commercialItems = pantry.groups.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupName: group.name })),
  );
  const commercialOptions: ComboboxOption[] = [
    ...commercialItems.map((item) => ({
      value: item.id,
      label: `${item.displayName} · ${item.groupName}`,
      keywords: `${item.displayName} ${item.groupName}`,
      kind: "default" as const,
    })),
    {
      value: "__new__",
      label: "Cadastrar novo produto comprado…",
      keywords: "novo produto comprado ingrediente apresentação",
      kind: "create",
    },
  ];
  const visibleCategories = useMemo(() => {
    const normalized = normalizeCategoryName(query);
    const categoryOrder = new Map(
      pantry.categories.map((category, index) => [category.id, index]),
    );
    const categoryNames = new Map(
      pantry.categories.map((category) => [category.id, category.name]),
    );
    const groupsByCategory = new Map<string, PantryView["groups"]>();

    for (const group of pantry.groups) {
      if (categoryFilter !== "__all__" && group.categoryId !== categoryFilter)
        continue;

      const categoryMatches = normalizeCategoryName(group.category).includes(
        normalized,
      );
      const groupMatches = normalizeCategoryName(group.name).includes(
        normalized,
      );
      const itemMatches = group.items.some((item) =>
        normalizeCategoryName(
          `${item.displayName} ${item.brandName ?? ""} ${item.packageLabel}`,
        ).includes(normalized),
      );

      if (normalized && !categoryMatches && !groupMatches && !itemMatches)
        continue;

      const categoryGroups = groupsByCategory.get(group.categoryId) ?? [];
      categoryGroups.push(group);
      groupsByCategory.set(group.categoryId, categoryGroups);
    }

    return [...groupsByCategory.entries()]
      .map(([id, groups]) => ({
        id,
        name: categoryNames.get(id) ?? groups[0]?.category ?? "Sem categoria",
        groups,
        itemCount: groups.reduce(
          (total, group) => total + group.items.length,
          0,
        ),
        lotCount: groups.reduce(
          (total, group) =>
            total +
            group.items.reduce(
              (itemTotal, item) => itemTotal + item.lotCount,
              0,
            ),
          0,
        ),
        attentionCount: groups.filter((group) => group.status !== "ok").length,
      }))
      .sort(
        (left, right) =>
          (categoryOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (categoryOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [categoryFilter, pantry.categories, pantry.groups, query]);
  const latestNotification = [
    actionState,
    categoryActionState,
    stockActionState,
    fiscalActionState,
  ].toSorted(
    (left, right) => (right.notificationId ?? 0) - (left.notificationId ?? 0),
  )[0]!;
  const notification =
    latestNotification.status === "success" &&
    latestNotification.notificationId &&
    latestNotification.notificationId !== dismissedNotification
      ? [
          {
            id: latestNotification.notificationId,
            message: latestNotification.message,
          },
        ]
      : [];

  function openPurchaseDialog(itemId?: string, packages = 1) {
    if (itemId) setSelectedItem(itemId);
    setPurchasePackages(packages);
    purchaseDialogRef.current?.showModal();
  }

  function changeSelectedCategory(value: string) {
    if (effectiveSelectedCategory)
      lastSelectedCategoryRef.current = effectiveSelectedCategory;
    if (value) lastSelectedCategoryRef.current = value;
    setCategoryCreationContext(null);
    setSelectedCategory(value);
  }

  function beginQuickCategory(name: string) {
    setCategoryCreationContext(null);
    setCategoryRequestKey(crypto.randomUUID());
    setQuickCategoryName(name);
    setQuickCategoryKind("ingredient");
    setQuickCategoryOpen(true);
  }

  function cancelQuickCategory() {
    setSelectedCategory(lastSelectedCategoryRef.current);
    setCategoryComboboxRevision((current) => current + 1);
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    setCategoryCreationContext(null);
  }

  function chooseSimilarCategory(categoryId: string) {
    lastSelectedCategoryRef.current = categoryId;
    setSelectedCategory(categoryId);
    setCategoryComboboxRevision((current) => current + 1);
    setQuickCategoryOpen(false);
    setQuickCategoryName("");
    setCategoryCreationContext(null);
  }

  function closePurchaseDialog() {
    purchaseDialogRef.current?.close();
  }

  function openStockDialog(
    lot: PantryItemView["lots"][number],
    itemName: string,
    baseUnit: string,
    mode: "inventory" | "loss",
  ) {
    setSelectedLot({ lot, itemName, baseUnit });
    setStockMode(mode);
    setStockCommandKey(crypto.randomUUID());
    setConfirmingLoss(false);
    stockDialogRef.current?.showModal();
  }

  return (
    <section className="view pantry-view" aria-labelledby="pantry-title">
      <PageBackButton />
      <header className="page-head pantry-page-head">
        <div>
          <p className="eyebrow">Despensa</p>
          <h1 id="pantry-title">O que já está à mão.</h1>
          <p className="lead">
            Cada compra vira um lote. A receita continua pedindo o ingrediente,
            sem ficar presa à marca.
          </p>
        </div>
        <div className="pantry-page-actions">
          <FiscalImportDialog
            state={fiscalActionState}
            action={fiscalFormAction}
            pending={fiscalPending}
          />
          <button
            className="button button-primary"
            type="button"
            aria-haspopup="dialog"
            aria-controls="purchase-panel"
            onClick={() => openPurchaseDialog()}
          >
            <PackagePlus aria-hidden="true" />
            Adicionar compra
          </button>
        </div>
      </header>

      <div className="pantry-glance" aria-label="Resumo da despensa">
        <span>
          <strong>{pantry.summary.groupCount}</strong> ingredientes da receita
        </span>
        <span>
          <strong>{pantry.summary.itemCount}</strong> produtos comprados
        </span>
        <span>
          <strong>{pantry.summary.openLotCount}</strong> lotes abertos
        </span>
        <span>
          <strong>{currency.format(pantry.summary.inventoryValue)}</strong> em
          estoque conhecido
        </span>
      </div>

      <dialog
        className="purchase-dialog"
        ref={purchaseDialogRef}
        aria-labelledby="purchase-title"
        aria-describedby="purchase-description"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePurchaseDialog();
        }}
      >
        <section
          className="purchase-panel rounded-scroll-shell"
          id="purchase-panel"
        >
          <ModalGlassHeader
            title="Entrada na despensa"
            eyebrow="Nova compra"
            closeLabel="Fechar entrada de compra"
            onClose={closePurchaseDialog}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <div className="purchase-panel-head">
              <div>
                <p className="eyebrow">Entrada manual</p>
                <h2 id="purchase-title">O que chegou hoje?</h2>
              </div>
              <p id="purchase-description">
                Primeiro reconhecemos o produto. Depois registramos somente o
                novo lote.
              </p>
            </div>

            <form action={formAction} className="purchase-form">
              <fieldset>
                <legend>
                  <span>1</span> Produto comprado
                </legend>
                <label htmlFor="commercial-item">
                  Qual produto você comprou?
                </label>
                <SearchableCombobox
                  id="commercial-item"
                  name="commercialItemId"
                  options={commercialOptions}
                  value={selectedItem}
                  onValueChange={setSelectedItem}
                  placeholder="Busque pelo produto, ingrediente ou marca"
                  emptyMessage="Nenhum produto encontrado. Você pode cadastrar um novo produto comprado."
                  required
                  autoFocus
                />
                <small>
                  Marca e embalagem identificam o produto comprado; a receita
                  usa o ingrediente.
                </small>

                {selectedItem === "__new__" ? (
                  <div className="new-item-fields">
                    <div className="form-field">
                      <label htmlFor="group-name">Ingrediente da receita</label>
                      <input
                        id="group-name"
                        name="groupName"
                        placeholder="Ex.: Chocolate meio amargo"
                        required
                      />
                      <small>
                        Como esse produto aparece nas suas receitas?
                      </small>
                    </div>
                    <div className="form-field">
                      <label htmlFor="category">Categoria</label>
                      <SearchableCombobox
                        key={`${effectiveSelectedCategory}-${pantry.categories.length}-${categoryComboboxRevision}`}
                        id="category"
                        name="categoryId"
                        options={categoryOptions}
                        value={effectiveSelectedCategory}
                        onValueChange={changeSelectedCategory}
                        onCreateOption={beginQuickCategory}
                        createOptionLabel="Criar categoria"
                        placeholder="Busque uma categoria"
                        required
                      />
                      <small>
                        Uma família ampla, como Chocolates e cacaus — não a
                        marca ou o ingrediente exato.
                      </small>
                      {showQuickCategory ? (
                        <section
                          className="category-quick-create"
                          aria-labelledby="quick-category-title"
                        >
                          <div className="category-quick-create-head">
                            <div>
                              <span>Nova família</span>
                              <h3 id="quick-category-title">
                                Criar sem sair da compra
                              </h3>
                            </div>
                            <button
                              type="button"
                              aria-label="Cancelar nova categoria"
                              onClick={cancelQuickCategory}
                            >
                              <X aria-hidden="true" />
                            </button>
                          </div>
                          <label htmlFor="quick-category-name">
                            Nome da categoria
                          </label>
                          <input
                            id="quick-category-name"
                            name="categoryName"
                            value={quickCategoryName}
                            onChange={(event) =>
                              setQuickCategoryName(event.target.value)
                            }
                            minLength={2}
                            maxLength={80}
                            autoFocus
                            required
                          />
                          <small>
                            Use uma família ampla. Produto, marca e embalagem
                            serão informados nos outros campos.
                          </small>

                          {similarCategories.length > 0 ? (
                            <div className="category-similar" role="status">
                              <span>Talvez você queira usar:</span>
                              <div>
                                {similarCategories.map((category) => (
                                  <button
                                    key={category.id}
                                    type="button"
                                    onClick={() =>
                                      chooseSimilarCategory(category.id)
                                    }
                                  >
                                    {category.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div
                            className="category-kind category-quick-kind"
                            role="group"
                            aria-label="Tipo da nova categoria"
                          >
                            {(
                              [
                                ["ingredient", "Ingrediente"],
                                ["packaging", "Embalagem"],
                                ["operational", "Consumo operacional"],
                              ] as const
                            ).map(([value, label]) => (
                              <button
                                type="button"
                                key={value}
                                aria-pressed={quickCategoryKind === value}
                                onClick={() => setQuickCategoryKind(value)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <input
                            type="hidden"
                            name="categoryKind"
                            value={quickCategoryKind}
                          />
                          <input
                            type="hidden"
                            name="categoryRequestKey"
                            value={categoryRequestKey}
                          />

                          {categoryCreationContext === "purchase" &&
                          categoryActionState.requestKey ===
                            categoryRequestKey &&
                          categoryActionState.status === "error" ? (
                            <p className="form-message is-error" role="alert">
                              {categoryActionState.message}
                            </p>
                          ) : null}

                          <div className="category-quick-actions">
                            <button
                              className="quiet-action"
                              type="button"
                              onClick={cancelQuickCategory}
                            >
                              Cancelar
                            </button>
                            <button
                              className="button button-secondary"
                              type="submit"
                              formAction={categoryFormAction}
                              formNoValidate
                              disabled={
                                categoryPending ||
                                quickCategoryName.trim().length < 2
                              }
                              onClick={() =>
                                setCategoryCreationContext("purchase")
                              }
                            >
                              <Tags aria-hidden="true" />
                              {categoryPending
                                ? "Criando…"
                                : "Criar e selecionar"}
                            </button>
                          </div>
                        </section>
                      ) : null}
                    </div>
                    <div className="form-field">
                      <label htmlFor="brand-name">Marca</label>
                      <input
                        id="brand-name"
                        name="brandName"
                        placeholder="Ex.: Harald"
                      />
                    </div>
                    <div className="form-field form-field-wide">
                      <label htmlFor="display-name">Nome na embalagem</label>
                      <input
                        id="display-name"
                        name="displayName"
                        placeholder="Ex.: Harald Melken meio amargo 1,01 kg"
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="net-content">Conteúdo em gramas</label>
                      <NumberField
                        id="net-content"
                        name="netContentBase"
                        min={0.001}
                        step={0.001}
                        placeholder="1010"
                        required
                      />
                      <input type="hidden" name="packageUnit" value="g" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="gtin">Código de barras</label>
                      <input
                        id="gtin"
                        name="gtin"
                        inputMode="numeric"
                        pattern="[0-9]{8,14}"
                        placeholder="Opcional"
                      />
                    </div>
                    <label className="check-field form-field-wide">
                      <input type="checkbox" name="perishable" />
                      <span>Este ingrediente costuma ter validade curta</span>
                    </label>
                  </div>
                ) : null}
              </fieldset>

              <fieldset>
                <legend>
                  <span>2</span> Quantidade e custo
                </legend>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="quantity-packages">
                      Quantas embalagens?
                    </label>
                    <NumberField
                      key={`${selectedItem}-${purchasePackages}`}
                      id="quantity-packages"
                      name="quantityPackages"
                      min={1}
                      step={1}
                      defaultValue={String(purchasePackages)}
                      integerOnly
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="total-cost">Valor total</label>
                    <NumberField
                      id="total-cost"
                      name="totalCost"
                      min={0.01}
                      step={0.01}
                      prefix="R$"
                      placeholder="0,00"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="entry-date">Data de entrada</label>
                    <DatePicker
                      id="entry-date"
                      name="entryDate"
                      defaultValue="2026-08-24"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="expiry-date">Validade</label>
                    <DatePicker id="expiry-date" name="expiryDate" />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>
                  <span>3</span> Origem do lote
                </legend>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="supplier-name">Onde comprou?</label>
                    <input
                      id="supplier-name"
                      name="supplierName"
                      placeholder="Fornecedor opcional"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="lot-code">Lote da embalagem</label>
                    <input
                      id="lot-code"
                      name="lotCode"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </fieldset>

              {actionState.status === "duplicate" ? (
                <div className="duplicate-suggestion" role="alert">
                  <div>
                    <Sparkles aria-hidden="true" />
                    <div>
                      <h3>Talvez este produto já esteja na despensa</h3>
                      <p>{actionState.message}</p>
                    </div>
                  </div>
                  <ul>
                    {actionState.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <div>
                          <strong>{candidate.displayName}</strong>
                          <span>
                            {candidate.groupName} · {candidate.reason}
                          </span>
                        </div>
                        <button
                          className="button button-secondary"
                          type="submit"
                          name="resolvedItemId"
                          value={candidate.id}
                        >
                          Usar este item
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="quiet-action"
                    type="submit"
                    name="forceCreate"
                    value="true"
                  >
                    É outro produto comprado; criar mesmo assim
                  </button>
                </div>
              ) : null}

              {actionState.status === "error" ? (
                <p className="form-message is-error" role="alert">
                  {actionState.message}
                </p>
              ) : null}

              <div className="purchase-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={closePurchaseDialog}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending}
                >
                  <PackagePlus aria-hidden="true" />
                  {pending ? "Guardando o lote…" : "Registrar na despensa"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </dialog>

      <dialog
        className="purchase-dialog category-dialog"
        ref={categoryDialogRef}
        aria-labelledby="category-dialog-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget)
            categoryDialogRef.current?.close();
        }}
      >
        <section className="purchase-panel category-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Categorias"
            eyebrow="Organização da despensa"
            closeLabel="Fechar categorias"
            onClose={() => categoryDialogRef.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <div className="purchase-panel-head category-panel-head">
              <div>
                <p className="eyebrow">Organização da despensa</p>
                <h2 id="category-dialog-title">Categorias com significado.</h2>
              </div>
              <p>
                Categoria é uma família estável para organizar e filtrar.
                “Chocolate meio amargo” é ingrediente; “Chocolates e cacaus” é
                categoria.
              </p>
            </div>
            <div className="category-list">
              {pantry.categories.map((category) => (
                <article key={category.id}>
                  <div>
                    <strong>{category.name}</strong>
                    <span>
                      {category.kind === "ingredient"
                        ? "Ingrediente"
                        : category.kind === "packaging"
                          ? "Embalagem"
                          : "Consumo operacional"}
                    </span>
                  </div>
                  <small>
                    {category.groupCount}{" "}
                    {category.groupCount === 1 ? "ingrediente" : "ingredientes"}
                  </small>
                </article>
              ))}
            </div>
            <form
              className="purchase-form category-form"
              action={categoryFormAction}
              onSubmit={() => setCategoryCreationContext("manager")}
            >
              <input
                type="hidden"
                name="categoryRequestKey"
                value={categoryRequestKey}
              />
              <fieldset>
                <legend>
                  <span>+</span>Nova categoria
                </legend>
                <div className="form-field">
                  <label htmlFor="category-name">Nome da família</label>
                  <input
                    id="category-name"
                    name="categoryName"
                    placeholder="Ex.: Farinhas e secos"
                    required
                  />
                </div>
                <div
                  className="category-kind"
                  role="group"
                  aria-label="Tipo da categoria"
                >
                  {(
                    [
                      ["ingredient", "Ingrediente"],
                      ["packaging", "Embalagem"],
                      ["operational", "Consumo operacional"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={categoryKind === value}
                      onClick={() => setCategoryKind(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="categoryKind" value={categoryKind} />
              </fieldset>
              {categoryCreationContext === "manager" &&
              categoryActionState.requestKey === categoryRequestKey &&
              categoryActionState.status === "error" ? (
                <p className="form-message is-error" role="alert">
                  {categoryActionState.message}
                </p>
              ) : null}
              <div className="purchase-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => categoryDialogRef.current?.close()}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={categoryPending}
                >
                  <Tags aria-hidden="true" />
                  {categoryPending ? "Criando…" : "Criar categoria"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </dialog>

      <dialog
        className="purchase-dialog stock-dialog"
        ref={stockDialogRef}
        aria-labelledby="stock-dialog-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget)
            stockDialogRef.current?.close();
        }}
      >
        <section className="purchase-panel stock-panel rounded-scroll-shell">
          <ModalGlassHeader
            title={
              stockMode === "inventory" ? "Conferir lote" : "Registrar perda"
            }
            eyebrow={selectedLot?.itemName ?? "Despensa"}
            closeLabel="Fechar conferência do lote"
            onClose={() => stockDialogRef.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <div className="purchase-panel-head stock-panel-head">
              <div>
                <p className="eyebrow">
                  {stockMode === "inventory"
                    ? "Conferência da prateleira"
                    : "Baixa consciente"}
                </p>
                <h2 id="stock-dialog-title">
                  {stockMode === "inventory"
                    ? "Quanto existe de verdade?"
                    : "O que não poderá mais ser usado?"}
                </h2>
              </div>
              <p>
                {stockMode === "inventory"
                  ? "Informe o total físico deste lote. A diferença vira um movimento rastreável; nenhum saldo anterior é apagado."
                  : "A perda retira somente o que está livre. Quantidades prometidas a pedidos permanecem protegidas."}
              </p>
            </div>

            {selectedLot ? (
              <form
                className="purchase-form stock-form"
                action={stockFormAction}
              >
                <input type="hidden" name="operation" value={stockMode} />
                <input type="hidden" name="lotId" value={selectedLot.lot.id} />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={stockCommandKey}
                />
                <div className="stock-lot-context">
                  <div>
                    <span>{selectedLot.itemName}</span>
                    <strong>
                      Lote {selectedLot.lot.lotCode ?? "sem código"}
                    </strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Físico</dt>
                      <dd>{selectedLot.lot.physicalLabel}</dd>
                    </div>
                    <div>
                      <dt>Reservado</dt>
                      <dd>{selectedLot.lot.reservedLabel}</dd>
                    </div>
                    <div>
                      <dt>Livre</dt>
                      <dd>{selectedLot.lot.availableLabel}</dd>
                    </div>
                  </dl>
                </div>

                <fieldset>
                  <legend>
                    <span>1</span>
                    {stockMode === "inventory"
                      ? "Nova contagem"
                      : "Quantidade perdida"}
                  </legend>
                  <div className="form-grid">
                    <div className="form-field">
                      <label htmlFor="stock-quantity">
                        {stockMode === "inventory"
                          ? `Total encontrado em ${selectedLot.baseUnit}`
                          : `Quanto será baixado em ${selectedLot.baseUnit}`}
                      </label>
                      <NumberField
                        key={`${stockCommandKey}-${stockMode}`}
                        id="stock-quantity"
                        name="quantityBase"
                        defaultValue={
                          stockMode === "inventory"
                            ? String(selectedLot.lot.physicalBase)
                            : ""
                        }
                        min={0}
                        max={
                          stockMode === "loss"
                            ? selectedLot.lot.availableBase
                            : undefined
                        }
                        step={1}
                        suffix={selectedLot.baseUnit}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="stock-reason">Motivo</label>
                      <SearchableCombobox
                        key={`stock-reason-${stockCommandKey}-${stockMode}`}
                        id="stock-reason"
                        name="reason"
                        options={
                          stockMode === "inventory"
                            ? inventoryReasonOptions
                            : lossReasonOptions
                        }
                        value={
                          stockMode === "inventory"
                            ? inventoryReason
                            : lossReason
                        }
                        onValueChange={
                          stockMode === "inventory"
                            ? setInventoryReason
                            : setLossReason
                        }
                        required
                      />
                    </div>
                    <div className="form-field form-field-wide">
                      <label htmlFor="stock-note">
                        {stockMode === "inventory"
                          ? "O que motivou a conferência?"
                          : "Observação"}
                      </label>
                      <TextAreaField
                        id="stock-note"
                        name="note"
                        maxLength={500}
                        required={
                          stockMode === "inventory" || lossReason === "other"
                        }
                        placeholder={
                          stockMode === "inventory"
                            ? "Ex.: conferência semanal da prateleira"
                            : "Opcional, a menos que tenha escolhido outro motivo"
                        }
                      />
                    </div>
                  </div>
                </fieldset>

                {stockActionState.status === "error" &&
                stockActionState.commandKey === stockCommandKey ? (
                  <p className="form-message is-error" role="alert">
                    {stockActionState.message}
                  </p>
                ) : null}

                {stockMode === "loss" && confirmingLoss ? (
                  <div className="stock-confirmation" role="alert">
                    <Trash2 aria-hidden="true" />
                    <div>
                      <strong>Esta baixa não apaga o histórico.</strong>
                      <p>
                        Ela cria um movimento de perda e altera imediatamente o
                        saldo livre. Confirme somente depois de revisar a
                        quantidade.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="purchase-actions">
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => stockDialogRef.current?.close()}
                  >
                    Cancelar
                  </button>
                  {stockMode === "loss" && !confirmingLoss ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setConfirmingLoss(true)}
                    >
                      <Trash2 aria-hidden="true" /> Revisar perda
                    </button>
                  ) : (
                    <button
                      className={`button ${stockMode === "loss" ? "button-danger" : "button-primary"}`}
                      type="submit"
                      disabled={stockPending}
                    >
                      {stockMode === "inventory" ? (
                        <ClipboardCheck aria-hidden="true" />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                      {stockPending
                        ? "Registrando…"
                        : stockMode === "inventory"
                          ? "Guardar conferência"
                          : "Confirmar perda"}
                    </button>
                  )}
                </div>
              </form>
            ) : null}
          </div>
        </section>
      </dialog>

      {pantry.attention.length > 0 ? (
        <section className="pantry-attention" aria-labelledby="attention-title">
          <div className="section-head">
            <h2 id="attention-title">Para olhar com carinho</h2>
            <span>O que vence ou está faltando</span>
          </div>
          <div className="attention-strip">
            {pantry.attention.map((item) => (
              <article key={item.id} className={`is-${item.tone}`}>
                {item.tone === "expiry" ? (
                  <CalendarClock aria-hidden="true" />
                ) : (
                  <AlertTriangle aria-hidden="true" />
                )}
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pantry-shopping" aria-labelledby="shopping-title">
        <div className="section-head">
          <div>
            <h2 id="shopping-title">Antes de sair às compras</h2>
            <span>Faltas reunidas entre todos os pedidos confirmados</span>
          </div>
          <ShoppingBasket aria-hidden="true" />
        </div>
        {pantry.shoppingList.length > 0 ? (
          <div className="pantry-shopping-list">
            {pantry.shoppingList.map((entry) => (
              <article key={entry.commercialItemId}>
                <div className="pantry-shopping-quantity">
                  <strong>{entry.packagesToBuy}</strong>
                  <span>
                    {entry.packagesToBuy === 1 ? "embalagem" : "embalagens"}
                  </span>
                </div>
                <div className="pantry-shopping-copy">
                  <h3>{entry.displayName}</h3>
                  <p>
                    {entry.remainingLabel} ainda faltam · embalagem de{" "}
                    {entry.packageLabel}
                  </p>
                  <small>
                    Reúne {entry.orderCount}{" "}
                    {entry.orderCount === 1 ? "pedido" : "pedidos"} · precisa
                    estar aqui até {shortDate(entry.neededBy)}
                  </small>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() =>
                    openPurchaseDialog(
                      entry.commercialItemId,
                      entry.packagesToBuy,
                    )
                  }
                >
                  <PackagePlus aria-hidden="true" /> Registrar compra
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="pantry-shopping-empty">
            <ClipboardCheck aria-hidden="true" />
            <div>
              <h3>A lista está coberta.</h3>
              <p>O estoque livre já atende às faltas dos pedidos abertos.</p>
            </div>
          </div>
        )}
      </section>

      <section className="pantry-shelf" aria-labelledby="shelf-title">
        <div className="section-head pantry-shelf-head">
          <div>
            <h2 id="shelf-title">Na prateleira</h2>
            <span>Categoria, ingrediente, produto comprado e lote</span>
          </div>
          <div className="pantry-tools">
            <div className="pantry-category-filter">
              <span className="sr-only">Filtrar por categoria</span>
              <SearchableCombobox
                id="category-filter"
                name="categoryFilter"
                options={categoryFilterOptions}
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                ariaLabel="Filtrar por categoria"
              />
            </div>
            <label className="pantry-search">
              <span className="sr-only">Buscar ingrediente ou marca</span>
              <Search aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar ingrediente ou marca"
              />
            </label>
            <button
              className="button button-secondary category-manage-button"
              type="button"
              onClick={() => {
                setCategoryCreationContext(null);
                setCategoryRequestKey(crypto.randomUUID());
                categoryDialogRef.current?.showModal();
              }}
            >
              <Tags aria-hidden="true" />
              Categorias
            </button>
          </div>
        </div>

        <div className="pantry-categories">
          {visibleCategories.map((category) => (
            <section
              className="pantry-category-card"
              aria-labelledby={`pantry-category-${category.id}`}
              key={category.id}
            >
              <header className="pantry-category-head">
                <div>
                  <span>Categoria</span>
                  <h3 id={`pantry-category-${category.id}`}>{category.name}</h3>
                  <p>
                    {category.groups.length}{" "}
                    {category.groups.length === 1
                      ? "ingrediente"
                      : "ingredientes"}
                    {" · "}
                    {category.itemCount}{" "}
                    {category.itemCount === 1
                      ? "produto comprado"
                      : "produtos comprados"}
                  </p>
                </div>
                <div className="pantry-category-status">
                  <strong>
                    {category.lotCount}{" "}
                    {category.lotCount === 1 ? "lote aberto" : "lotes abertos"}
                  </strong>
                  {category.attentionCount > 0 ? (
                    <small>
                      {category.attentionCount}{" "}
                      {category.attentionCount === 1
                        ? "ingrediente pede atenção"
                        : "ingredientes pedem atenção"}
                    </small>
                  ) : (
                    <small>Sem alertas nesta categoria</small>
                  )}
                </div>
              </header>

              <div className="pantry-ingredients">
                {category.groups.map((group) => (
                  <details
                    className="pantry-ingredient"
                    key={group.id}
                    open={query.trim().length > 0 || undefined}
                  >
                    <summary>
                      <div className="pantry-ingredient-name">
                        <h4>{group.name}</h4>
                        <small>
                          {group.items.length}{" "}
                          {group.items.length === 1
                            ? "produto cadastrado"
                            : "produtos cadastrados"}
                        </small>
                      </div>
                      <div className="pantry-ingredient-total">
                        <strong>{group.availableLabel}</strong>
                        {group.status === "low" ? (
                          <small>Abaixo do mínimo</small>
                        ) : null}
                      </div>
                      <ChevronDown aria-hidden="true" />
                    </summary>

                    <div className="pantry-items">
                      {group.items.map((item) => (
                        <article className="pantry-item" key={item.id}>
                          <div>
                            <h5>{item.displayName}</h5>
                            <p>
                              {item.lotCount === 0
                                ? "Nenhum lote disponível"
                                : `${item.lotCount} ${item.lotCount === 1 ? "lote" : "lotes"} · embalagem de ${item.packageLabel}`}
                            </p>
                          </div>
                          <div className="pantry-item-quantity">
                            <strong>{item.availableLabel}</strong>
                            {item.nextExpiryLabel ? (
                              <span
                                className={
                                  item.status === "attention"
                                    ? "is-attention"
                                    : ""
                                }
                              >
                                Próxima validade {item.nextExpiryLabel}
                              </span>
                            ) : (
                              <span>Sem validade próxima</span>
                            )}
                          </div>
                          {item.lots.length > 0 ? (
                            <details className="pantry-lots">
                              <summary>
                                <span>Ver os lotes e conferir saldos</span>
                                <ChevronDown aria-hidden="true" />
                              </summary>
                              <div className="pantry-lot-list">
                                {item.lots.map((lot) => (
                                  <article key={lot.id}>
                                    <div className="pantry-lot-identity">
                                      <strong>
                                        Lote {lot.lotCode ?? "sem código"}
                                      </strong>
                                      <span>
                                        Entrou {shortDate(lot.entryDate)}
                                        {lot.expiryDate
                                          ? ` · vence ${shortDate(lot.expiryDate)}`
                                          : " · sem validade informada"}
                                      </span>
                                    </div>
                                    <dl>
                                      <div>
                                        <dt>Físico</dt>
                                        <dd>{lot.physicalLabel}</dd>
                                      </div>
                                      <div>
                                        <dt>Reservado</dt>
                                        <dd>{lot.reservedLabel}</dd>
                                      </div>
                                      <div>
                                        <dt>Livre</dt>
                                        <dd>{lot.availableLabel}</dd>
                                      </div>
                                    </dl>
                                    <div className="pantry-lot-actions">
                                      <button
                                        className="quiet-action"
                                        type="button"
                                        onClick={() =>
                                          openStockDialog(
                                            lot,
                                            item.displayName,
                                            group.baseUnit,
                                            "inventory",
                                          )
                                        }
                                      >
                                        <ClipboardCheck aria-hidden="true" />{" "}
                                        Conferir
                                      </button>
                                      <button
                                        className="quiet-action is-danger"
                                        type="button"
                                        disabled={lot.availableBase <= 0}
                                        onClick={() =>
                                          openStockDialog(
                                            lot,
                                            item.displayName,
                                            group.baseUnit,
                                            "loss",
                                          )
                                        }
                                      >
                                        <Trash2 aria-hidden="true" /> Registrar
                                        perda
                                      </button>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          {visibleCategories.length === 0 ? (
            <div className="pantry-empty">
              <Search aria-hidden="true" />
              <h3>Nada com esse nome por aqui</h3>
              <p>Tente buscar pela marca ou pelo ingrediente culinário.</p>
            </div>
          ) : null}
        </div>
      </section>

      <SystemNotifications
        notifications={notification}
        onDismiss={(id) => setDismissedNotification(id)}
      />
    </section>
  );
}
