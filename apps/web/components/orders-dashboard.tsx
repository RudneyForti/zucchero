"use client";

import {
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  CircleCheck,
  Coins,
  CreditCard,
  HandCoins,
  Link2,
  LoaderCircle,
  MapPin,
  NotebookTabs,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  Route,
  Scale,
  ShoppingBasket,
  Truck,
  Undo2,
  UserRound,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { PageBackButton } from "@/components/page-back-button";
import {
  calculateDeliveryQuoteAction,
  mutateOrderAction,
  type OrderActionState,
} from "@/app/pedidos/actions";
import {
  DatePicker,
  NumberField,
  SearchableCombobox,
  TextAreaField,
  TimePicker,
  type ComboboxOption,
} from "@/components/form-controls";
import { SystemNotifications } from "@/components/system-notifications";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import type { CustomerWorkspace } from "@/lib/customers";
import {
  calculateOrderQuote,
  type DeliveryArrangement,
  type DeliveryQuote,
  type OrderLifecycleStatus,
  type OrderWorkspace,
  type OrderAvailability,
  type StoredOrderSummary,
} from "@/lib/orders";
import type { PantryView } from "@/lib/pantry";
import type { RecipeWorkspace } from "@/lib/recipes";
import type { SettingsWorkspace } from "@/lib/settings";
import { NEW_ORDER_ACTION, NEW_ORDER_LABEL } from "@/lib/order-ui";

type OrdersDashboardProps = {
  pantry: PantryView;
  recipes: RecipeWorkspace;
  initialOrders: OrderWorkspace;
  customers: CustomerWorkspace;
  settings: SettingsWorkspace;
  operationalAccess: boolean;
  initialCreateOpen?: boolean;
};

type DeliveryRouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; addressId: string; quote: DeliveryQuote }
  | { status: "error"; message: string };

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const mass = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const bakeryTimeZone = "America/Sao_Paulo";

const steps = ["Cliente", "Encomenda", "Disponibilidade", "Preço"];

const availabilityLabels: Record<OrderAvailability, string> = {
  available: "Disponível",
  substitution: "Disponível com troca",
  partial: "Compra necessária",
  unavailable: "Ainda indisponível",
};

const lifecycleLabels: Record<OrderLifecycleStatus, string> = {
  confirmed: "Confirmado",
  in_production: "Na bancada",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const deliveryArrangementLabels: Record<DeliveryArrangement, string> = {
  own: "Entrega própria",
  customer_arranged: "Terceirizada pela cliente",
  integrated_partner: "Plataforma integrada",
};

const lifecycleSteps: Array<{
  status: Exclude<OrderLifecycleStatus, "cancelled">;
  label: string;
}> = [
  { status: "confirmed", label: "Confirmado" },
  { status: "in_production", label: "Na bancada" },
  { status: "ready", label: "Pronto" },
  { status: "completed", label: "Entregue" },
];

const directExpenseOptions: ComboboxOption[] = [
  { value: "packaging", label: "Embalagem" },
  { value: "delivery", label: "Entrega" },
  { value: "decoration", label: "Decoração e acabamento" },
  { value: "outsourced_service", label: "Serviço contratado" },
  { value: "other", label: "Outro gasto direto" },
];

const nextLifecycleStep: Partial<
  Record<OrderLifecycleStatus, { status: OrderLifecycleStatus; label: string }>
> = {
  ready: { status: "completed", label: "Concluir entrega" },
};

const cancellableStatuses = new Set<OrderLifecycleStatus>([
  "confirmed",
  "in_production",
  "ready",
]);

function tomorrowIso() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

function todayIso() {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function orderDateParts(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: bakeryTimeZone,
  });

  const dateKey = dayFormatter.format(date);
  const todayKey = dayFormatter.format(today);
  const tomorrowKey = dayFormatter.format(tomorrow);
  const label =
    dateKey === todayKey
      ? "Hoje"
      : dateKey === tomorrowKey
        ? "Amanhã"
        : new Intl.DateTimeFormat("pt-BR", {
            weekday: "short",
            timeZone: bakeryTimeZone,
          })
            .format(date)
            .replace(".", "");

  return {
    label,
    time: new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: bakeryTimeZone,
    })
      .format(date)
      .replace(":", "h"),
  };
}

