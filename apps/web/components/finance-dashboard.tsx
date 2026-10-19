"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Plus,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  mutateFinanceAction,
  type FinanceActionState,
} from "@/app/financeiro/actions";
import {
  DatePicker,
  NumberField,
  SearchableCombobox,
} from "@/components/form-controls";
import {
  SystemNotifications,
  type SystemNotification,
} from "@/components/system-notifications";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import { PageBackButton } from "@/components/page-back-button";
import type {
  FinanceComposition,
  FinanceCompositionItem,
  FinanceExpense,
  FinanceWorkspace,
  FinanceYearWorkspace,
} from "@/lib/finance";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T12:00:00Z`))
    .replace(" de ", " ");
}

function moveMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function deltaPhrase(value: number) {
  if (Math.abs(value) < 0.005) return "sem mudança";
  return `${money(Math.abs(value))} ${value > 0 ? "a mais" : "a menos"}`;
}

function cashOutflow(summary: { receiptFees: number; operatingPaid: number }) {
  return summary.receiptFees + summary.operatingPaid;
}

function PeriodControls({
  mode,
  month,
  year,
}: {
  mode: "month" | "year";
  month?: string;
  year: number;
}) {
  const selectedMonth =
    month ?? `${year}-${new Date().toISOString().slice(5, 7)}`;
  return (
    <div className="finance-period-controls">
      <nav className="finance-period-switch" aria-label="Período financeiro">
        <Link
          href={`/financeiro?month=${selectedMonth}`}
          aria-current={mode === "month" ? "page" : undefined}
        >
          Mês
        </Link>
        <Link
          href={`/financeiro?view=year&year=${year}`}
          aria-current={mode === "year" ? "page" : undefined}
        >
          Ano
        </Link>
      </nav>
      {mode === "month" && month ? (
        <div className="finance-month-nav" aria-label="Escolher mês">
          <Link
            href={`/financeiro?month=${moveMonth(month, -1)}`}
            aria-label="Mês anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <strong>
            {new Intl.DateTimeFormat("pt-BR", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${month}-01T12:00:00Z`))}
          </strong>
          <Link
            href={`/financeiro?month=${moveMonth(month, 1)}`}
            aria-label="Próximo mês"
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="finance-month-nav" aria-label="Escolher ano">
          <Link
            href={`/financeiro?view=year&year=${year - 1}`}
            aria-label="Ano anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
          <strong>{year}</strong>
          <Link
            href={`/financeiro?view=year&year=${year + 1}`}
            aria-label="Próximo ano"
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}

