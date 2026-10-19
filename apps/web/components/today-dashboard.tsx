"use client";

import {
  BookOpenText,
  CalendarCheck2,
  Check,
  CircleDollarSign,
  CirclePause,
  Clock3,
  Layers3,
  LoaderCircle,
  NotebookPen,
  PackageCheck,
  Play,
  Plus,
  RotateCcw,
  Scale,
  ShoppingBasket,
  Timer,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { NEW_ORDER_HREF, NEW_ORDER_LABEL } from "@/lib/order-ui";
import { useActionState, useMemo, useState, type FormEvent } from "react";
import {
  updateProductionTaskAction,
  type ProductionActionState,
} from "@/app/production-actions";
import { NumberField, TextAreaField } from "@/components/form-controls";
import {
  SystemNotifications,
  type SystemNotification,
} from "@/components/system-notifications";
import type { TodayView } from "@/lib/today";

type TodayAttention = {
  id: string;
  tone: "expiry" | "low";
  title: string;
  detail: string;
};

type TodayDelivery = {
  id: string;
  orderNumber: number;
  time: string;
  title: string;
  customerName: string;
  mode: string;
  status: string;
};

type TodayDashboardProps = {
  today: TodayView;
  attention: TodayAttention[];
  deliveries: TodayDelivery[];
  dayPulse: null | {
    orderCount: number;
    expected: number;
    received: number;
    pending: number;
  };
};

const mass = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type CurrentTask = NonNullable<TodayView["currentTask"]>;
type Variance = NonNullable<CurrentTask["consumptionVariance"]>;

function varianceLabel(variance: Variance) {
  if (variance.status === "on_target") return "Dentro do esperado";
  const difference = mass.format(Math.abs(variance.deltaG));
  return variance.status === "above"
    ? `${difference} g além do previsto`
    : `${difference} g abaixo do previsto`;
}

function TaskConsumption({
  task,
  formAction,
  pending,
}: {
  task: CurrentTask;
  formAction: (payload: FormData) => void;
  pending: boolean;
}) {
  const [attempted, setAttempted] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      task.ingredients.map((ingredient) => [
        ingredient.id,
        {
          actualUsedG: String(
            ingredient.consumption?.actualUsedG ??
              Math.min(ingredient.requiredG, ingredient.reservedG),
          ),
          lossG: String(ingredient.consumption?.lossG ?? 0),
        },
      ]),
    ),
  );
  const errors = Object.fromEntries(
    task.ingredients.map((ingredient) => {
      const value = values[ingredient.id];
      const actualUsedG = Number(value?.actualUsedG);
      const lossG = Number(value?.lossG);
      const total = actualUsedG + lossG;
      const message =
        !Number.isFinite(actualUsedG) ||
        !Number.isFinite(lossG) ||
        actualUsedG < 0 ||
        lossG < 0
          ? "Informe valores válidos."
          : !task.consumptionConfirmed && total <= 0
            ? "Registre o que foi usado ou perdido."
            : !task.consumptionConfirmed && total > ingredient.reservedG
              ? `O total não pode ultrapassar ${mass.format(ingredient.reservedG)} g separados.`
              : "";
      return [ingredient.id, message];
    }),
  );
  const hasErrors = Object.values(errors).some(Boolean);
  const hasCorrectionChanges = task.ingredients.some((ingredient) => {
    const value = values[ingredient.id];
    return (
      Math.abs(
        Number(value?.actualUsedG) - (ingredient.consumption?.actualUsedG ?? 0),
      ) > 0.0001 ||
      Math.abs(Number(value?.lossG) - (ingredient.consumption?.lossG ?? 0)) >
        0.0001
    );
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    const correctionInvalid =
      task.consumptionConfirmed &&
      (!hasCorrectionChanges || correctionReason.trim().length < 5);
    if (!hasErrors && !correctionInvalid) return;
    event.preventDefault();
    setAttempted(true);
    if (task.consumptionConfirmed && correctionReason.trim().length < 5) {
      document.getElementById(`correction-reason-${task.id}`)?.focus();
      return;
    }
    const firstInvalidId = task.ingredients.find(
      (ingredient) => errors[ingredient.id],
    )?.id;
    if (firstInvalidId)
      document.getElementById(`actual-used-${firstInvalidId}`)?.focus();
  }

  if (task.consumptionConfirmed) {
    if (correcting) {
      return (
        <form
          action={formAction}
          className="preparation-consumption consumption-correction"
          onSubmit={submit}
          noValidate
        >
          <input
            type="hidden"
            name="operation"
            value="consumption_correction"
          />
          <input type="hidden" name="taskId" value={task.id} />
          <div className="preparation-detail-head">
            <div>
              <span className="preparation-kicker">Correção rastreável</span>
              <h4>O que precisa ficar correto?</h4>
            </div>
            <small>
              O registro anterior permanece no histórico. Só a diferença
              movimenta a despensa.
            </small>
          </div>
          <div className="consumption-lines">
            {task.ingredients.map((ingredient) => {
              const value = values[ingredient.id];
              const error = errors[ingredient.id];
              const errorId = `correction-error-${ingredient.id}`;
              return (
                <fieldset key={ingredient.id}>
                  <input
                    type="hidden"
                    name="requirementId"
                    value={ingredient.id}
                  />
                  <legend>
                    <strong>{ingredient.name}</strong>
                    <span>
                      Antes:{" "}
                      {mass.format(ingredient.consumption?.actualUsedG ?? 0)} g
                      usados · {mass.format(ingredient.consumption?.lossG ?? 0)}{" "}
                      g de perda
                    </span>
                  </legend>
                  <label htmlFor={`corrected-used-${ingredient.id}`}>
                    <span>Usado correto</span>
                    <NumberField
                      id={`corrected-used-${ingredient.id}`}
                      name="actualUsedG"
                      value={value?.actualUsedG ?? ""}
                      onValueChange={(next) =>
                        setValues((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...(current[ingredient.id] ?? {
                              actualUsedG: "",
                              lossG: "",
                            }),
                            actualUsedG: next,
                          },
                        }))
                      }
                      min={0}
                      max={1_000_000}
                      step={1}
                      suffix="g"
                      required
                      ariaDescribedBy={attempted && error ? errorId : undefined}
                    />
                  </label>
                  <label htmlFor={`corrected-loss-${ingredient.id}`}>
                    <span>Perda correta</span>
                    <NumberField
                      id={`corrected-loss-${ingredient.id}`}
                      name="lossG"
                      value={value?.lossG ?? ""}
                      onValueChange={(next) =>
                        setValues((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...(current[ingredient.id] ?? {
                              actualUsedG: "",
                              lossG: "",
                            }),
                            lossG: next,
                          },
                        }))
                      }
                      min={0}
                      max={1_000_000}
                      step={1}
                      suffix="g"
                      required
                      ariaDescribedBy={attempted && error ? errorId : undefined}
                    />
                  </label>
                  {attempted && error ? (
                    <small className="field-error" id={errorId} role="alert">
                      <TriangleAlert aria-hidden="true" />
                      {error}
                    </small>
                  ) : null}
                </fieldset>
              );
            })}
          </div>
          <label
            className="consumption-correction-reason"
            htmlFor={`correction-reason-${task.id}`}
          >
            <span>Por que o apontamento mudou?</span>
            <TextAreaField
              id={`correction-reason-${task.id}`}
              name="correctionReason"
              value={correctionReason}
              onValueChange={setCorrectionReason}
              minLength={5}
              maxLength={500}
              required
              placeholder="Ex.: pesei novamente a sobra e corrigi a quantidade usada"
              ariaDescribedBy={`correction-help-${task.id}`}
            />
            <small id={`correction-help-${task.id}`}>
              O motivo acompanha a revisão na trilha de auditoria.
            </small>
          </label>
          {attempted && !hasCorrectionChanges ? (
            <p className="field-error" role="alert">
              <TriangleAlert aria-hidden="true" />
              Altere ao menos uma quantidade para registrar a correção.
            </p>
          ) : null}
          <div className="consumption-submit">
            <button
              className="quiet-action"
              type="button"
              onClick={() => {
                setAttempted(false);
                setCorrecting(false);
              }}
            >
              Manter apontamento atual
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              {pending ? "Corrigindo..." : "Registrar correção"}
            </button>
          </div>
        </form>
      );
    }
    return (
      <section className="preparation-consumption is-confirmed">
        <div className="preparation-detail-head">
          <div>
            <span className="preparation-kicker">Consumo confirmado</span>
            <h4>O que realmente saiu da despensa</h4>
          </div>
          <Check aria-hidden="true" />
        </div>
        <ul className="consumption-summary">
          {task.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <strong>{ingredient.name}</strong>
              <span>Planejado {mass.format(ingredient.requiredG)} g</span>
              <span>
                Usado {mass.format(ingredient.consumption?.actualUsedG ?? 0)} g
              </span>
              <span>
                Perda {mass.format(ingredient.consumption?.lossG ?? 0)} g
              </span>
              {ingredient.consumption?.variance ? (
                <span
                  className={`consumption-variance-label is-${ingredient.consumption.variance.status}`}
                >
                  {varianceLabel(ingredient.consumption.variance)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {task.consumptionVariance ? (
          <div
            className={`consumption-variance is-${task.consumptionVariance.status}`}
            aria-label={`Comparação entre receita e bancada: ${varianceLabel(task.consumptionVariance)}`}
          >
            <div className="consumption-variance-copy">
              <Scale aria-hidden="true" />
              <div>
                <span className="preparation-kicker">Receita x bancada</span>
                <strong>{varianceLabel(task.consumptionVariance)}</strong>
                <p>
                  O realizado soma o que entrou no preparo e o que foi perdido.
                </p>
              </div>
            </div>
            <dl className="consumption-variance-metrics">
              <div>
                <dt>Previsto</dt>
                <dd>{mass.format(task.consumptionVariance.plannedG)} g</dd>
              </div>
              <div>
                <dt>Usado</dt>
                <dd>{mass.format(task.consumptionVariance.actualUsedG)} g</dd>
              </div>
              <div>
                <dt>Perda</dt>
                <dd>{mass.format(task.consumptionVariance.lossG)} g</dd>
              </div>
              <div>
                <dt>Diferença</dt>
                <dd>
                  {task.consumptionVariance.deltaG > 0 ? "+" : ""}
                  {mass.format(task.consumptionVariance.deltaG)} g
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        <div className="consumption-confirmed-foot">
          <small>
            {task.ingredients.some(
              (ingredient) =>
                (ingredient.consumption?.correctionCount ?? 0) > 0,
            )
              ? "Valores atuais já incluem correções preservadas no histórico."
              : "Se alguma pesagem ficou incorreta, registre uma correção sem apagar esta confirmação."}
          </small>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setCorrecting(true)}
          >
            <RotateCcw aria-hidden="true" />
            Corrigir apontamento
          </button>
        </div>
      </section>
    );
  }

  if (task.status === "available") {
    return (
      <section className="preparation-consumption is-pending">
        <Scale aria-hidden="true" />
        <div>
          <strong>O apontamento abre quando o preparo começar.</strong>
          <p>
            Ao terminar esta etapa, registre quanto foi usado e se houve perda.
          </p>
        </div>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="preparation-consumption"
      onSubmit={submit}
      noValidate
    >
      <input type="hidden" name="operation" value="consumption" />
      <input type="hidden" name="taskId" value={task.id} />
      <div className="preparation-detail-head">
        <div>
          <span className="preparation-kicker">Antes de concluir</span>
          <h4>Quanto foi usado de verdade?</h4>
        </div>
        <small>O que sobrar volta a ficar disponível na despensa.</small>
      </div>
      <div className="consumption-lines">
        {task.ingredients.map((ingredient) => {
          const value = values[ingredient.id];
          const error = errors[ingredient.id];
          const errorId = `consumption-error-${ingredient.id}`;
          return (
            <fieldset key={ingredient.id}>
              <input type="hidden" name="requirementId" value={ingredient.id} />
              <legend>
                <strong>{ingredient.name}</strong>
                <span>
                  {mass.format(ingredient.requiredG)} g planejados ·{" "}
                  {mass.format(ingredient.reservedG)} g separados
                </span>
              </legend>
              <label htmlFor={`actual-used-${ingredient.id}`}>
                <span>Usado</span>
                <NumberField
                  id={`actual-used-${ingredient.id}`}
                  name="actualUsedG"
                  value={value?.actualUsedG ?? ""}
                  onValueChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [ingredient.id]: {
                        ...(current[ingredient.id] ?? {
                          actualUsedG: "",
                          lossG: "",
                        }),
                        actualUsedG: next,
                      },
                    }))
                  }
                  min={0}
                  max={ingredient.reservedG}
                  step={1}
                  suffix="g"
                  required
                  ariaDescribedBy={attempted && error ? errorId : undefined}
                />
              </label>
              <label htmlFor={`loss-${ingredient.id}`}>
                <span>Perda</span>
                <NumberField
                  id={`loss-${ingredient.id}`}
                  name="lossG"
                  value={value?.lossG ?? ""}
                  onValueChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [ingredient.id]: {
                        ...(current[ingredient.id] ?? {
                          actualUsedG: "",
                          lossG: "",
                        }),
                        lossG: next,
                      },
                    }))
                  }
                  min={0}
                  max={ingredient.reservedG}
                  step={1}
                  suffix="g"
                  required
                  ariaDescribedBy={attempted && error ? errorId : undefined}
                />
              </label>
              {attempted && error ? (
                <small className="field-error" id={errorId} role="alert">
                  <TriangleAlert aria-hidden="true" />
                  {error}
                </small>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <div className="consumption-submit">
        <small>
          A confirmação baixa o usado, registra a perda e libera a sobra.
        </small>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <Scale aria-hidden="true" />
          )}
          {pending ? "Confirmando..." : "Confirmar consumo"}
        </button>
      </div>
    </form>
  );
}