function deliveryEditorParts(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function describeDeliveryShift(currentValue: string, nextValue: string) {
  const differenceMinutes = Math.round(
    (new Date(nextValue).getTime() - new Date(currentValue).getTime()) / 60_000,
  );
  if (!Number.isFinite(differenceMinutes) || differenceMinutes === 0) {
    return "O horário combinado continua o mesmo.";
  }
  const absoluteMinutes = Math.abs(differenceMinutes);
  const days = Math.floor(absoluteMinutes / 1_440);
  const hours = Math.floor((absoluteMinutes % 1_440) / 60);
  const minutes = absoluteMinutes % 60;
  const parts = [
    days ? `${days} dia${days > 1 ? "s" : ""}` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes} min` : "",
  ].filter(Boolean);
  return `A entrega será ${differenceMinutes > 0 ? "adiada" : "antecipada"} em ${parts.join(" e ")}.`;
}

function AvailabilityIcon({ status }: { status: OrderAvailability }) {
  if (status === "available") return <CircleCheck aria-hidden="true" />;
  if (status === "substitution") return <RefreshCw aria-hidden="true" />;
  return <ShoppingBasket aria-hidden="true" />;
}

function orderVarianceLabel(
  variance: NonNullable<StoredOrderSummary["productionVariance"]>,
) {
  if (variance.status === "on_target") return "Dentro do esperado";
  const difference = mass.format(Math.abs(variance.deltaG));
  return variance.status === "above"
    ? `${difference} g além do previsto`
    : `${difference} g abaixo do previsto`;
}

function orderCostResultTitle(result: StoredOrderSummary["costResult"]) {
  if (result.status === "cancelled") {
    return "O custo incorrido ficou preservado";
  }
  if (result.status === "not_started") {
    return "O custo real começa com o primeiro apontamento";
  }
  if (result.status === "partial") {
    return "O custo real ainda está sendo formado";
  }
  if (result.costVarianceStatus === "on_target") {
    return "O pedido fechou como previsto";
  }
  const difference = money.format(Math.abs(result.costDelta ?? 0));
  return result.costVarianceStatus === "above"
    ? `${difference} acima do previsto`
    : `${difference} abaixo do previsto`;
}

function orderCostResultDescription(result: StoredOrderSummary["costResult"]) {
  if (result.status === "cancelled") {
    return "Somente o que efetivamente saiu dos lotes entra nesta leitura; não projetamos lucro para um pedido cancelado.";
  }
  if (result.status === "not_started") {
    return "O orçamento está preservado. O realizado aparecerá conforme os ingredientes forem usados na bancada.";
  }
  if (result.status === "partial") {
    return `${result.confirmedLineCount} de ${result.totalLineCount} ingredientes já foram valorados pelos lotes consumidos. Lucro e margem aguardam o restante.`;
  }
  return "Cada grama usada ou perdida foi valorada pelo custo do lote de onde realmente saiu.";
}

function directExpenseCategoryLabel(value: string) {
  return (
    directExpenseOptions.find((option) => option.value === value)?.label ??
    "Outro gasto direto"
  );
}

function costBarWidth(value: number, result: StoredOrderSummary["costResult"]) {
  const maximum = Math.max(
    result.estimatedTotalCost,
    result.realizedTotalCost ?? 0,
    1,
  );
  return `${Math.max(value > 0 ? 6 : 0, Math.min(100, (value / maximum) * 100))}%`;
}

function OrdersPrerequisites({
  hasCustomers,
  hasPublishedRecipes,
  operationalAccess,
}: {
  hasCustomers: boolean;
  hasPublishedRecipes: boolean;
  operationalAccess: boolean;
}) {
  const prerequisites = [
    {
      ready: hasCustomers,
      title: "Cadastre uma cliente",
      description:
        "Nome e telefone bastam para começar. Endereço e preferências podem entrar depois.",
      href: "/clientes",
      action: "Ir para clientes",
      icon: UserRound,
    },
    {
      ready: hasPublishedRecipes,
      title: "Publique uma receita",
      description:
        "Rendimento, ingredientes e momentos formam a base segura de cada encomenda.",
      href: "/receitas",
      action: "Ir para receitas",
      icon: NotebookTabs,
    },
  ];

  return (
    <section className="view orders-view" aria-labelledby="orders-title">
      <PageBackButton />
      <header className="page-head orders-page-head">
        <div>
          <p className="eyebrow">Pedidos</p>
          <h1 id="orders-title">O combinado, no ritmo da cozinha.</h1>
          <p className="lead">
            Cliente, preparo, despensa e preço reunidos antes de dizer sim.
          </p>
        </div>
      </header>

      <section
        className="orders-prerequisites"
        aria-labelledby="orders-prerequisites-title"
      >
        <div className="orders-prerequisites-copy">
          <p className="eyebrow">Primeiros combinados</p>
          <h2 id="orders-prerequisites-title">
            Antes do primeiro pedido, vamos preparar duas bases.
          </h2>
          <p>
            Assim que houver uma cliente e uma receita publicada, o Zucchero
            libera a nova encomenda e cruza tudo com a despensa e o preço.
          </p>
        </div>

        <ol className="orders-prerequisite-list">
          {prerequisites.map((item, index) => {
            const Icon = item.icon;
            return (
              <li
                className={`orders-prerequisite-step${item.ready ? " is-complete" : ""}`}
                key={item.title}
              >
                <span className="orders-prerequisite-number" aria-hidden="true">
                  {item.ready ? <Check /> : index + 1}
                </span>
                <span className="orders-prerequisite-icon" aria-hidden="true">
                  <Icon />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                {item.ready ? (
                  <span className="orders-prerequisite-status">
                    <CircleCheck aria-hidden="true" />
                    Pronto
                  </span>
                ) : operationalAccess ? (
                  <Link className="button button-secondary" href={item.href}>
                    {item.action}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="orders-prerequisite-status is-pending">
                    Aguardando perfil operacional
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <p className="orders-prerequisites-foot">
          <CircleCheck aria-hidden="true" />A página continua disponível; a ação
          “Nova encomenda” aparece automaticamente quando as duas bases
          estiverem prontas.
        </p>
      </section>
    </section>
  );
}

export function OrdersDashboard(props: OrdersDashboardProps) {
  const hasCustomers = props.customers.customers.length > 0;
  const hasPublishedRecipes = props.recipes.recipes.some(
    (recipe) => recipe.status === "published",
  );

  if (!hasCustomers || !hasPublishedRecipes) {
    return (
      <OrdersPrerequisites
        hasCustomers={hasCustomers}
        hasPublishedRecipes={hasPublishedRecipes}
        operationalAccess={props.operationalAccess}
      />
    );
  }

  return <OrdersWorkspaceDashboard {...props} />;
}

function OrdersWorkspaceDashboard({
  pantry,
  recipes,
  initialOrders,
  customers,
  settings,
  operationalAccess,
  initialCreateOpen = false,
}: OrdersDashboardProps) {
  const publishedRecipes = recipes.recipes.filter(
    (recipe) => recipe.status === "published",
  );
  const [creating, setCreating] = useState(
    initialCreateOpen && operationalAccess,
  );
  const [step, setStep] = useState(1);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const initialCustomer = customers.customers[0];
  const initialAddress =
    initialCustomer?.addresses.find((address) => address.isDefault) ??
    initialCustomer?.addresses[0];
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? "");
  const [customerAddressId, setCustomerAddressId] = useState(
    initialAddress?.id ?? "",
  );
  const [deliveryMode, setDeliveryMode] = useState<"delivery" | "pickup">(
    initialCustomer?.preferredDeliveryMode ??
      settings.sales.defaultDeliveryMode,
  );
  const [deliveryArrangement, setDeliveryArrangement] =
    useState<DeliveryArrangement>("own");
  const [recipeId, setRecipeId] = useState(publishedRecipes[0]?.id ?? "");
  const [requestedMassG, setRequestedMassG] = useState("5000");
  const [targetMargin, setTargetMargin] = useState(
    String(settings.sales.defaultMarginPercentage),
  );
  const [additionalCost, setAdditionalCost] = useState("12");
  const [depositPercentage, setDepositPercentage] = useState(
    String(settings.sales.defaultDepositPercentage),
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(
    initialCustomer?.preferredPaymentMethod ??
      settings.sales.defaultPaymentMethod,
  );
  const [deliveryDate, setDeliveryDate] = useState(tomorrowIso);
  const [deliveryTime, setDeliveryTime] = useState("17:30");
  const [orderNote, setOrderNote] = useState("");
  const [deliveryRoute, setDeliveryRoute] = useState<DeliveryRouteState>({
    status: "idle",
  });
  const [deliveryRouteAttempt, setDeliveryRouteAttempt] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [replanDate, setReplanDate] = useState(tomorrowIso);
  const [replanTime, setReplanTime] = useState("17:30");
  const [replanReason, setReplanReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptFee, setReceiptFee] = useState("0");
  const [receiptMethod, setReceiptMethod] = useState("pix");
  const [receiptDate, setReceiptDate] = useState(todayIso);
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptIdempotencyKey, setReceiptIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [reversingReceiptId, setReversingReceiptId] = useState<string | null>(
    null,
  );
  const [reversalReason, setReversalReason] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("packaging");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseActualAmount, setExpenseActualAmount] = useState("");
  const [expenseWasEstimated, setExpenseWasEstimated] = useState(true);
  const [expenseEstimatedAmount, setExpenseEstimatedAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso);
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseIdempotencyKey, setExpenseIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [reversingExpenseId, setReversingExpenseId] = useState<string | null>(
    null,
  );
  const [expenseReversalReason, setExpenseReversalReason] = useState("");
  const [dismissedNotificationId, setDismissedNotificationId] = useState<
    number | null
  >(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const payloadRef = useRef<HTMLInputElement>(null);
  const orderStepContentRef = useRef<HTMLDivElement>(null);
  const createOrderDialogRef = useRef<HTMLDialogElement>(null);
  const createOrderScrollRef = useRef<HTMLDivElement>(null);
  const orderDialogRef = useRef<HTMLDialogElement>(null);
  const orderDialogScrollRef = useRef<HTMLDivElement>(null);
  const lastHandledNotification = useRef<number | null>(null);
  const initialActionState: OrderActionState = {
    status: "idle",
    operation: null,
    message: "",
    workspace: initialOrders,
    order: null,
    notificationId: null,
  };
  const [actionState, formAction, pending] = useActionState(
    mutateOrderAction,
    initialActionState,
  );

  const selectedCustomer =
    customers.customers.find((customer) => customer.id === customerId) ??
    customers.customers[0]!;
  const selectedAddress =
    selectedCustomer.addresses.find(
      (address) => address.id === customerAddressId,
    ) ??
    selectedCustomer.addresses.find((address) => address.isDefault) ??
    selectedCustomer.addresses[0];
  const selectedRecipe =
    publishedRecipes.find((recipe) => recipe.id === recipeId) ??
    publishedRecipes[0]!;
  const ownDeliverySelected =
    deliveryMode === "delivery" && deliveryArrangement === "own";
  const deliveryRouteMatchesSelection =
    ownDeliverySelected &&
    deliveryRoute.status === "success" &&
    deliveryRoute.addressId === selectedAddress?.id;
  const quote = calculateOrderQuote(selectedRecipe, pantry, {
    requestedMassG: Number(requestedMassG) || 0,
    targetMarginPercentage: Number(targetMargin) || 0,
    additionalCost: Number(additionalCost) || 0,
    deliveryCost: deliveryRouteMatchesSelection
      ? deliveryRoute.quote.deliveryCost
      : 0,
  });
  const purchaseNeeds = quote.ingredients.filter(
    (ingredient) => ingredient.shortageG > 0,
  );
  const deliveryQuoteRequired =
    ownDeliverySelected && settings.sales.deliveryCostPerKm > 0;
  const customerReady =
    Boolean(selectedCustomer) &&
    (deliveryMode === "pickup" ||
      (Boolean(selectedAddress) &&
        (!ownDeliverySelected ||
          !deliveryQuoteRequired ||
          deliveryRouteMatchesSelection)));

  const customerOptions: ComboboxOption[] = customers.customers.map(
    (customer) => ({
      value: customer.id,
      label: `${customer.name} · ${customer.primaryPhone}`,
      keywords: `${customer.name} ${customer.primaryPhone} ${customer.email ?? ""} ${customer.addresses.map((address) => address.formattedAddress).join(" ")}`,
    }),
  );
  const recipeOptions: ComboboxOption[] = publishedRecipes.map((recipe) => ({
    value: recipe.id,
    label: `${recipe.name} · versão ${recipe.versionNumber}`,
    keywords: `${recipe.name} ${recipe.yieldMassG}`,
  }));
  const addressOptions: ComboboxOption[] = selectedCustomer.addresses.map(
    (address) => ({
      value: address.id,
      label: `${address.label} · ${address.formattedAddress}`,
      keywords: `${address.label} ${address.formattedAddress}`,
    }),
  );
  const paymentOptions: ComboboxOption[] = [
    { value: "pix", label: "Pix" },
    { value: "card", label: "Cartão" },
    { value: "cash", label: "Dinheiro" },
  ];

  useEffect(() => {
    if (
      actionState.status !== "success" ||
      !actionState.notificationId ||
      lastHandledNotification.current === actionState.notificationId
    ) {
      return;
    }

    lastHandledNotification.current = actionState.notificationId;
    const animationFrame = requestAnimationFrame(() => {
      setDismissedNotificationId(null);
      if (actionState.operation === "confirm") {
        if (createOrderDialogRef.current?.open) {
          createOrderDialogRef.current.close();
        }
        setCreating(false);
        setStep(1);
        setIdempotencyKey(crypto.randomUUID());
      } else if (actionState.operation === "status") {
        orderDialogRef.current?.close();
        setCancelling(false);
        setCancellationReason("");
      } else if (actionState.operation === "replan") {
        setReplanning(false);
        setReplanReason("");
      } else if (actionState.operation === "receipt") {
        setReceiving(false);
        setReceiptFee("0");
        setReceiptNote("");
        setReceiptIdempotencyKey(crypto.randomUUID());
      } else if (actionState.operation === "receipt_reversal") {
        setReversingReceiptId(null);
        setReversalReason("");
      } else if (actionState.operation === "direct_expense") {
        setAddingExpense(false);
        setExpenseDescription("");
        setExpenseActualAmount("");
        setExpenseEstimatedAmount("");
        setExpenseNote("");
        setExpenseIdempotencyKey(crypto.randomUUID());
      } else if (actionState.operation === "direct_expense_reversal") {
        setReversingExpenseId(null);
        setExpenseReversalReason("");
      }
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [actionState.notificationId, actionState.operation, actionState.status]);

  useEffect(() => {
    let cancelled = false;
    if (!ownDeliverySelected || !selectedAddress) {
      const timeout = window.setTimeout(() => {
        if (!cancelled) setDeliveryRoute({ status: "idle" });
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }
    if (!settings.integrations.googleMapsRoutesEnabled) {
      const timeout = window.setTimeout(() => {
        if (cancelled) return;
        setDeliveryRoute({
          status: "error",
          message:
            "Configure a chave do Google Maps. Até lá, mantenha a tarifa em zero e informe a entrega em outros custos.",
        });
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setDeliveryRoute({ status: "loading" });
      void calculateDeliveryQuoteAction({
        customerId: selectedCustomer.id,
        customerAddressId: selectedAddress.id,
      }).then((result) => {
        if (cancelled) return;
        setDeliveryRoute(
          result.status === "success"
            ? {
                status: "success",
                addressId: selectedAddress.id,
                quote: result.quote,
              }
            : { status: "error", message: result.message },
        );
      });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    customerId,
    deliveryRouteAttempt,
    ownDeliverySelected,
    selectedAddress,
    selectedCustomer.id,
    settings.integrations.googleMapsRoutesEnabled,
  ]);

  useEffect(() => {
    if (!creating) return;

    const animationFrame = requestAnimationFrame(() => {
      const dialog = createOrderDialogRef.current;
      if (dialog && !dialog.open) {
        dialog.showModal();
        createOrderScrollRef.current?.scrollTo({ top: 0 });
      }

      const heading =
        orderStepContentRef.current?.querySelector<HTMLElement>("h3");
      if (!heading) return;

      heading.focus({ preventScroll: true });
      heading.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    const transitionTimeout = window.setTimeout(
      () => setStepTransitioning(false),
      240,
    );

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(transitionTimeout);
    };
  }, [creating, step]);

  function closeCreateOrder() {
    if (pending) return;
    if (createOrderDialogRef.current?.open) {
      createOrderDialogRef.current.close();
    }
    setCreating(false);
    setNewOrderUrlState(false);
  }

  function startOrder() {
    setStep(1);
    setStepTransitioning(false);
    setIdempotencyKey(crypto.randomUUID());
    setCreating(true);
    setNewOrderUrlState(true);
  }

  function setNewOrderUrlState(open: boolean) {
    const url = new URL(window.location.href);
    if (open) {
      url.searchParams.set("acao", NEW_ORDER_ACTION);
    } else if (url.searchParams.get("acao") === NEW_ORDER_ACTION) {
      url.searchParams.delete("acao");
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function goToOrderStep(nextStep: number) {
    const boundedStep = Math.max(1, Math.min(steps.length, nextStep));
    if (boundedStep === step || stepTransitioning) return;

    setStepTransitioning(true);
    setStep(boundedStep);
  }

  function chooseCustomer(value: string) {
    setCustomerId(value);
    const customer = customers.customers.find((entry) => entry.id === value);
    const nextAddress =
      customer?.addresses.find((address) => address.isDefault) ??
      customer?.addresses[0];
    setCustomerAddressId(nextAddress?.id ?? "");
    setDeliveryMode(
      customer?.preferredDeliveryMode ?? settings.sales.defaultDeliveryMode,
    );
    setPaymentMethod(
      customer?.preferredPaymentMethod ?? settings.sales.defaultPaymentMethod,
    );
  }

  function prepareOrderSubmission(event: FormEvent<HTMLFormElement>) {
    if (step < steps.length) {
      event.preventDefault();
      goToOrderStep(step + 1);
      return;
    }

    if (stepTransitioning) {
      event.preventDefault();
      return;
    }

    if (!payloadRef.current) {
      event.preventDefault();
      return;
    }

    payloadRef.current.value = JSON.stringify({
      idempotencyKey,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.primaryPhone,
      deliveryMode,
      deliveryArrangement:
        deliveryMode === "delivery" ? deliveryArrangement : undefined,
      addressLabel:
        deliveryMode === "delivery" ? selectedAddress?.label : undefined,
      address:
        deliveryMode === "delivery"
          ? selectedAddress?.formattedAddress
          : undefined,
      customerAddressId:
        deliveryMode === "delivery" ? selectedAddress?.id : undefined,
      deliveryQuoteToken:
        ownDeliverySelected && deliveryRouteMatchesSelection
          ? deliveryRoute.quote.quoteToken
          : undefined,
      deliveryAt: `${deliveryDate}T${deliveryTime}:00-03:00`,
      notes: orderNote.trim() || undefined,
      recipeId: selectedRecipe.id,
      recipeVersionNumber: selectedRecipe.versionNumber,
      requestedMassG: Number(requestedMassG),
      productionIncrementG: 50,
      additionalCost: Number(additionalCost) || 0,
      targetMarginPercentage: Number(targetMargin) || 0,
      depositPercentage: Number(depositPercentage) || 0,
      paymentMethod,
    });
  }

  const persistedOrders = actionState.workspace.orders;
  const activeOrders = persistedOrders.filter(
    (order) =>
      order.status === "confirmed" ||
      order.status === "in_production" ||
      order.status === "ready",
  );
  const closedOrders = persistedOrders.filter(
    (order) => order.status === "completed" || order.status === "cancelled",
  );
  const selectedOrder =
    persistedOrders.find((order) => order.id === selectedOrderId) ?? null;
  const notifications =
    actionState.notificationId &&
    actionState.notificationId !== dismissedNotificationId &&
    actionState.message
      ? [
          {
            id: actionState.notificationId,
            message: actionState.message,
          },
        ]
      : [];

  function openOrder(order: StoredOrderSummary) {
    const editorParts = deliveryEditorParts(order.deliveryAt);
    setSelectedOrderId(order.id);
    setCancelling(false);
    setReplanning(false);
    setCancellationReason("");
    setReplanDate(editorParts.date);
    setReplanTime(editorParts.time);
    setReplanReason("");
    setReceiving(false);
    setReceiptAmount(String(order.paymentResult.balanceDue));
    setReceiptFee("0");
    setReceiptMethod(order.paymentMethod);
    setReceiptDate(todayIso());
    setReceiptNote("");
    setReceiptIdempotencyKey(crypto.randomUUID());
    setReversingReceiptId(null);
    setReversalReason("");
    setAddingExpense(false);
    setExpenseCategory("packaging");
    setExpenseDescription("");
    setExpenseActualAmount("");
    setExpenseWasEstimated(true);
    setExpenseEstimatedAmount("");
    setExpenseDate(todayIso());
    setExpenseNote("");
    setExpenseIdempotencyKey(crypto.randomUUID());
    setReversingExpenseId(null);
    setExpenseReversalReason("");
    orderDialogRef.current?.showModal();
    requestAnimationFrame(() => {
      orderDialogScrollRef.current?.scrollTo({ top: 0 });
    });
  }

  return (
    <section className="view orders-view" aria-labelledby="orders-title">
      <PageBackButton />
      <header className="page-head orders-page-head">
        <div>
          <p className="eyebrow">Pedidos</p>
          <h1 id="orders-title">O combinado, no ritmo da cozinha.</h1>
          <p className="lead">
            Cliente, preparo, despensa e preço reunidos antes de dizer sim.
          </p>
        </div>
        {operationalAccess ? (
          <button
            className="button button-primary"
            type="button"
            onClick={startOrder}
          >
            <Plus aria-hidden="true" />
            {NEW_ORDER_LABEL}
          </button>
        ) : null}
      </header>

      {creating ? (
        <dialog
          className="purchase-dialog order-create-dialog"
          ref={createOrderDialogRef}
          aria-labelledby="new-order-title"
          onCancel={(event) => {
            if (pending) {
              event.preventDefault();
              return;
            }
            setCreating(false);
          }}
          onClose={() => {
            setCreating(false);
            setNewOrderUrlState(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateOrder();
            }
          }}
        >
          <div className="purchase-panel order-create-panel rounded-scroll-shell">
            <ModalGlassHeader
              title={NEW_ORDER_LABEL}
              titleId="new-order-title"
              eyebrow={`Etapa ${step} de 4`}
              closeLabel="Fechar nova encomenda"
              disabled={pending}
              onClose={closeCreateOrder}
            />
            <div
              className="purchase-panel-scroll order-create-scroll rounded-scroll-area"
              ref={createOrderScrollRef}
            >
              <form
                action={formAction}
                className="order-workbench"
                aria-labelledby="new-order-title"
                onSubmit={prepareOrderSubmission}
              >
                <input type="hidden" name="operation" value="confirm" />
                <input ref={payloadRef} type="hidden" name="orderPayload" />
                <div className="order-workbench-head">
                  <h2>Vamos montar o combinado.</h2>
                </div>

                <ol
                  className="order-stepper"
                  data-progress={step - 1}
                  aria-label="Etapas da nova encomenda"
                >
                  {steps.map((label, index) => {
                    const position = index + 1;
                    const isComplete = position < step;
                    const isCurrent = position === step;
                    return (
                      <li
                        key={label}
                        className={`${isComplete ? "is-complete" : ""}${isCurrent ? " is-current" : ""}`}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        <button
                          type="button"
                          disabled={position > step || stepTransitioning}
                          onClick={() => goToOrderStep(position)}
                          aria-label={`${label}${isComplete ? ", concluída" : isCurrent ? ", atual" : ""}`}
                        >
                          <span>
                            {isComplete ? (
                              <Check aria-hidden="true" />
                            ) : (
                              position
                            )}
                          </span>
                          <small>{label}</small>
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <div className="order-step-content" ref={orderStepContentRef}>
                  {step === 1 ? (
                    <section aria-labelledby="order-client-title">
                      <div className="order-section-head">
                        <div>
                          <p className="eyebrow">Começamos pela pessoa</p>
                          <h3 id="order-client-title" tabIndex={-1}>
                            Para quem vamos preparar?
                          </h3>
                          <p>
                            Só mostramos dados de entrega quando eles forem
                            úteis.
                          </p>
                        </div>
                        <UserRound aria-hidden="true" />
                      </div>

                      <div className="form-field">
                        <label htmlFor="order-customer">Cliente</label>
                        <SearchableCombobox
                          id="order-customer"
                          name="customerId"
                          options={customerOptions}
                          value={customerId}
                          onValueChange={chooseCustomer}
                          placeholder="Busque por nome ou telefone"
                          required
                        />
                        <small>
                          {selectedCustomer.name} já possui contato e
                          preferências salvos.
                        </small>
                      </div>

                      <div
                        className={`order-delivery-layout${
                          deliveryMode === "delivery" && selectedAddress
                            ? " has-route"
                            : ""
                        }`}
                      >
                        <div className="order-delivery-primary">
                          <fieldset className="choice-fieldset">
                            <legend>Como será a entrega?</legend>
                            <div className="order-choice-row">
                              <button
                                type="button"
                                aria-pressed={deliveryMode === "delivery"}
                                onClick={() => setDeliveryMode("delivery")}
                              >
                                <MapPin aria-hidden="true" />
                                Entregar
                              </button>
                              <button
                                type="button"
                                aria-pressed={deliveryMode === "pickup"}
                                onClick={() => setDeliveryMode("pickup")}
                              >
                                <PackageCheck aria-hidden="true" />
                                Retirada
                              </button>
                            </div>
                          </fieldset>

                          {deliveryMode === "delivery" ? (
                            <>
                              <fieldset className="order-delivery-arrangement">
                                <legend>Quem fará a entrega?</legend>
                                <div className="order-delivery-arrangement-options">
                                  <button
                                    type="button"
                                    aria-pressed={deliveryArrangement === "own"}
                                    onClick={() =>
                                      setDeliveryArrangement("own")
                                    }
                                  >
                                    <Truck aria-hidden="true" />
                                    <span>
                                      <strong>Própria</strong>
                                      <small>
                                        Rota e custo por km entram no pedido.
                                      </small>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={
                                      deliveryArrangement ===
                                      "customer_arranged"
                                    }
                                    onClick={() =>
                                      setDeliveryArrangement(
                                        "customer_arranged",
                                      )
                                    }
                                  >
                                    <HandCoins aria-hidden="true" />
                                    <span>
                                      <strong>Terceirizada</strong>
                                      <small>
                                        Valor combinado e pago pela cliente.
                                      </small>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={
                                      deliveryArrangement ===
                                      "integrated_partner"
                                    }
                                    disabled
                                  >
                                    <Link2 aria-hidden="true" />
                                    <span>
                                      <strong>Plataforma integrada</strong>
                                      <small>
                                        iFood ou similar · nenhuma conectada.
                                      </small>
                                    </span>
                                  </button>
                                </div>
                              </fieldset>

                              {selectedCustomer.addresses.length > 0 ? (
                                <div className="form-field">
                                  <label htmlFor="order-delivery-address">
                                    Endereço de entrega
                                  </label>
                                  <SearchableCombobox
                                    id="order-delivery-address"
                                    name="customerAddressId"
                                    options={addressOptions}
                                    value={selectedAddress?.id ?? ""}
                                    onValueChange={setCustomerAddressId}
                                    required
                                  />
                                </div>
                              ) : (
                                <div className="order-address-note">
                                  <MapPin aria-hidden="true" />
                                  <div>
                                    <small>Endereço necessário</small>
                                    <strong>
                                      Abra Clientes e guarde um endereço antes
                                      de confirmar a entrega.
                                    </strong>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>

                        {deliveryMode === "delivery" && selectedAddress ? (
                          deliveryArrangement === "own" ? (
                            <div
                              className={`order-delivery-route-card is-${deliveryRoute.status}`}
                            >
                              <aside
                                className={`order-delivery-route is-${deliveryRoute.status}`}
                                aria-live="polite"
                                aria-atomic="true"
                                aria-busy={deliveryRoute.status === "loading"}
                              >
                                {deliveryRoute.status === "loading" ? (
                                  <>
                                    <LoaderCircle
                                      className="is-spinning"
                                      aria-hidden="true"
                                    />
                                    <div>
                                      <strong>Calculando o caminho…</strong>
                                      <span>
                                        Saída da confeitaria até{" "}
                                        {selectedAddress.label}.
                                      </span>
                                    </div>
                                  </>
                                ) : deliveryRoute.status === "success" ? (
                                  <>
                                    <Route aria-hidden="true" />
                                    <div>
                                      <strong>
                                        {decimal.format(
                                          deliveryRoute.quote.distanceKm,
                                        )}{" "}
                                        km · cerca de{" "}
                                        {deliveryRoute.quote.durationMinutes}{" "}
                                        min
                                      </strong>
                                      <span>
                                        {money.format(
                                          deliveryRoute.quote.deliveryCost,
                                        )}{" "}
                                        de entrega ·{" "}
                                        {money.format(
                                          deliveryRoute.quote.costPerKm,
                                        )}{" "}
                                        por km
                                      </span>
                                    </div>
                                    <small
                                      className="google-maps-attribution"
                                      translate="no"
                                    >
                                      Google Maps
                                    </small>
                                  </>
                                ) : deliveryRoute.status === "error" ? (
                                  <>
                                    <MapPin aria-hidden="true" />
                                    <div>
                                      <strong>Entrega ainda sem cálculo</strong>
                                      <span>{deliveryRoute.message}</span>
                                    </div>
                                    {settings.integrations
                                      .googleMapsRoutesEnabled ? (
                                      <button
                                        className="quiet-action"
                                        type="button"
                                        onClick={() =>
                                          setDeliveryRouteAttempt(
                                            (current) => current + 1,
                                          )
                                        }
                                      >
                                        Tentar novamente
                                      </button>
                                    ) : null}
                                  </>
                                ) : null}
                              </aside>

                              {deliveryRoute.status === "loading" ? (
                                <div
                                  className="order-route-map is-loading"
                                  aria-hidden="true"
                                >
                                  <LoaderCircle className="is-spinning" />
                                </div>
                              ) : deliveryRoute.status === "success" ? (
                                deliveryRoute.quote.mapImageDataUrl ? (
                                  <figure className="order-route-map">
                                    <Image
                                      src={deliveryRoute.quote.mapImageDataUrl}
                                      width={1280}
                                      height={560}
                                      sizes="(max-width: 720px) 100vw, 640px"
                                      alt={`Mapa do trajeto da confeitaria até ${selectedAddress.label}, com percurso de ${decimal.format(deliveryRoute.quote.distanceKm)} quilômetros.`}
                                      unoptimized
                                    />
                                    <figcaption>
                                      Trajeto até {selectedAddress.label}
                                    </figcaption>
                                  </figure>
                                ) : (
                                  <div className="order-route-map-unavailable">
                                    <MapPin aria-hidden="true" />
                                    <span>
                                      O trajeto está calculado, mas o mapa não
                                      está disponível agora.
                                    </span>
                                  </div>
                                )
                              ) : null}
                            </div>
                          ) : (
                            <aside
                              className="order-delivery-arrangement-summary"
                              aria-live="polite"
                            >
                              <HandCoins aria-hidden="true" />
                              <div>
                                <small>Entrega terceirizada</small>
                                <strong>
                                  A cliente combina e paga diretamente.
                                </strong>
                                <p>
                                  A Zucchero guarda o endereço, mas não inclui
                                  esse valor nos custos nem no preço sugerido.
                                </p>
                              </div>
                            </aside>
                          )
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  {step === 2 ? (
                    <section aria-labelledby="order-item-title">
                      <div className="order-section-head">
                        <div>
                          <p className="eyebrow">O que foi pedido</p>
                          <h3 id="order-item-title" tabIndex={-1}>
                            Qual preparo e qual tamanho?
                          </h3>
                          <p>
                            A versão publicada e o fator calculado ficam
                            preservados nesta encomenda.
                          </p>
                        </div>
                        <NotebookTabs aria-hidden="true" />
                      </div>

                      <div className="form-grid order-item-grid">
                        <div className="form-field form-field-wide">
                          <label htmlFor="order-recipe">Receita</label>
                          <SearchableCombobox
                            id="order-recipe"
                            name="recipeId"
                            options={recipeOptions}
                            value={recipeId}
                            onValueChange={setRecipeId}
                            required
                          />
                        </div>
                        <div className="order-item-columns form-field-wide">
                          <div className="order-item-primary">
                            <div className="form-field">
                              <label htmlFor="order-mass">Peso combinado</label>
                              <NumberField
                                id="order-mass"
                                name="requestedMassG"
                                value={requestedMassG}
                                onValueChange={setRequestedMassG}
                                min={100}
                                step={50}
                                integerOnly
                                suffix="g"
                                required
                              />
                              <small>
                                Arredondamos a produção para blocos de 50 g.
                              </small>
                            </div>
                            <div className="form-field">
                              <label htmlFor="delivery-date">
                                Data combinada
                              </label>
                              <DatePicker
                                id="delivery-date"
                                name="deliveryDate"
                                defaultValue={deliveryDate}
                                onValueChange={setDeliveryDate}
                                required
                              />
                            </div>
                            <div className="form-field">
                              <label htmlFor="delivery-time">Horário</label>
                              <TimePicker
                                id="delivery-time"
                                name="deliveryTime"
                                value={deliveryTime}
                                onValueChange={setDeliveryTime}
                                required
                              />
                            </div>
                          </div>
                          <div className="form-field order-item-note">
                            <label htmlFor="order-note">
                              Detalhes da cliente
                            </label>
                            <TextAreaField
                              id="order-note"
                              name="orderNote"
                              placeholder="Ex.: acabamento delicado, vela separada"
                              value={orderNote}
                              onValueChange={setOrderNote}
                              maxLength={500}
                            />
                          </div>
                        </div>
                      </div>

                      <aside className="order-scale-note" aria-live="polite">
                        <span>
                          <small>Versão preservada</small>
                          <strong>v{quote.recipeVersionNumber}</strong>
                        </span>
                        <span>
                          <small>Fator da receita</small>
                          <strong>{decimal.format(quote.scaleFactor)}×</strong>
                        </span>
                        <span>
                          <small>Produção planejada</small>
                          <strong>
                            {mass.format(quote.productionMassG)} g
                          </strong>
                        </span>
                        <span>
                          <small>Sobra técnica</small>
                          <strong>
                            {mass.format(quote.technicalSurplusG)} g
                          </strong>
                        </span>
                      </aside>
                    </section>
                  ) : null}

                  {step === 3 ? (
                    <section aria-labelledby="order-stock-title">
                      <div className="order-section-head">
                        <div>
                          <p className="eyebrow">Antes de confirmar</p>
                          <h3 id="order-stock-title" tabIndex={-1}>
                            A despensa dá conta?
                          </h3>
                          <p>
                            Quantidades já incluem a perda prevista da versão da
                            receita.
                          </p>
                        </div>
                        <ShoppingBasket aria-hidden="true" />
                      </div>

                      <div
                        className={`order-availability-summary is-${quote.availability}`}
                        role="status"
                      >
                        <AvailabilityIcon status={quote.availability} />
                        <div>
                          <small>Leitura desta encomenda</small>
                          <strong>
                            {availabilityLabels[quote.availability]}
                          </strong>
                          <span>
                            {purchaseNeeds.length > 0
                              ? "A produção pode ser planejada; a falta será levada para compras ao confirmar."
                              : quote.availability === "substitution"
                                ? "Há quantidade suficiente usando um produto equivalente."
                                : "Os ingredientes conhecidos estão disponíveis."}
                          </span>
                        </div>
                      </div>

                      <div className="order-ingredient-needs">
                        {quote.ingredients.map((ingredient) => (
                          <article
                            key={ingredient.ingredientGroupId}
                            className={`is-${ingredient.status}`}
                          >
                            <AvailabilityIcon status={ingredient.status} />
                            <div>
                              <h4>{ingredient.ingredientName}</h4>
                              <p>
                                Precisa {mass.format(ingredient.requiredG)} g ·
                                há {mass.format(ingredient.availableG)} g
                              </p>
                              {ingredient.shortageG > 0 ? (
                                <small>
                                  Comprar {ingredient.packagesToBuy} embalagem
                                  {ingredient.packagesToBuy > 1
                                    ? "s"
                                    : ""} de{" "}
                                  {ingredient.purchaseItemName ??
                                    "um produto conhecido"}
                                  {ingredient.packageContentG
                                    ? ` · entram ${mass.format(ingredient.purchaseQuantityG)} g`
                                    : ""}
                                </small>
                              ) : ingredient.status === "substitution" ? (
                                <small>
                                  O produto preferido não cobre tudo; um
                                  equivalente completa a quantidade.
                                </small>
                              ) : (
                                <small>
                                  Nenhuma compra para este ingrediente.
                                </small>
                              )}
                            </div>
                            <strong>
                              {availabilityLabels[ingredient.status]}
                            </strong>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {step === 4 ? (
                    <section aria-labelledby="order-price-title">
                      <div className="order-section-head">
                        <div>
                          <p className="eyebrow">Preço com clareza</p>
                          <h3 id="order-price-title" tabIndex={-1}>
                            Quanto precisa voltar?
                          </h3>
                          <p>
                            A margem é o conceito principal. Markup aparece
                            apenas como apoio.
                          </p>
                        </div>
                        <Coins aria-hidden="true" />
                      </div>

                      <div className="order-price-layout">
                        <div className="order-price-inputs">
                          <div className="order-price-field-row">
                            <div className="form-field">
                              <label htmlFor="order-additional-cost">
                                Embalagem e outros custos
                              </label>
                              <NumberField
                                id="order-additional-cost"
                                name="additionalCost"
                                value={additionalCost}
                                onValueChange={setAdditionalCost}
                                min={0}
                                step={1}
                                prefix="R$"
                              />
                            </div>
                            <div className="form-field">
                              <label htmlFor="order-margin">
                                Margem desejada
                              </label>
                              <NumberField
                                id="order-margin"
                                name="targetMargin"
                                value={targetMargin}
                                onValueChange={setTargetMargin}
                                min={0}
                                max={90}
                                step={1}
                                suffix="%"
                              />
                            </div>
                          </div>
                          <div className="order-price-field-row">
                            <div className="form-field">
                              <label htmlFor="order-deposit">
                                Sinal combinado
                              </label>
                              <NumberField
                                id="order-deposit"
                                name="depositPercentage"
                                value={depositPercentage}
                                onValueChange={setDepositPercentage}
                                min={0}
                                max={100}
                                step={10}
                                suffix="%"
                              />
                            </div>
                            <div className="form-field">
                              <label htmlFor="order-payment">
                                Forma de pagamento
                              </label>
                              <SearchableCombobox
                                id="order-payment"
                                name="paymentMethod"
                                options={paymentOptions}
                                value={paymentMethod}
                                onValueChange={setPaymentMethod}
                              />
                            </div>
                          </div>
                          {deliveryMode === "delivery" ? (
                            <div
                              className="order-delivery-cost-line"
                              role="status"
                            >
                              <Route aria-hidden="true" />
                              <span>
                                <small>
                                  {ownDeliverySelected
                                    ? "Entrega calculada"
                                    : "Entrega terceirizada"}
                                </small>
                                <strong>
                                  {ownDeliverySelected
                                    ? deliveryRoute.status === "success"
                                      ? `${decimal.format(deliveryRoute.quote.distanceKm)} km · ${money.format(quote.deliveryCost)}`
                                      : deliveryQuoteRequired
                                        ? "Aguardando uma rota válida"
                                        : "Sem cobrança automática"
                                    : "Valor combinado e pago pela cliente"}
                                </strong>
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <aside className="order-price-card" aria-live="polite">
                          <p>Preço sugerido para a cliente</p>
                          <strong>{money.format(quote.suggestedPrice)}</strong>
                          <dl>
                            <div>
                              <dt>Ingredientes</dt>
                              <dd>{money.format(quote.ingredientCost)}</dd>
                            </div>
                            <div>
                              <dt>Outros custos</dt>
                              <dd>{money.format(quote.additionalCost)}</dd>
                            </div>
                            {deliveryMode === "delivery" ? (
                              <div>
                                <dt>Entrega</dt>
                                <dd>
                                  {ownDeliverySelected
                                    ? money.format(quote.deliveryCost)
                                    : "Fora do pedido"}
                                </dd>
                              </div>
                            ) : null}
                            <div>
                              <dt>Custo total</dt>
                              <dd>{money.format(quote.totalCost)}</dd>
                            </div>
                            <div>
                              <dt>Lucro estimado</dt>
                              <dd>{money.format(quote.estimatedProfit)}</dd>
                            </div>
                          </dl>
                          <span>
                            Margem{" "}
                            {decimal.format(quote.targetMarginPercentage)}% ·
                            markup {decimal.format(quote.markup)}×
                          </span>
                          <small>
                            Sinal de{" "}
                            {money.format(
                              quote.suggestedPrice *
                                ((Number(depositPercentage) || 0) / 100),
                            )}
                          </small>
                        </aside>
                      </div>
                    </section>
                  ) : null}
                </div>

                {actionState.status === "error" ? (
                  <p className="form-message is-error" role="alert">
                    {actionState.message}
                  </p>
                ) : null}

                <div className="order-workbench-actions">
                  <button
                    className="quiet-action"
                    type="button"
                    disabled={stepTransitioning}
                    onClick={() =>
                      step === 1 ? closeCreateOrder() : goToOrderStep(step - 1)
                    }
                  >
                    {step === 1 ? "Cancelar" : "Voltar"}
                  </button>
                  {step < 4 ? (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => goToOrderStep(step + 1)}
                      disabled={
                        stepTransitioning ||
                        quote.productionMassG <= 0 ||
                        (step === 1 && !customerReady)
                      }
                    >
                      {steps[step]}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={pending || stepTransitioning}
                    >
                      <Check aria-hidden="true" />
                      {pending ? "Confirmando…" : "Confirmar encomenda"}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </dialog>
      ) : null}

      <>
        <div className="summary-line" aria-label="Resumo dos pedidos">
          <span>
            <strong>{actionState.workspace.summary.activeCount}</strong> pedidos
            em aberto
          </span>
          <span>
            <strong>{actionState.workspace.summary.inProductionCount}</strong>{" "}
            em produção
          </span>
          <span>
            <strong>{actionState.workspace.summary.readyCount}</strong> prontos
          </span>
          <span>
            <strong>
              {actionState.workspace.summary.purchasePendingCount}
            </strong>{" "}
            com compras pendentes
          </span>
        </div>

        <section className="order-list" aria-labelledby="open-orders-title">
          <div className="section-head">
            <h2 id="open-orders-title">Próximos combinados</h2>
            <span>Por data de entrega</span>
          </div>

          {activeOrders.map((order) => {
            const date = orderDateParts(order.deliveryAt);
            return (
              <button
                className="order-card order-card-trigger"
                key={order.id}
                type="button"
                onClick={() => openOrder(order)}
                aria-label={`Abrir pedido ${order.orderNumber}, ${order.recipeName} para ${order.customerName}`}
              >
                <div className="order-card-date">
                  <CalendarClock aria-hidden="true" />
                  <span>{date.label}</span>
                  <small>{date.time}</small>
                </div>
                <div className="order-card-copy">
                  <span className="order-card-number">
                    Pedido #{order.orderNumber}
                  </span>
                  <h3>
                    {order.recipeName} para {order.customerName}
                  </h3>
                  <p>
                    {mass.format(order.requestedMassG)} g · versão{" "}
                    {order.recipeVersionNumber} preservada ·{" "}
                    {order.deliveryMode === "delivery"
                      ? deliveryArrangementLabels[
                          order.deliveryArrangement ?? "own"
                        ].toLocaleLowerCase("pt-BR")
                      : "retirada"}
                  </p>
                </div>
                <div className="order-card-price">
                  <strong>{money.format(order.price)}</strong>
                  <span className={`is-${order.status}`}>
                    {lifecycleLabels[order.status]}
                  </span>
                </div>
              </button>
            );
          })}

          {activeOrders.length === 0 ? (
            <div className="order-empty-state">
              <CircleCheck aria-hidden="true" />
              <div>
                <h3>A bancada está livre.</h3>
                <p>Quando uma encomenda for confirmada, ela aparece aqui.</p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={startOrder}
              >
                <Plus aria-hidden="true" />
                {NEW_ORDER_LABEL}
              </button>
            </div>
          ) : null}
        </section>

        {closedOrders.length > 0 ? (
          <section
            className="order-list order-history"
            aria-labelledby="closed-orders-title"
          >
            <div className="section-head">
              <h2 id="closed-orders-title">Histórico recente</h2>
              <span>Combinados já encerrados</span>
            </div>
            {closedOrders.map((order) => {
              const date = orderDateParts(order.deliveryAt);
              return (
                <button
                  className="order-card order-card-trigger"
                  key={order.id}
                  type="button"
                  onClick={() => openOrder(order)}
                >
                  <div className="order-card-date">
                    <CalendarClock aria-hidden="true" />
                    <span>{date.label}</span>
                    <small>{date.time}</small>
                  </div>
                  <div className="order-card-copy">
                    <span className="order-card-number">
                      Pedido #{order.orderNumber}
                    </span>
                    <h3>
                      {order.recipeName} para {order.customerName}
                    </h3>
                    <p>{mass.format(order.requestedMassG)} g</p>
                  </div>
                  <div className="order-card-price">
                    <strong>{money.format(order.price)}</strong>
                    <span className={`is-${order.status}`}>
                      {lifecycleLabels[order.status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </section>
        ) : null}
      </>

      <dialog
        className="purchase-dialog order-detail-dialog"
        ref={orderDialogRef}
        aria-labelledby="order-detail-title"
        onCancel={() => {
          setCancelling(false);
          setCancellationReason("");
        }}
      >
        <div className="purchase-panel order-detail-panel">
          <ModalGlassHeader
            title={
              selectedOrder
                ? `Pedido #${selectedOrder.orderNumber}`
                : "Detalhes do pedido"
            }
            eyebrow={
              selectedOrder ? lifecycleLabels[selectedOrder.status] : undefined
            }
            closeLabel="Fechar detalhes do pedido"
            onClose={() => orderDialogRef.current?.close()}
          />
          <div
            className="purchase-panel-scroll order-detail-scroll"
            ref={orderDialogScrollRef}
          >
            {selectedOrder ? (
              <>
                <header className="order-detail-head">
                  <p className="eyebrow">
                    Pedido #{selectedOrder.orderNumber} ·{" "}
                    {lifecycleLabels[selectedOrder.status]}
                  </p>
                  <h2 id="order-detail-title">
                    {selectedOrder.recipeName} para {selectedOrder.customerName}
                  </h2>
                  <p>
                    A receita preservada, o combinado e o momento da produção
                    continuam reunidos aqui.
                  </p>
                </header>

                <div className="order-detail-facts">
                  <span>
                    <small>Entrega</small>
                    <strong>
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(selectedOrder.deliveryAt))}
                    </strong>
                  </span>
                  <span>
                    <small>Peso</small>
                    <strong>
                      {mass.format(selectedOrder.requestedMassG)} g
                    </strong>
                  </span>
                  <span>
                    <small>Valor</small>
                    <strong>{money.format(selectedOrder.price)}</strong>
                  </span>
                  <span>
                    <small>Modalidade</small>
                    <strong>
                      {selectedOrder.deliveryMode === "delivery"
                        ? deliveryArrangementLabels[
                            selectedOrder.deliveryArrangement ?? "own"
                          ]
                        : "Retirada"}
                    </strong>
                  </span>
                </div>

                {selectedOrder.status === "cancelled" ? (
                  <div className="order-cancelled-note">
                    <Ban aria-hidden="true" />
                    <div>
                      <strong>Pedido cancelado</strong>
                      <p>
                        {selectedOrder.cancellationReason ??
                          "As reservas de estoque foram liberadas."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ol
                    className="order-lifecycle"
                    aria-label={`Andamento do pedido: ${lifecycleLabels[selectedOrder.status]}`}
                  >
                    {lifecycleSteps.map((item, index) => {
                      const currentIndex = lifecycleSteps.findIndex(
                        (stepItem) => stepItem.status === selectedOrder.status,
                      );
                      const complete = index < currentIndex;
                      const current = index === currentIndex;
                      return (
                        <li
                          key={item.status}
                          className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`}
                          aria-current={current ? "step" : undefined}
                        >
                          <span>
                            {complete ? (
                              <Check aria-hidden="true" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <small>{item.label}</small>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {selectedOrder.purchaseNeedCount > 0 &&
                selectedOrder.status !== "cancelled" &&
                selectedOrder.status !== "completed" ? (
                  <p className="order-purchase-note">
                    <ShoppingBasket aria-hidden="true" />
                    {selectedOrder.purchaseNeedCount} item
                    {selectedOrder.purchaseNeedCount > 1 ? "s" : ""} ainda na
                    lista de compras.
                  </p>
                ) : null}

                {selectedOrder.productionVariance ? (
                  <section
                    className={`order-production-variance is-${selectedOrder.productionVariance.status}`}
                    aria-labelledby="order-production-variance-title"
                  >
                    <div className="order-production-variance-head">
                      <Scale aria-hidden="true" />
                      <div>
                        <p className="eyebrow">Receita x bancada</p>
                        <h3 id="order-production-variance-title">
                          {orderVarianceLabel(selectedOrder.productionVariance)}
                        </h3>
                        <p>
                          {selectedOrder.productionVariance.complete
                            ? "Todos os ingredientes deste pedido já foram apontados."
                            : `${selectedOrder.productionVariance.confirmedLineCount} de ${selectedOrder.productionVariance.totalLineCount} ingredientes apontados até agora.`}
                        </p>
                      </div>
                    </div>
                    <dl className="order-production-variance-metrics">
                      <div>
                        <dt>Previsto</dt>
                        <dd>
                          {mass.format(
                            selectedOrder.productionVariance.plannedG,
                          )}{" "}
                          g
                        </dd>
                      </div>
                      <div>
                        <dt>Usado</dt>
                        <dd>
                          {mass.format(
                            selectedOrder.productionVariance.actualUsedG,
                          )}{" "}
                          g
                        </dd>
                      </div>
                      <div>
                        <dt>Perda</dt>
                        <dd>
                          {mass.format(selectedOrder.productionVariance.lossG)}{" "}
                          g
                        </dd>
                      </div>
                      <div>
                        <dt>Diferença</dt>
                        <dd>
                          {selectedOrder.productionVariance.deltaG > 0
                            ? "+"
                            : ""}
                          {mass.format(selectedOrder.productionVariance.deltaG)}{" "}
                          g
                        </dd>
                      </div>
                    </dl>
                  </section>
                ) : null}

                <section
                  className={`order-cost-result is-${selectedOrder.costResult.status} is-${selectedOrder.costResult.costVarianceStatus ?? "pending"}`}
                  aria-labelledby="order-cost-result-title"
                >
                  <div className="order-cost-result-head">
                    <Coins aria-hidden="true" />
                    <div>
                      <p className="eyebrow">Resultado do pedido</p>
                      <h3 id="order-cost-result-title">
                        {orderCostResultTitle(selectedOrder.costResult)}
                      </h3>
                      <p>
                        {orderCostResultDescription(selectedOrder.costResult)}
                      </p>
                    </div>
                  </div>

                  {selectedOrder.costResult.status === "complete" &&
                  selectedOrder.costResult.realizedTotalCost !== null ? (
                    <div
                      className="order-cost-comparison"
                      role="img"
                      aria-label={`Custo previsto ${money.format(selectedOrder.costResult.estimatedTotalCost)}. Custo realizado ${money.format(selectedOrder.costResult.realizedTotalCost)}.`}
                    >
                      <div>
                        <span>
                          <small>Previsto</small>
                          <strong>
                            {money.format(
                              selectedOrder.costResult.estimatedTotalCost,
                            )}
                          </strong>
                        </span>
                        <i aria-hidden="true">
                          <b
                            style={{
                              width: costBarWidth(
                                selectedOrder.costResult.estimatedTotalCost,
                                selectedOrder.costResult,
                              ),
                            }}
                          />
                        </i>
                      </div>
                      <div>
                        <span>
                          <small>Na bancada</small>
                          <strong>
                            {money.format(
                              selectedOrder.costResult.realizedTotalCost,
                            )}
                          </strong>
                        </span>
                        <i aria-hidden="true">
                          <b
                            style={{
                              width: costBarWidth(
                                selectedOrder.costResult.realizedTotalCost,
                                selectedOrder.costResult,
                              ),
                            }}
                          />
                        </i>
                      </div>
                    </div>
                  ) : (
                    <dl className="order-cost-pending-values">
                      <div>
                        <dt>Custo previsto</dt>
                        <dd>
                          {money.format(
                            selectedOrder.costResult.estimatedTotalCost,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Insumos já apurados</dt>
                        <dd>
                          {money.format(
                            selectedOrder.costResult.realizedIngredientCost,
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}

                  <p className="order-cost-additional-note">
                    O orçamento reservou{" "}
                    {money.format(selectedOrder.costResult.additionalCost)} para
                    embalagem, entrega e outros gastos
                    {selectedOrder.deliveryCost > 0
                      ? ` — ${money.format(selectedOrder.deliveryCost)} vieram do cálculo da entrega.`
                      : "."}{" "}
                    Depois das conferências, o custo reconhecido nessa parte é{" "}
                    {money.format(
                      selectedOrder.costResult.realizedAdditionalCost,
                    )}
                    {selectedOrder.costResult.paymentFee > 0
                      ? `, além de ${money.format(selectedOrder.costResult.paymentFee)} em taxas de recebimento.`
                      : "."}
                  </p>

                  {selectedOrder.costResult.status !== "cancelled" ? (
                    <dl className="order-cost-outcome">
                      <div>
                        <dt>Valor do pedido</dt>
                        <dd>{money.format(selectedOrder.costResult.price)}</dd>
                      </div>
                      <div>
                        <dt>
                          {selectedOrder.costResult.status === "complete"
                            ? "Lucro realizado"
                            : "Lucro previsto"}
                        </dt>
                        <dd>
                          {money.format(
                            selectedOrder.costResult.realizedProfit ??
                              selectedOrder.costResult.estimatedProfit,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          {selectedOrder.costResult.status === "complete"
                            ? "Margem real"
                            : "Margem prevista"}
                        </dt>
                        <dd>
                          {decimal.format(
                            selectedOrder.costResult.realizedMarginPercentage ??
                              selectedOrder.costResult
                                .estimatedMarginPercentage,
                          )}
                          %
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </section>

                <section
                  className="order-direct-expenses"
                  aria-labelledby="order-direct-expenses-title"
                >
                  <div className="order-direct-expenses-head">
                    <ReceiptText aria-hidden="true" />
                    <div>
                      <p className="eyebrow">Além dos ingredientes</p>
                      <h3 id="order-direct-expenses-title">
                        Custos que acompanharam esta encomenda
                      </h3>
                      <p>
                        Confira embalagem, entrega ou outro gasto real sem
                        contar duas vezes o que já estava no orçamento.
                      </p>
                    </div>
                  </div>

                  <dl className="order-direct-expense-summary">
                    <div>
                      <dt>Reservado no orçamento</dt>
                      <dd>
                        {money.format(
                          selectedOrder.directExpenseResult.estimatedBase,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Gastos conferidos</dt>
                      <dd>
                        {money.format(
                          selectedOrder.directExpenseResult.actualRegistered,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Efeito no custo</dt>
                      <dd>
                        {selectedOrder.directExpenseResult.adjustment > 0
                          ? "+"
                          : ""}
                        {money.format(
                          selectedOrder.directExpenseResult.adjustment,
                        )}
                      </dd>
                    </div>
                  </dl>

                  {selectedOrder.directExpenseResult.remainingEstimate > 0 ? (
                    <p className="order-direct-expense-note">
                      {money.format(
                        selectedOrder.directExpenseResult.remainingEstimate,
                      )}{" "}
                      do valor reservado ainda não foi ligado a um gasto
                      específico. Ele continua preservado no custo do pedido.
                    </p>
                  ) : (
                    <p className="order-direct-expense-note">
                      Todo o valor reservado já foi confrontado com gastos
                      reais.
                    </p>
                  )}

                  {selectedOrder.directExpenseResult.entries.length > 0 ? (
                    <div className="order-direct-expense-history">
                      <p>Gastos registrados</p>
                      <ul>
                        {selectedOrder.directExpenseResult.entries.map(
                          (expense) => (
                            <li
                              key={expense.id}
                              className={
                                expense.reversedAt ? "is-reversed" : ""
                              }
                            >
                              <div>
                                <span>
                                  {directExpenseCategoryLabel(expense.category)}
                                </span>
                                <strong>{expense.description}</strong>
                                <small>
                                  {money.format(expense.actualAmount)} ·{" "}
                                  {expense.estimatedAmount > 0
                                    ? expense.adjustment === 0
                                      ? "como previsto"
                                      : `${money.format(Math.abs(expense.adjustment))} ${expense.adjustment > 0 ? "acima" : "abaixo"} do previsto`
                                    : "não previsto"}
                                  {" · "}
                                  {new Intl.DateTimeFormat("pt-BR", {
                                    timeZone: "UTC",
                                  }).format(
                                    new Date(`${expense.incurredAt}T12:00:00Z`),
                                  )}
                                </small>
                                {expense.note ? (
                                  <small>{expense.note}</small>
                                ) : null}
                                {expense.reversedAt ? (
                                  <small>
                                    Estornado · {expense.reversalReason}
                                  </small>
                                ) : null}
                              </div>
                              {!expense.reversedAt ? (
                                <button
                                  type="button"
                                  className="quiet-action"
                                  aria-expanded={
                                    reversingExpenseId === expense.id
                                  }
                                  onClick={() => {
                                    setAddingExpense(false);
                                    setReversingExpenseId((current) =>
                                      current === expense.id
                                        ? null
                                        : expense.id,
                                    );
                                    setExpenseReversalReason("");
                                  }}
                                >
                                  <Undo2 aria-hidden="true" />
                                  Estornar
                                </button>
                              ) : null}
                              {reversingExpenseId === expense.id ? (
                                <form
                                  action={formAction}
                                  className="order-expense-reversal-form"
                                >
                                  <input
                                    type="hidden"
                                    name="operation"
                                    value="direct_expense_reversal"
                                  />
                                  <input
                                    type="hidden"
                                    name="orderId"
                                    value={selectedOrder.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="expenseId"
                                    value={expense.id}
                                  />
                                  <label
                                    htmlFor={`expense-reversal-${expense.id}`}
                                  >
                                    Por que este gasto será estornado?
                                  </label>
                                  <input
                                    id={`expense-reversal-${expense.id}`}
                                    name="reason"
                                    value={expenseReversalReason}
                                    onChange={(event) =>
                                      setExpenseReversalReason(
                                        event.target.value,
                                      )
                                    }
                                    minLength={5}
                                    maxLength={500}
                                    placeholder="Ex.: compra devolvida ao fornecedor"
                                    required
                                  />
                                  <div>
                                    <button
                                      type="button"
                                      className="quiet-action"
                                      onClick={() =>
                                        setReversingExpenseId(null)
                                      }
                                    >
                                      Manter gasto
                                    </button>
                                    <button
                                      type="submit"
                                      className="button button-secondary"
                                      disabled={
                                        pending ||
                                        expenseReversalReason.length < 5
                                      }
                                    >
                                      <Undo2 aria-hidden="true" />
                                      {pending
                                        ? "Estornando…"
                                        : "Confirmar estorno"}
                                    </button>
                                  </div>
                                </form>
                              ) : null}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  ) : null}

                  {addingExpense ? (
                    <form
                      action={formAction}
                      className="order-direct-expense-form"
                    >
                      <input
                        type="hidden"
                        name="operation"
                        value="direct_expense"
                      />
                      <input
                        type="hidden"
                        name="orderId"
                        value={selectedOrder.id}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={expenseIdempotencyKey}
                      />
                      <input
                        type="hidden"
                        name="incurredAt"
                        value={expenseDate}
                      />
                      <input
                        type="hidden"
                        name="estimatedAmount"
                        value={
                          expenseWasEstimated ? expenseEstimatedAmount : "0"
                        }
                      />
                      <div className="order-direct-expense-fields">
                        <div className="form-field">
                          <label htmlFor="expense-category">
                            Tipo de gasto
                          </label>
                          <SearchableCombobox
                            id="expense-category"
                            name="category"
                            options={directExpenseOptions}
                            value={expenseCategory}
                            onValueChange={setExpenseCategory}
                            required
                          />
                        </div>
                        <div className="form-field">
                          <label htmlFor="expense-description">
                            O que foi?
                          </label>
                          <input
                            id="expense-description"
                            name="description"
                            value={expenseDescription}
                            onChange={(event) =>
                              setExpenseDescription(event.target.value)
                            }
                            maxLength={160}
                            placeholder="Ex.: entrega por aplicativo"
                            required
                          />
                        </div>
                        <div className="form-field">
                          <label htmlFor="expense-actual">Quanto custou?</label>
                          <NumberField
                            id="expense-actual"
                            name="actualAmount"
                            prefix="R$"
                            min={0.01}
                            step={0.01}
                            value={expenseActualAmount}
                            onValueChange={setExpenseActualAmount}
                            required
                          />
                        </div>
                        <div className="form-field">
                          <label htmlFor="expense-date">
                            Quando aconteceu?
                          </label>
                          <DatePicker
                            key={expenseIdempotencyKey}
                            id="expense-date"
                            name="expenseDate"
                            defaultValue={expenseDate}
                            onValueChange={setExpenseDate}
                            required
                          />
                        </div>
                      </div>

                      <fieldset className="expense-estimate-choice">
                        <legend>Esse gasto já estava no orçamento?</legend>
                        <div>
                          <button
                            type="button"
                            aria-pressed={expenseWasEstimated}
                            onClick={() => setExpenseWasEstimated(true)}
                          >
                            Sim, já estava
                          </button>
                          <button
                            type="button"
                            aria-pressed={!expenseWasEstimated}
                            onClick={() => {
                              setExpenseWasEstimated(false);
                              setExpenseEstimatedAmount("");
                            }}
                          >
                            Não, surgiu depois
                          </button>
                        </div>
                      </fieldset>

                      {expenseWasEstimated ? (
                        <div className="form-field">
                          <label htmlFor="expense-estimated">
                            Quanto havia sido reservado para isso?
                          </label>
                          <NumberField
                            id="expense-estimated"
                            name="estimatedAmountVisible"
                            prefix="R$"
                            min={0.01}
                            max={
                              selectedOrder.directExpenseResult
                                .remainingEstimate
                            }
                            step={0.01}
                            value={expenseEstimatedAmount}
                            onValueChange={setExpenseEstimatedAmount}
                            required
                            ariaDescribedBy="expense-estimated-help"
                          />
                          <small id="expense-estimated-help">
                            Ainda há{" "}
                            {money.format(
                              selectedOrder.directExpenseResult
                                .remainingEstimate,
                            )}{" "}
                            do orçamento disponível para conciliar.
                          </small>
                        </div>
                      ) : null}

                      <div className="form-field">
                        <label htmlFor="expense-note">
                          Observação <span>opcional</span>
                        </label>
                        <input
                          id="expense-note"
                          name="note"
                          value={expenseNote}
                          onChange={(event) =>
                            setExpenseNote(event.target.value)
                          }
                          maxLength={300}
                          placeholder="Ex.: entrega necessária por mudança da cliente"
                        />
                      </div>

                      {actionState.status === "error" &&
                      actionState.operation === "direct_expense" ? (
                        <p className="form-message is-error" role="alert">
                          {actionState.message}
                        </p>
                      ) : null}

                      <div className="order-direct-expense-actions">
                        <button
                          type="button"
                          className="quiet-action"
                          onClick={() => setAddingExpense(false)}
                        >
                          Agora não
                        </button>
                        <button
                          type="submit"
                          className="button button-primary"
                          disabled={
                            pending ||
                            !expenseCategory ||
                            expenseDescription.trim().length < 2 ||
                            Number(expenseActualAmount) <= 0 ||
                            (expenseWasEstimated &&
                              Number(expenseEstimatedAmount) <= 0)
                          }
                        >
                          <ReceiptText aria-hidden="true" />
                          {pending ? "Conferindo…" : "Registrar gasto"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="button button-secondary order-direct-expense-trigger"
                      onClick={() => {
                        setReversingExpenseId(null);
                        setExpenseWasEstimated(
                          selectedOrder.directExpenseResult.remainingEstimate >
                            0,
                        );
                        setAddingExpense(true);
                      }}
                    >
                      <ReceiptText aria-hidden="true" />
                      Conferir um gasto
                    </button>
                  )}
                </section>

                <section
                  className={`order-payment is-${selectedOrder.paymentResult.status}`}
                  aria-labelledby="order-payment-title"
                >
                  <div className="order-payment-head">
                    <CreditCard aria-hidden="true" />
                    <div>
                      <p className="eyebrow">Acerto com a cliente</p>
                      <h3 id="order-payment-title">
                        {selectedOrder.paymentResult.status === "unpaid"
                          ? "Ainda não houve entrada"
                          : selectedOrder.paymentResult.status === "partial"
                            ? "Uma parte já chegou"
                            : selectedOrder.paymentResult.status === "paid"
                              ? "Tudo recebido"
                              : "Há valor recebido a mais"}
                      </h3>
                      <p>
                        O que a cliente pagou fica separado das taxas cobradas
                        pela forma de pagamento.
                      </p>
                    </div>
                  </div>

                  <dl className="order-payment-summary">
                    <div>
                      <dt>Combinado</dt>
                      <dd>{money.format(selectedOrder.paymentResult.price)}</dd>
                    </div>
                    <div>
                      <dt>Já recebido</dt>
                      <dd>
                        {money.format(
                          selectedOrder.paymentResult.grossReceived,
                        )}
                      </dd>
                    </div>
                    <div className="is-balance">
                      <dt>
                        {selectedOrder.paymentResult.balanceDue > 0
                          ? "Ainda falta"
                          : "Saldo"}
                      </dt>
                      <dd>
                        {money.format(selectedOrder.paymentResult.balanceDue)}
                      </dd>
                    </div>
                  </dl>

                  {selectedOrder.paymentResult.feeTotal > 0 ? (
                    <p className="order-payment-fee-note">
                      Das entradas ativas,{" "}
                      {money.format(selectedOrder.paymentResult.feeTotal)} ficou
                      em taxas. Líquido recebido:{" "}
                      {money.format(selectedOrder.paymentResult.netReceived)}.
                    </p>
                  ) : null}

                  {selectedOrder.paymentResult.receipts.length > 0 ? (
                    <div className="order-receipt-history">
                      <p>Entradas registradas</p>
                      <ul>
                        {selectedOrder.paymentResult.receipts.map((receipt) => (
                          <li
                            key={receipt.id}
                            className={receipt.reversedAt ? "is-reversed" : ""}
                          >
                            <div>
                              <strong>{money.format(receipt.amount)}</strong>
                              <span>
                                {receipt.paymentMethod === "pix"
                                  ? "Pix"
                                  : receipt.paymentMethod === "card"
                                    ? "Cartão"
                                    : "Dinheiro"}
                                {" · "}
                                {new Intl.DateTimeFormat("pt-BR", {
                                  dateStyle: "short",
                                }).format(new Date(receipt.receivedAt))}
                                {receipt.feeAmount > 0
                                  ? ` · taxa ${money.format(receipt.feeAmount)}`
                                  : ""}
                              </span>
                              {receipt.note ? (
                                <small>{receipt.note}</small>
                              ) : null}
                              {receipt.reversedAt ? (
                                <small>
                                  Estornado · {receipt.reversalReason}
                                </small>
                              ) : null}
                            </div>
                            {!receipt.reversedAt ? (
                              <button
                                type="button"
                                className="quiet-action"
                                aria-expanded={
                                  reversingReceiptId === receipt.id
                                }
                                onClick={() => {
                                  setReceiving(false);
                                  setReversingReceiptId((current) =>
                                    current === receipt.id ? null : receipt.id,
                                  );
                                  setReversalReason("");
                                }}
                              >
                                <Undo2 aria-hidden="true" />
                                Estornar
                              </button>
                            ) : null}
                            {reversingReceiptId === receipt.id ? (
                              <form
                                action={formAction}
                                className="order-reversal-form"
                              >
                                <input
                                  type="hidden"
                                  name="operation"
                                  value="receipt_reversal"
                                />
                                <input
                                  type="hidden"
                                  name="orderId"
                                  value={selectedOrder.id}
                                />
                                <input
                                  type="hidden"
                                  name="receiptId"
                                  value={receipt.id}
                                />
                                <label htmlFor={`reversal-${receipt.id}`}>
                                  Por que esta entrada será estornada?
                                </label>
                                <input
                                  id={`reversal-${receipt.id}`}
                                  name="reason"
                                  value={reversalReason}
                                  onChange={(event) =>
                                    setReversalReason(event.target.value)
                                  }
                                  minLength={5}
                                  maxLength={500}
                                  placeholder="Ex.: lançamento duplicado"
                                  required
                                />
                                <div>
                                  <button
                                    type="button"
                                    className="quiet-action"
                                    onClick={() => setReversingReceiptId(null)}
                                  >
                                    Manter entrada
                                  </button>
                                  <button
                                    type="submit"
                                    className="button button-secondary"
                                    disabled={
                                      pending || reversalReason.length < 5
                                    }
                                  >
                                    <Undo2 aria-hidden="true" />
                                    {pending
                                      ? "Estornando…"
                                      : "Confirmar estorno"}
                                  </button>
                                </div>
                              </form>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {selectedOrder.paymentResult.balanceDue > 0 &&
                  selectedOrder.status !== "cancelled" ? (
                    receiving ? (
                      <form action={formAction} className="order-receipt-form">
                        <input type="hidden" name="operation" value="receipt" />
                        <input
                          type="hidden"
                          name="orderId"
                          value={selectedOrder.id}
                        />
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={receiptIdempotencyKey}
                        />
                        <input
                          type="hidden"
                          name="receivedAt"
                          value={`${receiptDate}T12:00:00-03:00`}
                        />
                        <div className="order-receipt-fields">
                          <div className="form-field">
                            <label htmlFor="receipt-amount">
                              Valor recebido
                            </label>
                            <NumberField
                              id="receipt-amount"
                              name="amount"
                              prefix="R$"
                              min={0.01}
                              max={selectedOrder.paymentResult.balanceDue}
                              step={0.01}
                              value={receiptAmount}
                              onValueChange={setReceiptAmount}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor="receipt-method">Forma</label>
                            <SearchableCombobox
                              id="receipt-method"
                              name="paymentMethod"
                              options={paymentOptions}
                              value={receiptMethod}
                              onValueChange={setReceiptMethod}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor="receipt-date">Data</label>
                            <DatePicker
                              key={receiptIdempotencyKey}
                              id="receipt-date"
                              name="receiptDate"
                              defaultValue={receiptDate}
                              onValueChange={setReceiptDate}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor="receipt-fee">
                              Taxa <span>se houver</span>
                            </label>
                            <NumberField
                              id="receipt-fee"
                              name="feeAmount"
                              prefix="R$"
                              min={0}
                              max={Number(receiptAmount) || 0}
                              step={0.01}
                              value={receiptFee}
                              onValueChange={setReceiptFee}
                            />
                          </div>
                        </div>
                        <div className="form-field">
                          <label htmlFor="receipt-note">
                            Observação <span>opcional</span>
                          </label>
                          <input
                            id="receipt-note"
                            name="note"
                            value={receiptNote}
                            onChange={(event) =>
                              setReceiptNote(event.target.value)
                            }
                            maxLength={300}
                            placeholder="Ex.: sinal combinado pelo WhatsApp"
                          />
                        </div>
                        {actionState.status === "error" &&
                        actionState.operation === "receipt" ? (
                          <p className="form-message is-error" role="alert">
                            {actionState.message}
                          </p>
                        ) : null}
                        <div className="order-receipt-actions">
                          <button
                            type="button"
                            className="quiet-action"
                            onClick={() => setReceiving(false)}
                          >
                            Agora não
                          </button>
                          <button
                            type="submit"
                            className="button button-primary"
                            disabled={
                              pending ||
                              !receiptMethod ||
                              Number(receiptAmount) <= 0 ||
                              Number(receiptFee) > Number(receiptAmount)
                            }
                          >
                            <CreditCard aria-hidden="true" />
                            {pending ? "Registrando…" : "Registrar entrada"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="button button-secondary order-receipt-trigger"
                        onClick={() => {
                          setReversingReceiptId(null);
                          setReceiptAmount(
                            String(selectedOrder.paymentResult.balanceDue),
                          );
                          setReceiving(true);
                        }}
                      >
                        <CreditCard aria-hidden="true" />
                        Registrar recebimento
                      </button>
                    )
                  ) : null}
                </section>

                {actionState.status === "error" &&
                (actionState.operation === "status" ||
                  actionState.operation === "replan" ||
                  actionState.operation === "receipt_reversal" ||
                  actionState.operation === "direct_expense_reversal") ? (
                  <p className="form-message is-error" role="alert">
                    {actionState.message}
                  </p>
                ) : null}

                {operationalAccess &&
                (selectedOrder.status === "confirmed" ||
                  selectedOrder.status === "in_production") &&
                replanning ? (
                  <form
                    action={formAction}
                    className="order-replan-form"
                    id="replan-order-form"
                  >
                    <input type="hidden" name="operation" value="replan" />
                    <input
                      type="hidden"
                      name="orderId"
                      value={selectedOrder.id}
                    />
                    <input
                      type="hidden"
                      name="deliveryAt"
                      value={`${replanDate}T${replanTime}:00-03:00`}
                    />
                    <div className="order-replan-copy">
                      <div>
                        <CalendarClock aria-hidden="true" />
                        <div>
                          <strong>Ajustar o combinado</strong>
                          <p>
                            O que já aconteceu permanece intacto. Recalculamos
                            somente as etapas que ainda não começaram.
                          </p>
                        </div>
                      </div>
                      <button
                        className="quiet-action"
                        type="button"
                        onClick={() => setReplanning(false)}
                      >
                        Fechar ajuste
                      </button>
                    </div>
                    <div className="order-replan-fields">
                      <div className="form-field">
                        <label htmlFor="replan-date">Nova data</label>
                        <DatePicker
                          key={selectedOrder.id}
                          id="replan-date"
                          name="replanDate"
                          defaultValue={replanDate}
                          onValueChange={setReplanDate}
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="replan-time">Novo horário</label>
                        <TimePicker
                          id="replan-time"
                          name="replanTime"
                          value={replanTime}
                          onValueChange={setReplanTime}
                          required
                        />
                      </div>
                    </div>
                    <p className="order-replan-impact" aria-live="polite">
                      {describeDeliveryShift(
                        selectedOrder.deliveryAt,
                        `${replanDate}T${replanTime}:00-03:00`,
                      )}
                    </p>
                    <div className="form-field">
                      <label htmlFor="replan-reason">
                        Motivo <span>opcional</span>
                      </label>
                      <input
                        id="replan-reason"
                        name="reason"
                        value={replanReason}
                        onChange={(event) =>
                          setReplanReason(event.target.value)
                        }
                        maxLength={300}
                        placeholder="Ex.: a cliente mudou o horário da festa"
                      />
                    </div>
                    <div className="order-replan-actions">
                      <button
                        className="quiet-action"
                        type="button"
                        onClick={() => setReplanning(false)}
                      >
                        Manter horário atual
                      </button>
                      <button
                        className="button button-primary"
                        type="submit"
                        disabled={pending || !replanDate || !replanTime}
                      >
                        <CalendarClock aria-hidden="true" />
                        {pending ? "Recalculando…" : "Confirmar novo horário"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {operationalAccess &&
                cancellableStatuses.has(selectedOrder.status) ? (
                  <div className="order-detail-actions">
                    <button
                      className="quiet-action order-cancel-trigger"
                      type="button"
                      aria-expanded={cancelling}
                      aria-controls="cancel-order-form"
                      onClick={() => {
                        setReplanning(false);
                        setCancelling((current) => !current);
                      }}
                    >
                      Cancelar pedido
                    </button>
                    <div className="order-detail-primary-actions">
                      {selectedOrder.status === "confirmed" ||
                      selectedOrder.status === "in_production" ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          aria-expanded={replanning}
                          aria-controls="replan-order-form"
                          onClick={() => {
                            setCancelling(false);
                            setReplanning((current) => !current);
                          }}
                        >
                          <CalendarClock aria-hidden="true" />
                          Ajustar entrega
                        </button>
                      ) : null}
                      {nextLifecycleStep[selectedOrder.status] ? (
                        <form action={formAction}>
                          <input
                            type="hidden"
                            name="operation"
                            value="status"
                          />
                          <input
                            type="hidden"
                            name="orderId"
                            value={selectedOrder.id}
                          />
                          <input
                            type="hidden"
                            name="nextStatus"
                            value={
                              nextLifecycleStep[selectedOrder.status]?.status
                            }
                          />
                          <button
                            className="button button-primary"
                            type="submit"
                            disabled={pending}
                          >
                            <Check aria-hidden="true" />
                            {pending
                              ? "Atualizando…"
                              : nextLifecycleStep[selectedOrder.status]?.label}
                          </button>
                        </form>
                      ) : (
                        <Link className="button button-primary" href="/">
                          <NotebookTabs aria-hidden="true" />
                          {selectedOrder.status === "confirmed"
                            ? "Abrir na bancada"
                            : "Continuar na bancada"}
                        </Link>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="order-closed-note">
                    {selectedOrder.status === "completed"
                      ? "A produção está encerrada. Recebimentos e estornos continuam disponíveis no acerto acima."
                      : "O pedido cancelado fica preservado. Entradas existentes ainda podem ser estornadas no acerto acima."}
                  </p>
                )}

                {operationalAccess &&
                cancelling &&
                cancellableStatuses.has(selectedOrder.status) ? (
                  <form
                    action={formAction}
                    className="order-cancel-form"
                    id="cancel-order-form"
                  >
                    <input type="hidden" name="operation" value="status" />
                    <input
                      type="hidden"
                      name="orderId"
                      value={selectedOrder.id}
                    />
                    <input type="hidden" name="nextStatus" value="cancelled" />
                    <label htmlFor="cancellation-reason">
                      Por que este pedido foi cancelado?
                    </label>
                    <TextAreaField
                      id="cancellation-reason"
                      name="cancellationReason"
                      value={cancellationReason}
                      onValueChange={setCancellationReason}
                      minLength={3}
                      maxLength={500}
                      required
                      placeholder="Ex.: a cliente pediu o cancelamento"
                    />
                    <div>
                      <button
                        className="quiet-action"
                        type="button"
                        onClick={() => setCancelling(false)}
                      >
                        Manter pedido
                      </button>
                      <button
                        className="button button-danger"
                        type="submit"
                        disabled={
                          pending || cancellationReason.trim().length < 3
                        }
                      >
                        <Ban aria-hidden="true" />
                        Cancelar e liberar estoque
                      </button>
                    </div>
                  </form>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </dialog>

      <SystemNotifications
        notifications={notifications}
        onDismiss={(id) => {
          lastHandledNotification.current = id;
          setDismissedNotificationId(id);
        }}
      />
    </section>
  );
}