function CompositionGroup({
  title,
  description,
  items,
  tone,
}: {
  title: string;
  description: string;
  items: FinanceCompositionItem[];
  tone: "income" | "expense";
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const spokenComposition = items
    .map((item) => `${item.label}, ${money(item.amount)}`)
    .join("; ");
  return (
    <article className="finance-composition-group" data-tone={tone}>
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{money(total)}</strong>
      </header>
      {items.length > 0 ? (
        <>
          <div
            className="finance-composition-track"
            role="img"
            aria-label={`${title}: ${spokenComposition}. Total de ${money(total)}.`}
          >
            {items.map((item, index) => (
              <span
                key={item.key}
                data-color={index % 6}
                style={{ width: `${item.share}%` }}
                aria-hidden="true"
              />
            ))}
          </div>
          <ol className="finance-composition-legend">
            {items.map((item, index) => (
              <li key={item.key}>
                <span className="finance-composition-label">
                  <i data-color={index % 6} aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {item.entryCount}{" "}
                      {item.entryCount === 1 ? "movimento" : "movimentos"}
                    </small>
                  </span>
                </span>
                <span className="finance-composition-value">
                  <strong>{money(item.amount)}</strong>
                  <small>{item.share.toLocaleString("pt-BR")} %</small>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="finance-composition-empty">
          Ainda não houve movimentos neste período.
        </p>
      )}
    </article>
  );
}

function FinanceCompositionChart({
  composition,
  periodLabel,
}: {
  composition: FinanceComposition;
  periodLabel: string;
}) {
  return (
    <section
      className="finance-composition"
      aria-labelledby="finance-composition-title"
    >
      <header className="finance-composition-head">
        <div>
          <p className="eyebrow">Composição do caixa</p>
          <h2 id="finance-composition-title">De onde veio e para onde foi.</h2>
        </div>
        <p>
          Movimentos efetivos de {periodLabel}. Valores previstos continuam na
          leitura das contas.
        </p>
      </header>
      <div className="finance-composition-grid">
        <CompositionGroup
          title="Entradas"
          description="Por forma de recebimento"
          items={composition.income}
          tone="income"
        />
        <CompositionGroup
          title="Gastos"
          description="Por categoria paga"
          items={composition.expenses}
          tone="expense"
        />
      </div>
    </section>
  );
}

function FinanceYearFlow({ workspace }: { workspace: FinanceYearWorkspace }) {
  const largest = Math.max(
    1,
    ...workspace.months.flatMap((month) => [
      month.incomeGross,
      cashOutflow(month),
    ]),
  );
  return (
    <section className="finance-year-flow" aria-labelledby="year-flow-title">
      <header>
        <div>
          <p className="eyebrow">O ritmo dos doze meses</p>
          <h2 id="year-flow-title">Entradas e gastos, mês a mês.</h2>
        </div>
        <div className="finance-year-key" aria-label="Legenda">
          <span data-flow="income">Entradas</span>
          <span data-flow="expense">Gastos</span>
        </div>
      </header>
      <ol className="finance-year-bars">
        {workspace.months.map((month) => {
          const outflow = cashOutflow(month);
          return (
            <li key={month.month}>
              <Link href={`/financeiro?month=${month.month}`}>
                <strong>{month.monthLabel}</strong>
                <span className="finance-year-bar-pair" aria-hidden="true">
                  <i
                    data-flow="income"
                    style={{
                      width: `${
                        month.incomeGross > 0
                          ? Math.max((month.incomeGross / largest) * 100, 0.75)
                          : 0
                      }%`,
                    }}
                  />
                  <i
                    data-flow="expense"
                    style={{
                      width: `${
                        outflow > 0
                          ? Math.max((outflow / largest) * 100, 0.75)
                          : 0
                      }%`,
                    }}
                  />
                </span>
                <span className="finance-year-values">
                  <span>Entraram {money(month.incomeGross)}</span>
                  <span>Saíram {money(outflow)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function FinanceYearDashboard({
  workspace,
}: {
  workspace: FinanceYearWorkspace;
}) {
  return (
    <section className="view finance-view">
      <PageBackButton />
      <header className="page-head finance-page-head">
        <div>
          <p className="eyebrow">Financeiro · visão anual</p>
          <h1>O ano, por inteiro.</h1>
          <p className="page-lede">
            Doze meses reunidos para perceber o ritmo, as origens e os gastos da
            confeitaria.
          </p>
        </div>
        <Link
          className="button button-secondary"
          href={`/financeiro?month=${new Date().toISOString().slice(0, 7)}`}
        >
          Ver mês atual
        </Link>
      </header>

      <PeriodControls mode="year" year={workspace.year} />

      <section className="finance-story" aria-labelledby="finance-year-story">
        <div className="finance-story-copy">
          <span className="finance-story-icon">
            <BarChart3 aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">O ano contou assim</p>
            <h2 id="finance-year-story">
              Entraram {money(workspace.summary.incomeGross)}. Depois dos
              gastos,{" "}
              {workspace.summary.cashBalance >= 0 ? "ficaram" : "faltaram"}{" "}
              <span>{money(Math.abs(workspace.summary.cashBalance))}</span>.
            </h2>
          </div>
        </div>
        <dl className="finance-story-breakdown">
          <div>
            <dt>
              <ArrowDownRight aria-hidden="true" /> Recebido de pedidos
            </dt>
            <dd>{money(workspace.summary.incomeGross)}</dd>
          </div>
          <div>
            <dt>
              <ReceiptText aria-hidden="true" /> Taxas dos recebimentos
            </dt>
            <dd>− {money(workspace.summary.receiptFees)}</dd>
          </div>
          <div>
            <dt>
              <ArrowUpRight aria-hidden="true" /> Contas pagas
            </dt>
            <dd>− {money(workspace.summary.operatingPaid)}</dd>
          </div>
        </dl>
      </section>

      <section className="finance-outlook" aria-labelledby="year-outlook-title">
        <div>
          <p className="eyebrow">Compromissos do ano</p>
          <h2 id="year-outlook-title">
            {money(workspace.summary.expectedOutflow)} previstos e{" "}
            {money(workspace.summary.outstandingAmount)} ainda em aberto.
          </h2>
          <p>
            O previsto inclui recorrências conhecidas; o gráfico abaixo usa
            apenas dinheiro efetivamente movimentado.
          </p>
        </div>
        <CircleDollarSign aria-hidden="true" />
      </section>

      <FinanceYearFlow workspace={workspace} />
      <FinanceCompositionChart
        composition={workspace.composition}
        periodLabel={`todo o ano de ${workspace.year}`}
      />
    </section>
  );
}

function ExpenseStatus({ expense }: { expense: FinanceExpense }) {
  const labels = { open: "Em aberto", partial: "Em parte", paid: "Pago" };
  return (
    <span className="finance-status" data-status={expense.status}>
      {expense.status === "paid" ? <Check aria-hidden="true" /> : null}
      {labels[expense.status]}
    </span>
  );
}

export function FinanceDashboard({
  initialWorkspace,
}: {
  initialWorkspace: FinanceWorkspace;
}) {
  const expenseDialog = useRef<HTMLDialogElement>(null);
  const categoryDialog = useRef<HTMLDialogElement>(null);
  const paymentDialog = useRef<HTMLDialogElement>(null);
  const lastNotification = useRef<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<FinanceExpense | null>(
    null,
  );
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const initialState: FinanceActionState = {
    status: "idle",
    operation: null,
    message: "",
    workspace: initialWorkspace,
    notificationId: null,
  };
  const [state, formAction, pending] = useActionState(
    mutateFinanceAction,
    initialState,
  );
  const workspace = state.workspace;
  const categories = useMemo(
    () =>
      workspace.categories.map((category) => ({
        value: category.id,
        label: category.name,
        keywords: category.description ?? "",
      })),
    [workspace.categories],
  );

  useEffect(() => {
    if (
      state.status !== "success" ||
      !state.notificationId ||
      state.notificationId === lastNotification.current
    )
      return;
    lastNotification.current = state.notificationId;
    setNotifications((current) => [
      ...current,
      { id: state.notificationId as number, message: state.message },
    ]);
    if (state.operation === "expense") expenseDialog.current?.close();
    if (state.operation === "category") categoryDialog.current?.close();
    if (state.operation === "payment") paymentDialog.current?.close();
  }, [state]);

  const today = new Date().toISOString().slice(0, 10);
  const defaultDueDate = today.startsWith(workspace.month)
    ? today
    : `${workspace.month}-10`;

  return (
    <section className="view finance-view">
      <PageBackButton />
      <header className="page-head finance-page-head">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h1>O mês, sem sustos.</h1>
          <p className="page-lede">
            Dinheiro que entrou, contas que saíram e o que ainda pede atenção.
          </p>
        </div>
        <div className="finance-page-actions">
          <a
            className="button button-secondary"
            href={`/financeiro/exportar?month=${workspace.month}`}
          >
            <Download aria-hidden="true" /> Exportar mês
          </a>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setSelectedCategory(workspace.categories[0]?.id ?? "");
              expenseDialog.current?.showModal();
            }}
          >
            <Plus aria-hidden="true" /> Registrar despesa
          </button>
        </div>
      </header>

      <PeriodControls
        mode="month"
        month={workspace.month}
        year={Number(workspace.month.slice(0, 4))}
      />

      <section className="finance-story" aria-labelledby="finance-story-title">
        <div className="finance-story-copy">
          <span className="finance-story-icon">
            <WalletCards aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">O caixa contou assim</p>
            <h2 id="finance-story-title">
              Entraram {money(workspace.summary.incomeGross)}. Depois de taxas e
              contas pagas,{" "}
              {workspace.summary.cashBalance >= 0 ? "ficaram" : "faltaram"}{" "}
              <span>{money(Math.abs(workspace.summary.cashBalance))}</span>.
            </h2>
          </div>
        </div>
        <dl className="finance-story-breakdown">
          <div>
            <dt>
              <ArrowDownRight aria-hidden="true" /> Recebido de pedidos
            </dt>
            <dd>{money(workspace.summary.incomeGross)}</dd>
          </div>
          <div>
            <dt>
              <ReceiptText aria-hidden="true" /> Taxas dos recebimentos
            </dt>
            <dd>− {money(workspace.summary.receiptFees)}</dd>
          </div>
          <div>
            <dt>
              <ArrowUpRight aria-hidden="true" /> Contas pagas
            </dt>
            <dd>− {money(workspace.summary.operatingPaid)}</dd>
          </div>
        </dl>
      </section>

      <section
        className="finance-outlook"
        aria-labelledby="finance-outlook-title"
      >
        <div>
          <p className="eyebrow">Até o fim do mês</p>
          <h2 id="finance-outlook-title">
            Ainda há {money(workspace.summary.outstandingAmount)} por acertar.
          </h2>
          <p>
            Os compromissos do mês somam{" "}
            {money(workspace.summary.expectedOutflow)}, incluindo os recorrentes
            ainda não trazidos para a lista.
          </p>
        </div>
        <CircleDollarSign aria-hidden="true" />
      </section>

      <FinanceCompositionChart
        composition={workspace.composition}
        periodLabel={workspace.monthLabel.toLocaleLowerCase("pt-BR")}
      />

      <section className="finance-reading" aria-label="Leituras do mês">
        <article
          className="finance-comparison"
          aria-labelledby="finance-comparison-title"
        >
          <header>
            <div>
              <p className="eyebrow">Um mês ao lado do outro</p>
              <h2 id="finance-comparison-title">
                {workspace.comparison.hasPreviousActivity
                  ? workspace.comparison.delta.cashBalance >= 0
                    ? `O caixa ficou ${money(workspace.comparison.delta.cashBalance)} mais folgado.`
                    : `O caixa ficou ${money(Math.abs(workspace.comparison.delta.cashBalance))} mais apertado.`
                  : `${workspace.comparison.previousMonthLabel} ainda não tem movimentos para comparar.`}
              </h2>
            </div>
            <span>{workspace.comparison.previousMonthLabel}</span>
          </header>
          <dl className="finance-comparison-list">
            <div>
              <dt>Recebido de pedidos</dt>
              <dd>
                <strong>
                  {money(workspace.comparison.current.incomeGross)}
                </strong>
                <span>
                  {deltaPhrase(workspace.comparison.delta.incomeGross)}
                </span>
                <small>
                  antes: {money(workspace.comparison.previous.incomeGross)}
                </small>
              </dd>
            </div>
            <div>
              <dt>Contas pagas</dt>
              <dd>
                <strong>
                  {money(workspace.comparison.current.operatingPaid)}
                </strong>
                <span>
                  {deltaPhrase(workspace.comparison.delta.operatingPaid)}
                </span>
                <small>
                  antes: {money(workspace.comparison.previous.operatingPaid)}
                </small>
              </dd>
            </div>
            <div>
              <dt>Saldo de caixa</dt>
              <dd>
                <strong>
                  {money(workspace.comparison.current.cashBalance)}
                </strong>
                <span>
                  {deltaPhrase(workspace.comparison.delta.cashBalance)}
                </span>
                <small>
                  antes: {money(workspace.comparison.previous.cashBalance)}
                </small>
              </dd>
            </div>
          </dl>
        </article>

        <article
          className="finance-categories-reading"
          aria-labelledby="finance-categories-title"
        >
          <header>
            <div>
              <p className="eyebrow">Para onde o dinheiro está indo</p>
              <h2 id="finance-categories-title">
                Contas organizadas por categoria.
              </h2>
            </div>
            <span>
              {workspace.expenses.length}{" "}
              {workspace.expenses.length === 1
                ? "conta registrada"
                : "contas registradas"}
            </span>
          </header>
          {workspace.categoryBreakdown.length > 0 ? (
            <ol className="finance-category-bars">
              {workspace.categoryBreakdown.map((category) => (
                <li key={category.categoryId}>
                  <div>
                    <strong>{category.categoryName}</strong>
                    <span>
                      {category.expenseCount}{" "}
                      {category.expenseCount === 1 ? "conta" : "contas"}
                    </span>
                  </div>
                  <div className="finance-category-value">
                    <strong>{money(category.expectedAmount)}</strong>
                    <span>
                      {category.shareOfExpected.toLocaleString("pt-BR")} % do
                      previsto
                    </span>
                  </div>
                  <span className="finance-category-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(category.shareOfExpected, 2)}%`,
                      }}
                    />
                  </span>
                  <small>
                    {money(category.paidAmount)} pagos ·{" "}
                    {money(category.outstandingAmount)} em aberto
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="finance-reading-empty">
              As categorias ganharão forma assim que uma conta for registrada
              neste mês.
            </p>
          )}
        </article>
      </section>

      <section
        className="finance-section"
        aria-labelledby="month-expenses-title"
      >
        <div className="section-heading finance-section-heading">
          <div>
            <h2 id="month-expenses-title">Contas deste mês</h2>
            <p>
              O compromisso fica aqui; cada pagamento preserva sua própria data.
            </p>
          </div>
          <button
            className="quiet-action"
            type="button"
            onClick={() => categoryDialog.current?.showModal()}
          >
            Organizar categorias
          </button>
        </div>
        <div className="finance-expense-list">
          {workspace.expenses.map((expense) => (
            <article className="finance-expense-card" key={expense.id}>
              <div className="finance-expense-date">
                <span>vence</span>
                <strong>{shortDate(expense.dueDate)}</strong>
              </div>
              <div className="finance-expense-copy">
                <span>{expense.categoryName}</span>
                <h3>{expense.description}</h3>
                <p>{expense.supplier ?? "Sem fornecedor informado"}</p>
              </div>
              <div className="finance-expense-value">
                <strong>{money(expense.expectedAmount)}</strong>
                {expense.status === "partial" ? (
                  <small>{money(expense.balanceDue)} restantes</small>
                ) : null}
                <ExpenseStatus expense={expense} />
              </div>
              <div className="finance-expense-actions">
                {expense.status !== "paid" ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setSelectedExpense(expense);
                      paymentDialog.current?.showModal();
                    }}
                  >
                    Registrar pagamento
                  </button>
                ) : null}
                {expense.payments.length > 0 ? (
                  <details>
                    <summary>Histórico</summary>
                    <div className="finance-payment-history">
                      {expense.payments.map((payment) => (
                        <div
                          key={payment.id}
                          data-reversed={Boolean(payment.reversedAt)}
                        >
                          <span>
                            {shortDate(payment.paidAt)} ·{" "}
                            {money(payment.amount)}
                            {payment.reversedAt ? " · estornado" : ""}
                          </span>
                          {!payment.reversedAt ? (
                            <form action={formAction}>
                              <input
                                type="hidden"
                                name="operation"
                                value="payment_reversal"
                              />
                              <input
                                type="hidden"
                                name="month"
                                value={workspace.month}
                              />
                              <input
                                type="hidden"
                                name="expenseId"
                                value={expense.id}
                              />
                              <input
                                type="hidden"
                                name="paymentId"
                                value={payment.id}
                              />
                              <input
                                type="hidden"
                                name="reason"
                                value="Lançamento registrado por engano"
                              />
                              <button
                                type="submit"
                                disabled={pending}
                                aria-label="Estornar pagamento"
                              >
                                <RotateCcw aria-hidden="true" />
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </article>
          ))}
          {workspace.expenses.length === 0 ? (
            <div className="finance-empty">
              <CalendarClock aria-hidden="true" />
              <h3>Nenhuma conta neste mês.</h3>
              <p>
                Quando algo chegar, registre aqui. Recorrências previstas
                aparecem logo abaixo.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {workspace.recurringForecasts.length > 0 ? (
        <section
          className="finance-section"
          aria-labelledby="recurrences-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="recurrences-title">Combinados que se repetem</h2>
              <p>Previstos para o mês, mas ainda não confirmados como conta.</p>
            </div>
          </div>
          <div className="finance-recurrence-list">
            {workspace.recurringForecasts.map((forecast) => (
              <article key={forecast.recurrenceId}>
                <div>
                  <span>{forecast.categoryName}</span>
                  <h3>{forecast.description}</h3>
                  <p>Previsto para {shortDate(forecast.dueDate)}</p>
                </div>
                <strong>{money(forecast.expectedAmount)}</strong>
                <form action={formAction}>
                  <input type="hidden" name="operation" value="instantiate" />
                  <input type="hidden" name="month" value={workspace.month} />
                  <input
                    type="hidden"
                    name="recurrenceId"
                    value={forecast.recurrenceId}
                  />
                  <input
                    type="hidden"
                    name="idempotencyKey"
                    value={crypto.randomUUID()}
                  />
                  <button
                    className="button button-secondary"
                    type="submit"
                    disabled={pending}
                  >
                    Trazer para este mês
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <dialog
        className="purchase-dialog finance-dialog"
        ref={expenseDialog}
        aria-labelledby="expense-dialog-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Nova conta"
            titleId="expense-dialog-title"
            eyebrow="Financeiro"
            closeLabel="Fechar nova conta"
            onClose={() => expenseDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <h2>O que precisa entrar no mês?</h2>
              </div>
              <p>
                Registre o compromisso agora. O pagamento pode acontecer depois,
                inteiro ou em partes.
              </p>
            </header>
            <form className="finance-form" action={formAction}>
              <input type="hidden" name="operation" value="expense" />
              <input type="hidden" name="month" value={workspace.month} />
              <input
                type="hidden"
                name="idempotencyKey"
                value={crypto.randomUUID()}
              />
              <label className="form-field form-field-wide">
                <span>Descrição</span>
                <input
                  name="description"
                  required
                  minLength={2}
                  placeholder="Ex.: Internet da cozinha"
                />
              </label>
              <div className="form-field">
                <label htmlFor="finance-category">Categoria</label>
                <SearchableCombobox
                  id="finance-category"
                  name="categoryId"
                  options={categories}
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                  placeholder="Busque uma categoria"
                  required
                />
              </div>
              <label className="form-field">
                <span>
                  Fornecedor <small>opcional</small>
                </span>
                <input name="supplier" placeholder="Ex.: Vivo" />
              </label>
              <div className="form-field">
                <label htmlFor="finance-amount">Valor previsto</label>
                <NumberField
                  id="finance-amount"
                  name="expectedAmount"
                  min={0.01}
                  step={0.01}
                  prefix="R$"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="finance-due">Vencimento</label>
                <DatePicker
                  id="finance-due"
                  name="dueDate"
                  defaultValue={defaultDueDate}
                  required
                />
              </div>
              <label className="finance-recurring">
                <input type="checkbox" name="recurring" />
                <span>
                  <strong>Isso se repete todo mês</strong>
                  <small>
                    O sistema lembrará nos próximos meses sem lançar um
                    pagamento sozinho.
                  </small>
                </span>
              </label>
              {state.status === "error" && state.operation === "expense" ? (
                <p className="form-message-error">{state.message}</p>
              ) : null}
              <footer className="dialog-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => expenseDialog.current?.close()}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending || !selectedCategory}
                >
                  Guardar no mês
                </button>
              </footer>
            </form>
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog category-dialog finance-dialog"
        ref={categoryDialog}
        aria-labelledby="finance-category-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Nova categoria"
            eyebrow="Financeiro"
            closeLabel="Fechar nova categoria"
            onClose={() => categoryDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Organização</p>
                <h2 id="finance-category-title">
                  Uma gaveta para cada tipo de custo.
                </h2>
              </div>
              <p>
                Categoria descreve a natureza do gasto — aluguel, gás, internet
                — e não o fornecedor.
              </p>
            </header>
            <form className="finance-form" action={formAction}>
              <input type="hidden" name="operation" value="category" />
              <input type="hidden" name="month" value={workspace.month} />
              <label className="form-field">
                <span>Nome da categoria</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  placeholder="Ex.: Cursos e aperfeiçoamento"
                />
              </label>
              <label className="form-field">
                <span>
                  Quando usar <small>opcional</small>
                </span>
                <input
                  name="description"
                  placeholder="Ajuda a manter a classificação consistente"
                />
              </label>
              {state.status === "error" && state.operation === "category" ? (
                <p className="form-message-error">{state.message}</p>
              ) : null}
              <footer className="dialog-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => categoryDialog.current?.close()}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending}
                >
                  Criar categoria
                </button>
              </footer>
            </form>
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog category-dialog finance-dialog"
        ref={paymentDialog}
        aria-labelledby="finance-payment-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title={
              selectedExpense
                ? `Pagamento de ${selectedExpense.description}`
                : "Registrar pagamento"
            }
            eyebrow="Financeiro"
            closeLabel="Fechar pagamento"
            onClose={() => paymentDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Saída do caixa</p>
                <h2 id="finance-payment-title">
                  Pagamento de {selectedExpense?.description ?? "conta"}
                </h2>
              </div>
              <p>
                O saldo é{" "}
                {selectedExpense ? money(selectedExpense.balanceDue) : "—"}. Use
                pagamentos parciais quando precisar.
              </p>
            </header>
            {selectedExpense ? (
              <form className="finance-form" action={formAction}>
                <input type="hidden" name="operation" value="payment" />
                <input type="hidden" name="month" value={workspace.month} />
                <input
                  type="hidden"
                  name="expenseId"
                  value={selectedExpense.id}
                />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={crypto.randomUUID()}
                />
                <div className="form-field">
                  <label htmlFor="payment-amount">Valor pago</label>
                  <NumberField
                    id="payment-amount"
                    name="amount"
                    defaultValue={String(selectedExpense.balanceDue)}
                    min={0.01}
                    max={selectedExpense.balanceDue}
                    step={0.01}
                    prefix="R$"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="payment-date">Data do pagamento</label>
                  <DatePicker
                    id="payment-date"
                    name="paidAt"
                    defaultValue={today}
                    required
                  />
                </div>
                <label className="form-field form-field-wide">
                  <span>
                    Anotação <small>opcional</small>
                  </span>
                  <input name="note" placeholder="Ex.: pago por Pix" />
                </label>
                {state.status === "error" && state.operation === "payment" ? (
                  <p className="form-message-error">{state.message}</p>
                ) : null}
                <footer className="dialog-actions">
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => paymentDialog.current?.close()}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={pending}
                  >
                    Registrar pagamento
                  </button>
                </footer>
              </form>
            ) : null}
          </div>
        </div>
      </dialog>

      <SystemNotifications
        notifications={notifications}
        onDismiss={(id) =>
          setNotifications((current) =>
            current.filter((item) => item.id !== id),
          )
        }
      />
    </section>
  );
}
