"use client";

import {
  Activity,
  CalendarClock,
  Flame,
  History,
  PackageOpen,
  Plus,
  Settings2,
  Snowflake,
  Wrench,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  mutateEquipmentAction,
  type EquipmentActionState,
} from "@/app/equipamentos/actions";
import {
  DatePicker,
  NumberField,
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/form-controls";
import {
  SystemNotifications,
  type SystemNotification,
} from "@/components/system-notifications";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import { PageBackButton } from "@/components/page-back-button";
import type {
  EquipmentAsset,
  EquipmentKind,
  EquipmentWorkspace,
} from "@/lib/equipment";

const kindOptions: ComboboxOption[] = [
  { value: "oven", label: "Forno" },
  { value: "mixer", label: "Batedeira ou mixer" },
  { value: "refrigeration", label: "Geladeira ou freezer" },
  { value: "stove", label: "Fogão ou cooktop" },
  { value: "utensil", label: "Ferramenta ou utensílio" },
  { value: "other", label: "Outro equipamento" },
];
const kindLabels: Record<EquipmentKind, string> = {
  oven: "Forno",
  mixer: "Batedeira",
  refrigeration: "Refrigeração",
  stove: "Fogão",
  utensil: "Ferramenta",
  other: "Equipamento",
};
const statusLabels = {
  active: "Disponível",
  maintenance: "Em manutenção",
  retired: "Fora da rotina",
} as const;

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T12:00:00Z`))
    .replaceAll(" de ", " ");
}
function AssetIcon({ kind }: { kind: EquipmentKind }) {
  if (kind === "oven" || kind === "stove") return <Flame aria-hidden="true" />;
  if (kind === "refrigeration") return <Snowflake aria-hidden="true" />;
  if (kind === "mixer") return <Settings2 aria-hidden="true" />;
  if (kind === "utensil") return <Wrench aria-hidden="true" />;
  return <PackageOpen aria-hidden="true" />;
}

export function EquipmentDashboard({
  initialWorkspace,
}: {
  initialWorkspace: EquipmentWorkspace;
}) {
  const createDialog = useRef<HTMLDialogElement>(null);
  const maintenanceDialog = useRef<HTMLDialogElement>(null);
  const usageDialog = useRef<HTMLDialogElement>(null);
  const unavailabilityDialog = useRef<HTMLDialogElement>(null);
  const lastNotification = useRef<number | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<EquipmentAsset | null>(
    null,
  );
  const [selectedKind, setSelectedKind] = useState("oven");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const initialState: EquipmentActionState = {
    status: "idle",
    operation: null,
    message: "",
    workspace: initialWorkspace,
    notificationId: null,
  };
  const [state, formAction, pending] = useActionState(
    mutateEquipmentAction,
    initialState,
  );
  const workspace = state.workspace;
  const orderOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "", label: "Uso geral, sem pedido específico" },
      ...workspace.ordersForUsage.map((order) => ({
        value: order.id,
        label: order.label,
      })),
    ],
    [workspace.ordersForUsage],
  );
  const today = new Date().toISOString().slice(0, 10);

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
    if (state.operation === "create") createDialog.current?.close();
    if (state.operation === "maintenance") maintenanceDialog.current?.close();
    if (state.operation === "usage") usageDialog.current?.close();
    if (state.operation === "unavailability")
      unavailabilityDialog.current?.close();
  }, [state]);

  function openMaintenance(asset: EquipmentAsset) {
    setSelectedAsset(asset);
    maintenanceDialog.current?.showModal();
  }
  function openUsage(asset: EquipmentAsset) {
    setSelectedAsset(asset);
    setSelectedOrder("");
    usageDialog.current?.showModal();
  }
  function openUnavailability(asset: EquipmentAsset) {
    setSelectedAsset(asset);
    unavailabilityDialog.current?.showModal();
  }

  return (
    <section className="view equipment-view">
      <PageBackButton />
      <header className="page-head equipment-page-head">
        <div>
          <p className="eyebrow">Ferramentas da cozinha</p>
          <h1>As mãos também têm suas companheiras.</h1>
          <p className="page-lede">
            Máquinas, ferramentas e cuidados reunidos sem transformar a cozinha
            em patrimônio contábil.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => createDialog.current?.showModal()}
        >
          <Plus aria-hidden="true" />
          Novo equipamento
        </button>
      </header>

      <section
        className="equipment-summary"
        aria-labelledby="equipment-summary-title"
      >
        <div className="equipment-summary-mark">
          <Wrench aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">Visão da cozinha</p>
          <h2 id="equipment-summary-title">
            {workspace.summary.activeCount}{" "}
            {workspace.summary.activeCount === 1
              ? "equipamento disponível"
              : "equipamentos disponíveis"}
            {workspace.summary.attentionCount
              ? ` e ${workspace.summary.attentionCount} pedindo atenção`
              : ", todos em ordem"}
            .
          </h2>
          <p>
            Investimento conhecido de{" "}
            {money(workspace.summary.acquisitionValue)} · manutenções
            registradas de {money(workspace.summary.maintenanceSpend)}.
          </p>
        </div>
        <div className="equipment-supported">
          <span>Receita dos pedidos apoiados</span>
          <strong>{money(workspace.summary.supportedRevenue)}</strong>
          <small>Não é lucro nem receita exclusiva dos equipamentos.</small>
        </div>
      </section>

      <div className="equipment-list">
        {workspace.equipment.map((asset) => (
          <article className="equipment-card" key={asset.id}>
            <header className="equipment-card-head">
              <div className="equipment-card-icon">
                <AssetIcon kind={asset.kind} />
              </div>
              <div className="equipment-card-title">
                <span>{kindLabels[asset.kind]}</span>
                <h2>{asset.name}</h2>
              </div>
              <span className="equipment-status" data-status={asset.status}>
                {statusLabels[asset.status]}
              </span>
              <p>
                {[asset.brand, asset.model].filter(Boolean).join(" · ") ||
                  "Sem marca ou modelo informado"}{" "}
                · capacidade para {asset.capacityUnits}{" "}
                {asset.capacityUnits === 1 ? "preparo" : "preparos"} ao mesmo
                tempo
              </p>
            </header>
            <div className="equipment-card-story">
              <div>
                <span>Conhecido até aqui</span>
                <strong>
                  {money(asset.purchaseValue + asset.maintenanceSpend)}
                </strong>
                <small>
                  {money(asset.purchaseValue)} de aquisição ·{" "}
                  {money(asset.maintenanceSpend)} de cuidados
                </small>
              </div>
              <div>
                <span>Participou de</span>
                <strong>
                  {asset.supportedOrderCount}{" "}
                  {asset.supportedOrderCount === 1 ? "pedido" : "pedidos"}
                </strong>
                <small>
                  {money(asset.supportedRevenue)} em encomendas apoiadas
                </small>
              </div>
              <div>
                <span>Usos registrados</span>
                <strong>{asset.usageCount}</strong>
                <small>
                  {asset.nextMaintenanceDate
                    ? `Próximo cuidado ${shortDate(asset.nextMaintenanceDate)}`
                    : "Sem revisão futura combinada"}
                </small>
              </div>
            </div>
            {asset.notes ? (
              <p className="equipment-note">{asset.notes}</p>
            ) : null}
            <div className="equipment-card-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => openUsage(asset)}
                disabled={asset.status === "retired"}
              >
                <Activity aria-hidden="true" />
                Registrar uso
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => openMaintenance(asset)}
              >
                <Wrench aria-hidden="true" />
                Manutenção
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => openUnavailability(asset)}
                disabled={asset.status === "retired"}
              >
                <CalendarClock aria-hidden="true" />
                Indisponibilidade
              </button>
              <details>
                <summary>
                  <History aria-hidden="true" />
                  Ver histórico
                </summary>
                <div className="equipment-history">
                  <section>
                    <h3>Cuidados</h3>
                    {asset.maintenance.length ? (
                      asset.maintenance.map((event) => (
                        <p key={event.id}>
                          <strong>{event.description}</strong>
                          <span>
                            {shortDate(event.performedAt)} · {money(event.cost)}
                            {event.provider ? ` · ${event.provider}` : ""}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p>
                        <span>Nenhuma manutenção registrada.</span>
                      </p>
                    )}
                  </section>
                  <section>
                    <h3>Usos recentes</h3>
                    {asset.usages.length ? (
                      asset.usages.map((usage) => (
                        <p key={usage.id}>
                          <strong>{usage.orderLabel ?? "Uso geral"}</strong>
                          <span>
                            {shortDate(usage.usedAt)}
                            {usage.durationMinutes
                              ? ` · ${usage.durationMinutes} min`
                              : ""}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p>
                        <span>Nenhum uso registrado.</span>
                      </p>
                    )}
                  </section>
                  <section>
                    <h3>Agenda indisponível</h3>
                    {asset.unavailability.length ? (
                      asset.unavailability.map((period) => (
                        <p key={period.id}>
                          <strong>{period.reason}</strong>
                          <span>
                            {new Date(period.startsAt).toLocaleString("pt-BR")}{" "}
                            — {new Date(period.endsAt).toLocaleString("pt-BR")}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p>
                        <span>Nenhum período futuro bloqueado.</span>
                      </p>
                    )}
                  </section>
                  <form action={formAction}>
                    <input type="hidden" name="operation" value="status" />
                    <input type="hidden" name="equipmentId" value={asset.id} />
                    <input
                      type="hidden"
                      name="assetStatus"
                      value={
                        asset.status === "maintenance"
                          ? "active"
                          : "maintenance"
                      }
                    />
                    <button
                      className="quiet-action"
                      type="submit"
                      disabled={pending}
                    >
                      {asset.status === "maintenance"
                        ? "Marcar como disponível"
                        : "Separar para manutenção"}
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </article>
        ))}
        {!workspace.equipment.length ? (
          <div className="equipment-empty">
            <Wrench aria-hidden="true" />
            <h2>A cozinha ainda não apresentou suas ferramentas.</h2>
            <p>Comece pelo equipamento que mais participa da rotina.</p>
          </div>
        ) : null}
      </div>

      <dialog
        className="purchase-dialog finance-dialog equipment-dialog"
        ref={createDialog}
        aria-labelledby="create-equipment-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Novo equipamento"
            eyebrow="Equipamentos"
            closeLabel="Fechar novo equipamento"
            onClose={() => createDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Nova companheira</p>
                <h2 id="create-equipment-title">O que trabalha com você?</h2>
              </div>
              <p>
                O valor de compra apoia uma leitura gerencial. Não representa
                imobilizado ou depreciação contábil.
              </p>
            </header>
            <form className="finance-form" action={formAction}>
              <input type="hidden" name="operation" value="create" />
              <input
                type="hidden"
                name="idempotencyKey"
                value={crypto.randomUUID()}
              />
              <label className="form-field form-field-wide">
                <span>Nome do equipamento</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  placeholder="Ex.: Forno elétrico principal"
                />
              </label>
              <div className="form-field">
                <label htmlFor="equipment-kind">Tipo</label>
                <SearchableCombobox
                  id="equipment-kind"
                  name="kind"
                  options={kindOptions}
                  value={selectedKind}
                  onValueChange={setSelectedKind}
                  required
                />
              </div>
              <label className="form-field">
                <span>
                  Marca <small>opcional</small>
                </span>
                <input name="brand" placeholder="Ex.: Venâncio" />
              </label>
              <label className="form-field">
                <span>
                  Modelo <small>opcional</small>
                </span>
                <input name="model" />
              </label>
              <div className="form-field">
                <label htmlFor="equipment-purchase-date">Data da compra</label>
                <DatePicker id="equipment-purchase-date" name="purchaseDate" />
              </div>
              <div className="form-field">
                <label htmlFor="equipment-purchase-value">
                  Valor da compra
                </label>
                <NumberField
                  id="equipment-purchase-value"
                  name="purchaseValue"
                  min={0}
                  step={0.01}
                  prefix="R$"
                  defaultValue="0"
                />
              </div>
              <div className="form-field">
                <label htmlFor="equipment-capacity">
                  Capacidade simultânea
                </label>
                <NumberField
                  id="equipment-capacity"
                  name="capacityUnits"
                  min={1}
                  max={50}
                  step={1}
                  suffix="preparos"
                  defaultValue="1"
                  integerOnly
                />
              </div>
              <label className="form-field form-field-wide">
                <span>
                  Como ele participa da rotina? <small>opcional</small>
                </span>
                <input
                  name="notes"
                  placeholder="Ex.: principal equipamento para massas e assados"
                />
              </label>
              {state.status === "error" && state.operation === "create" ? (
                <p className="form-message-error">{state.message}</p>
              ) : null}
              <footer className="dialog-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => createDialog.current?.close()}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending}
                >
                  Guardar equipamento
                </button>
              </footer>
            </form>
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog finance-dialog equipment-dialog"
        ref={maintenanceDialog}
        aria-labelledby="maintenance-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title={selectedAsset?.name ?? "Registrar manutenção"}
            eyebrow="Cuidado e manutenção"
            closeLabel="Fechar manutenção"
            onClose={() => maintenanceDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Cuidado e manutenção</p>
                <h2 id="maintenance-title">
                  O que foi feito em {selectedAsset?.name ?? "equipamento"}?
                </h2>
              </div>
              <p>
                O histórico fica com o equipamento. O custo ainda não cria uma
                saída automática no Financeiro.
              </p>
            </header>
            {selectedAsset ? (
              <form className="finance-form" action={formAction}>
                <input type="hidden" name="operation" value="maintenance" />
                <input
                  type="hidden"
                  name="equipmentId"
                  value={selectedAsset.id}
                />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={crypto.randomUUID()}
                />
                <label className="form-field form-field-wide">
                  <span>Serviço realizado</span>
                  <input
                    name="description"
                    required
                    minLength={2}
                    placeholder="Ex.: Limpeza e revisão da resistência"
                  />
                </label>
                <div className="form-field">
                  <label htmlFor="maintenance-date">Data</label>
                  <DatePicker
                    id="maintenance-date"
                    name="performedAt"
                    defaultValue={today}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="maintenance-cost">Custo</label>
                  <NumberField
                    id="maintenance-cost"
                    name="cost"
                    min={0}
                    step={0.01}
                    prefix="R$"
                    defaultValue="0"
                  />
                </div>
                <label className="form-field">
                  <span>
                    Quem realizou <small>opcional</small>
                  </span>
                  <input name="provider" />
                </label>
                <div className="form-field">
                  <label htmlFor="next-maintenance-date">
                    Próximo cuidado <small>opcional</small>
                  </label>
                  <DatePicker id="next-maintenance-date" name="nextDueDate" />
                </div>
                <label className="form-field form-field-wide">
                  <span>
                    Observação <small>opcional</small>
                  </span>
                  <input name="notes" />
                </label>
                {state.status === "error" &&
                state.operation === "maintenance" ? (
                  <p className="form-message-error">{state.message}</p>
                ) : null}
                <footer className="dialog-actions">
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => maintenanceDialog.current?.close()}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={pending}
                  >
                    Registrar cuidado
                  </button>
                </footer>
              </form>
            ) : null}
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog finance-dialog equipment-dialog"
        ref={usageDialog}
        aria-labelledby="usage-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title={selectedAsset?.name ?? "Registrar participação"}
            eyebrow="Participação na produção"
            closeLabel="Fechar participação na produção"
            onClose={() => usageDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Participação na produção</p>
                <h2 id="usage-title">
                  Onde {selectedAsset?.name ?? "o equipamento"} ajudou?
                </h2>
              </div>
              <p>
                Vincular um pedido permite medir receita apoiada. Ela não deve
                ser somada entre equipamentos.
              </p>
            </header>
            {selectedAsset ? (
              <form className="finance-form" action={formAction}>
                <input type="hidden" name="operation" value="usage" />
                <input
                  type="hidden"
                  name="equipmentId"
                  value={selectedAsset.id}
                />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={crypto.randomUUID()}
                />
                <div className="form-field form-field-wide">
                  <label htmlFor="equipment-order">
                    Pedido <small>opcional</small>
                  </label>
                  <SearchableCombobox
                    id="equipment-order"
                    name="orderId"
                    options={orderOptions}
                    value={selectedOrder}
                    onValueChange={setSelectedOrder}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="usage-date">Data do uso</label>
                  <DatePicker
                    id="usage-date"
                    name="usedAt"
                    defaultValue={today}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="usage-duration">
                    Tempo aproximado <small>opcional</small>
                  </label>
                  <NumberField
                    id="usage-duration"
                    name="durationMinutes"
                    min={5}
                    step={5}
                    suffix="min"
                    integerOnly
                  />
                </div>
                <label className="form-field form-field-wide">
                  <span>
                    Observação <small>opcional</small>
                  </span>
                  <input
                    name="notes"
                    placeholder="Ex.: assou duas massas em sequência"
                  />
                </label>
                {state.status === "error" && state.operation === "usage" ? (
                  <p className="form-message-error">{state.message}</p>
                ) : null}
                <footer className="dialog-actions">
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => usageDialog.current?.close()}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={pending}
                  >
                    Registrar participação
                  </button>
                </footer>
              </form>
            ) : null}
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog finance-dialog equipment-dialog"
        ref={unavailabilityDialog}
        aria-labelledby="unavailability-title"
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title={selectedAsset?.name ?? "Indisponibilidade"}
            eyebrow="Agenda do equipamento"
            closeLabel="Fechar indisponibilidade"
            onClose={() => unavailabilityDialog.current?.close()}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Agenda do equipamento</p>
                <h2 id="unavailability-title">
                  Quando {selectedAsset?.name ?? "o equipamento"} não poderá
                  ajudar?
                </h2>
              </div>
              <p>
                Esse período entra no planejamento dos novos pedidos e também
                protege o replanejamento dos pedidos atuais.
              </p>
            </header>
            {selectedAsset ? (
              <form className="finance-form" action={formAction}>
                <input type="hidden" name="operation" value="unavailability" />
                <input
                  type="hidden"
                  name="equipmentId"
                  value={selectedAsset.id}
                />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={crypto.randomUUID()}
                />
                <label className="form-field">
                  <span>Começa em</span>
                  <input type="datetime-local" name="startsAt" required />
                </label>
                <label className="form-field">
                  <span>Termina em</span>
                  <input type="datetime-local" name="endsAt" required />
                </label>
                <label className="form-field form-field-wide">
                  <span>Por que ficará indisponível?</span>
                  <input
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Ex.: manutenção agendada ou uso pessoal"
                  />
                </label>
                {state.status === "error" &&
                state.operation === "unavailability" ? (
                  <p className="form-message-error">{state.message}</p>
                ) : null}
                <footer className="dialog-actions">
                  <button
                    className="quiet-action"
                    type="button"
                    onClick={() => unavailabilityDialog.current?.close()}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={pending}
                  >
                    <CalendarClock aria-hidden="true" />
                    Guardar na agenda
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