export function TodayDashboard({
  today,
  attention,
  deliveries,
  dayPulse,
}: TodayDashboardProps) {
  const initialState: ProductionActionState = {
    status: "idle",
    message: "",
    today,
    notificationId: null,
  };
  const [actionState, formAction, pending] = useActionState(
    updateProductionTaskAction,
    initialState,
  );
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [dismissedNotificationId, setDismissedNotificationId] = useState<
    number | null
  >(null);
  const view = actionState.today;
  const task = view.currentTask;
  const notifications = useMemo<SystemNotification[]>(() => {
    if (
      !actionState.notificationId ||
      actionState.notificationId === dismissedNotificationId
    )
      return [];
    return [{ id: actionState.notificationId, message: actionState.message }];
  }, [
    actionState.message,
    actionState.notificationId,
    dismissedNotificationId,
  ]);

  const currentStepIndex = task
    ? Math.max(
        0,
        task.steps.findIndex((step) => step.state === "current"),
      )
    : 0;
  const currentStep = task?.steps[currentStepIndex];
  const progressPercent = task
    ? task.steps.length <= 1
      ? 100
      : (currentStepIndex / (task.steps.length - 1)) * 80
    : 0;
  const preparationOpen = task ? openTaskId === task.id : false;
  const needsConsumption = Boolean(
    task?.consumptionRequired && !task.consumptionConfirmed,
  );
  const equipmentBlocksAction = Boolean(
    task?.equipment?.blocking && task.status !== "in_progress",
  );
  const primaryAction =
    task?.status === "available"
      ? { action: "start", label: "Começar preparo", Icon: Play }
      : task?.status === "waiting"
        ? { action: "resume", label: "Retomar agora", Icon: RotateCcw }
        : { action: "complete", label: "Concluir tarefa", Icon: Check };

  return (
    <section className="view" aria-labelledby="today-title">
      <header className="page-head">
        <div>
          <p className="eyebrow">{view.dateLabel}</p>
          <h1 id="today-title">{view.greeting}</h1>
          <p className="lead">{view.lead}</p>
        </div>
        <Link className="button button-primary" href={NEW_ORDER_HREF}>
          <Plus aria-hidden="true" />
          {NEW_ORDER_LABEL}
        </Link>
      </header>

      <div className="today-layout">
        <div className="today-primary">
          <section className="today-current-section">
            <div className="section-head">
              <h2>Agora na bancada</h2>
              <span>
                {view.activeOrderCount} pedido
                {view.activeOrderCount === 1 ? "" : "s"} em produção
              </span>
            </div>

            {task ? (
              <article className={`current-card is-${task.status}`}>
                <p className="current-context">
                  <span>Pedido {task.orderNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Produto final: <strong>{task.finalProduct}</strong>
                  </span>
                </p>

                <div className="current-label">
                  <Timer aria-hidden="true" />
                  <span>{task.attentionLabel}</span>
                </div>

                <time className="current-time">{task.timeRange}</time>
                <h3>{task.title}</h3>
                <p className="current-copy">{task.instruction}</p>

                <div className="current-meta">
                  {task.metadata.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>

                {task.equipment ? (
                  <div
                    className={`task-equipment is-${task.equipment.state}`}
                    role={task.equipment.blocking ? "alert" : undefined}
                  >
                    <span className="task-equipment-icon">
                      <Wrench aria-hidden="true" />
                    </span>
                    <div>
                      <small>Equipamento desta etapa</small>
                      <strong>
                        {task.equipment.assetName ?? task.equipment.label}
                      </strong>
                      <p id="task-equipment-message">
                        {task.equipment.message}
                      </p>
                    </div>
                    {task.equipment.blocking ? (
                      <Link className="quiet-action" href="/equipamentos">
                        Abrir equipamentos
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {preparationOpen ? (
                  <div className="preparation-detail" id="preparation-detail">
                    <section
                      className={`preparation-identity is-${task.preparation.kind}`}
                    >
                      <span className="preparation-identity-icon">
                        <Layers3 aria-hidden="true" />
                      </span>
                      <div>
                        <span className="preparation-kicker">
                          {task.preparation.kind === "intermediate"
                            ? "Preparação intermediária"
                            : "Produto final em andamento"}
                        </span>
                        <h4>
                          {task.preparation.kind === "intermediate"
                            ? `${task.preparation.name} · parte do ${task.finalProduct}`
                            : task.finalProduct}
                        </h4>
                        <p>
                          {task.preparation.kind === "intermediate"
                            ? "Feita para esta encomenda e ligada ao bolo até a montagem."
                            : "As próximas tarefas continuam trabalhando no produto entregue à cliente."}
                        </p>
                      </div>
                    </section>
                    <section className="preparation-instructions">
                      <span className="preparation-kicker">Como fazer</span>
                      <p>{task.instruction}</p>
                    </section>

                    <section className="preparation-ingredients">
                      <div className="preparation-detail-head">
                        <div>
                          <span className="preparation-kicker">
                            {task.ingredientScope === "task"
                              ? "Ingredientes desta etapa"
                              : "Ingredientes do pedido"}
                          </span>
                          <h4>
                            {task.ingredientScope === "task"
                              ? "O que entra agora"
                              : "O que está separado para esta encomenda"}
                          </h4>
                        </div>
                        <small>
                          {task.ingredientScope === "task"
                            ? "Quantidades ligadas a esta etapa da receita."
                            : "Esta versão ainda reúne os insumos no produto completo."}
                        </small>
                      </div>
                      {task.ingredients.length > 0 ? (
                        <ul>
                          {task.ingredients.map((ingredient) => {
                            const ready =
                              ingredient.status === "available" ||
                              ingredient.status === "substitution";
                            return (
                              <li key={ingredient.id}>
                                <span
                                  className={`preparation-stock-icon${ready ? " is-ready" : " is-missing"}`}
                                >
                                  {ready ? (
                                    <PackageCheck aria-hidden="true" />
                                  ) : (
                                    <ShoppingBasket aria-hidden="true" />
                                  )}
                                </span>
                                <div>
                                  <strong>{ingredient.name}</strong>
                                  <small>
                                    {ingredient.preferredItemName ??
                                      "Qualquer produto comprado compatível"}
                                  </small>
                                </div>
                                <div className="preparation-quantity">
                                  <strong>
                                    {mass.format(ingredient.requiredG)} g
                                  </strong>
                                  <small>
                                    {ready
                                      ? `${mass.format(ingredient.reservedG)} g separados`
                                      : `${mass.format(ingredient.shortageG)} g a comprar`}
                                  </small>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="preparation-ingredients-empty">
                          Nenhum ingrediente começa nesta etapa. Siga as
                          instruções e avance quando estiver pronta.
                        </p>
                      )}
                    </section>

                    {task.consumptionRequired ? (
                      <TaskConsumption
                        key={`${task.id}-${task.consumptionConfirmed}-${actionState.notificationId ?? "initial"}`}
                        task={task}
                        formAction={formAction}
                        pending={pending}
                      />
                    ) : null}

                    <form
                      action={formAction}
                      className="preparation-note-form"
                      key={task.id}
                    >
                      <input type="hidden" name="operation" value="note" />
                      <input type="hidden" name="taskId" value={task.id} />
                      <label htmlFor={`production-note-${task.id}`}>
                        <NotebookPen aria-hidden="true" />
                        Observação deste preparo
                      </label>
                      <TextAreaField
                        id={`production-note-${task.id}`}
                        name="note"
                        defaultValue={task.note ?? ""}
                        minLength={1}
                        maxLength={1000}
                        required
                        placeholder="Ex.: forno demorou 5 min a mais para estabilizar"
                        ariaDescribedBy={`production-note-help-${task.id}`}
                      />
                      <div>
                        <small id={`production-note-help-${task.id}`}>
                          Fica guardada junto desta tarefa, sem aparecer para a
                          cliente.
                        </small>
                        <button
                          className="button button-secondary"
                          type="submit"
                          disabled={pending}
                        >
                          {pending ? (
                            <LoaderCircle
                              className="is-spinning"
                              aria-hidden="true"
                            />
                          ) : (
                            <NotebookPen aria-hidden="true" />
                          )}
                          {pending ? "Guardando..." : "Guardar observação"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}

                <div className="current-actions">
                  {task.status === "in_progress" && needsConsumption ? (
                    preparationOpen ? null : (
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={pending}
                        onClick={() => setOpenTaskId(task.id)}
                      >
                        <Scale aria-hidden="true" />
                        Conferir consumo
                      </button>
                    )
                  ) : (
                    <form action={formAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        type="hidden"
                        name="taskAction"
                        value={primaryAction.action}
                      />
                      <button
                        className="button button-primary"
                        type="submit"
                        disabled={pending || equipmentBlocksAction}
                        aria-describedby={
                          task.equipment ? "task-equipment-message" : undefined
                        }
                      >
                        {pending ? (
                          <LoaderCircle
                            className="is-spinning"
                            aria-hidden="true"
                          />
                        ) : (
                          <primaryAction.Icon aria-hidden="true" />
                        )}
                        {pending ? "Guardando..." : primaryAction.label}
                      </button>
                    </form>
                  )}
                  {task.status === "in_progress" ? (
                    <form action={formAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input type="hidden" name="taskAction" value="wait" />
                      <button
                        className="button button-secondary"
                        type="submit"
                        disabled={pending}
                      >
                        <CirclePause aria-hidden="true" />
                        Deixar em espera
                      </button>
                    </form>
                  ) : null}
                  <button
                    className="button button-secondary"
                    type="button"
                    aria-expanded={preparationOpen}
                    aria-controls="preparation-detail"
                    onClick={() =>
                      setOpenTaskId((current) =>
                        current === task.id ? null : task.id,
                      )
                    }
                  >
                    <BookOpenText aria-hidden="true" />
                    {preparationOpen ? "Fechar preparo" : "Ver preparo"}
                  </button>
                </div>

                <div className="production-progress">
                  <div className="production-progress-head">
                    <span>Momentos do {task.finalProduct}</span>
                    <strong>
                      {currentStep?.label} · {currentStepIndex + 1} de{" "}
                      {task.steps.length}
                    </strong>
                  </div>
                  <ol
                    className="production-steps"
                    aria-label={`Momentos do ${task.finalProduct}: momento ${currentStepIndex + 1} de ${task.steps.length}, ${currentStep?.label}`}
                    style={
                      {
                        "--progress": `${progressPercent}%`,
                        "--step-count": task.steps.length,
                      } as React.CSSProperties
                    }
                  >
                    {task.steps.map((step, index) => (
                      <li
                        key={step.id}
                        className={`is-${step.state}`}
                        aria-current={
                          step.state === "current" ? "step" : undefined
                        }
                      >
                        <span className="production-dot">
                          {step.state === "done" ? (
                            <Check aria-hidden="true" />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span>{step.label}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            ) : (
              <div className="today-empty">
                <h3>A bancada está livre.</h3>
                <p>
                  Quando um pedido for confirmado, o primeiro preparo aparece
                  aqui com horário e instruções.
                </p>
                <Link className="button button-secondary" href="/pedidos">
                  Ver pedidos
                </Link>
              </div>
            )}
          </section>

          <section
            className="today-deliveries"
            aria-labelledby="deliveries-title"
          >
            <div className="section-head">
              <div>
                <p className="section-kicker">Compromissos do dia</p>
                <h2 id="deliveries-title">Saem hoje</h2>
              </div>
              <Link className="quiet-action" href="/pedidos">
                Ver pedidos
              </Link>
            </div>

            {deliveries.length > 0 ? (
              <ol className="delivery-list">
                {deliveries.map((delivery) => (
                  <li key={delivery.id}>
                    <time>{delivery.time}</time>
                    <span className="delivery-marker" aria-hidden="true">
                      <CalendarCheck2 />
                    </span>
                    <div className="delivery-copy">
                      <strong>{delivery.title}</strong>
                      <span>
                        Pedido #{delivery.orderNumber} · {delivery.customerName}
                      </span>
                    </div>
                    <div className="delivery-state">
                      <strong>{delivery.mode}</strong>
                      <span>{delivery.status}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="today-quiet-empty">
                <CalendarCheck2 aria-hidden="true" />
                <div>
                  <strong>Nenhuma saída marcada para hoje.</strong>
                  <p>As próximas entregas e retiradas aparecerão aqui.</p>
                </div>
              </div>
            )}
          </section>

          <section
            className="today-queue-section"
            aria-labelledby="queue-title"
          >
            <div className="section-head order-queue-head">
              <h2 id="queue-title">Depois na bancada</h2>
              <span>
                {view.otherOrders.length} pedido
                {view.otherOrders.length === 1 ? "" : "s"} na sequência
              </span>
            </div>

            {view.otherOrders.length > 0 ? (
              <ol className="timeline" aria-label="Outros pedidos na bancada">
                {view.otherOrders.map((order) => (
                  <li key={order.id}>
                    <time>{order.time}</time>
                    <div>
                      <strong>{order.title}</strong>
                      <small>{order.detail}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="timeline-empty">Nenhum outro pedido na fila.</p>
            )}
          </section>
        </div>

        <aside className="today-side-rail" aria-label="Resumo do dia">
          <section
            className="today-attention"
            aria-labelledby="attention-title"
          >
            <div className="today-rail-head">
              <div>
                <p className="section-kicker">Despensa e produção</p>
                <h2 id="attention-title">Pede atenção hoje</h2>
              </div>
              <span>{attention.length}</span>
            </div>

            {attention.length > 0 ? (
              <ul className="today-attention-list">
                {attention.map((item) => (
                  <li key={item.id} className={`is-${item.tone}`}>
                    <span className="today-attention-icon" aria-hidden="true">
                      {item.tone === "low" ? <ShoppingBasket /> : <Clock3 />}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="today-attention-empty">
                <PackageCheck aria-hidden="true" />
                <p>A despensa não pede nenhum cuidado imediato.</p>
              </div>
            )}

            <Link className="today-rail-link" href="/despensa">
              Abrir despensa
              <span aria-hidden="true">→</span>
            </Link>
          </section>

          {dayPulse ? (
            <section className="today-pulse" aria-labelledby="pulse-title">
              <div className="today-pulse-icon" aria-hidden="true">
                <CircleDollarSign />
              </div>
              <p className="section-kicker">Somente para você</p>
              <h2 id="pulse-title">Movimento de hoje</h2>
              <strong className="today-pulse-value">
                {currency.format(dayPulse.expected)}
              </strong>
              <p className="today-pulse-copy">
                {dayPulse.orderCount > 0
                  ? `${dayPulse.orderCount} encomenda${dayPulse.orderCount === 1 ? "" : "s"} prevista${dayPulse.orderCount === 1 ? "" : "s"} para sair hoje.`
                  : "Nenhuma encomenda com valor previsto para hoje."}
              </p>
              <dl>
                <div>
                  <dt>Já recebido</dt>
                  <dd>{currency.format(dayPulse.received)}</dd>
                </div>
                <div>
                  <dt>A receber</dt>
                  <dd>{currency.format(dayPulse.pending)}</dd>
                </div>
              </dl>
              <Link className="today-rail-link" href="/financeiro">
                Ver financeiro
                <span aria-hidden="true">→</span>
              </Link>
            </section>
          ) : null}

          <div className="paper-note" role="note" aria-label={view.note.title}>
            <h2>{view.note.title}</h2>
            <p>{view.note.body}</p>
            <span>{view.note.foot}</span>
          </div>
        </aside>
      </div>

      {actionState.status === "error" ? (
        <p className="form-message is-error" role="alert">
          {actionState.message}
        </p>
      ) : null}
      <SystemNotifications
        notifications={notifications}
        onDismiss={setDismissedNotificationId}
      />
    </section>
  );
}
