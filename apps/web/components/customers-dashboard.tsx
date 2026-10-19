"use client";

import {
  CircleAlert,
  CircleUserRound,
  ContactRound,
  Download,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  anonymizeCustomerAction,
  exportCustomerPrivacyAction,
  saveCustomerAction,
  type CustomerActionState,
  type CustomerPrivacyActionState,
} from "@/app/clientes/actions";
import {
  SearchableCombobox,
  TextAreaField,
  type ComboboxOption,
} from "@/components/form-controls";
import { SystemNotifications } from "@/components/system-notifications";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import { PageBackButton } from "@/components/page-back-button";
import { usePostalCodeLookup } from "@/components/use-postal-code-lookup";
import type {
  CustomerAddress,
  CustomerProfile,
  CustomerWorkspace,
} from "@/lib/customers";
import { formatCustomerAddress } from "@/lib/customers";
import {
  formatPostalCode,
  preserveTypedAddressDetail,
  type PostalCodeAddress,
} from "@/lib/postal-code";

type CustomersDashboardProps = {
  initialWorkspace: CustomerWorkspace;
};

type AddressDraft = CustomerAddress & { key: string };

const deliveryOptions: ComboboxOption[] = [
  { value: "", label: "Decidir em cada pedido" },
  { value: "delivery", label: "Costuma pedir entrega" },
  { value: "pickup", label: "Costuma retirar" },
];

const paymentOptions: ComboboxOption[] = [
  { value: "", label: "Decidir em cada pedido" },
  { value: "pix", label: "Pix" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro" },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function emptyAddress(recipient = ""): AddressDraft {
  return {
    key: crypto.randomUUID(),
    id: "",
    label: "Casa",
    recipient,
    formattedAddress: "",
    postalCode: "",
    street: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    deliveryInstructions: "",
    isDefault: true,
  };
}

function addressDraft(address: CustomerAddress): AddressDraft {
  return {
    ...address,
    key: address.id,
    postalCode: formatPostalCode(address.postalCode ?? ""),
    street: address.street ?? address.formattedAddress,
    addressNumber: address.addressNumber ?? "",
    addressComplement: address.addressComplement ?? "",
    neighborhood: address.neighborhood ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
  };
}

type AddressField = keyof Omit<AddressDraft, "key" | "id">;

type CustomerAddressEditorProps = {
  address: AddressDraft;
  index: number;
  customerName: string;
  onUpdate: (key: string, field: AddressField, value: string | boolean) => void;
  onPatch: (key: string, values: Partial<AddressDraft>) => void;
  onChooseDefault: (key: string) => void;
  onRemove: (key: string) => void;
};

function CustomerAddressEditor({
  address,
  index,
  customerName,
  onUpdate,
  onPatch,
  onChooseDefault,
  onRemove,
}: CustomerAddressEditorProps) {
  const complementRef = useRef(address.addressComplement ?? "");
  useEffect(() => {
    complementRef.current = address.addressComplement ?? "";
  }, [address.addressComplement]);
  const resolvePostalCode = useCallback(
    (resolved: PostalCodeAddress) => {
      onPatch(address.key, {
        postalCode: formatPostalCode(resolved.postalCode),
        street: resolved.street,
        addressComplement: preserveTypedAddressDetail(
          complementRef.current,
          resolved.complement,
        ),
        neighborhood: resolved.neighborhood,
        city: resolved.city,
        state: resolved.state,
      });
    },
    [address.key, onPatch],
  );
  const lookup = usePostalCodeLookup(
    address.postalCode ?? "",
    resolvePostalCode,
  );
  const fieldId = (field: string) => `address-${field}-${address.key}`;

  return (
    <section className="customer-address-editor">
      <div className="customer-address-editor-head">
        <div>
          <MapPin aria-hidden="true" />
          <strong>Endereço {index + 1}</strong>
        </div>
        <div>
          <label className="customer-default-choice">
            <input
              type="radio"
              name="defaultAddress"
              checked={address.isDefault}
              onChange={() => onChooseDefault(address.key)}
            />
            Principal
          </label>
          <button
            className="quiet-action"
            type="button"
            onClick={() => onRemove(address.key)}
          >
            Retirar
          </button>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor={fieldId("label")}>Como chamamos este lugar?</label>
          <input
            id={fieldId("label")}
            value={address.label}
            onChange={(event) =>
              onUpdate(address.key, "label", event.target.value)
            }
            placeholder="Casa, trabalho…"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor={fieldId("recipient")}>Quem recebe?</label>
          <input
            id={fieldId("recipient")}
            value={address.recipient}
            onChange={(event) =>
              onUpdate(address.key, "recipient", event.target.value)
            }
            autoComplete="name"
            placeholder={customerName || "Nome de quem recebe"}
            required
          />
        </div>
      </div>

      <div className="customer-address-location-grid">
        <div className="form-field customer-address-postal-code">
          <label htmlFor={fieldId("postal-code")}>CEP</label>
          <input
            id={fieldId("postal-code")}
            value={address.postalCode ?? ""}
            onChange={(event) =>
              onUpdate(
                address.key,
                "postalCode",
                formatPostalCode(event.target.value),
              )
            }
            maxLength={9}
            pattern="[0-9]{5}-?[0-9]{3}"
            title="Informe o CEP no formato 00000-000."
            inputMode="numeric"
            autoComplete="postal-code"
            aria-describedby={
              lookup.status === "error"
                ? fieldId("postal-code-error")
                : undefined
            }
            aria-invalid={lookup.status === "error"}
            aria-busy={lookup.status === "loading"}
            placeholder="00000-000"
          />
          <span className="visually-hidden" aria-live="polite">
            {lookup.status === "loading"
              ? "Buscando o endereço pelo CEP."
              : lookup.status === "success"
                ? "Endereço encontrado."
                : ""}
          </span>
          {lookup.status === "error" ? (
            <small
              className="postal-code-status is-error"
              id={fieldId("postal-code-error")}
              role="alert"
            >
              <CircleAlert aria-hidden="true" />
              {lookup.message}
            </small>
          ) : null}
        </div>

        <div className="form-field customer-address-street">
          <label htmlFor={fieldId("street")}>Logradouro</label>
          <input
            id={fieldId("street")}
            value={address.street ?? ""}
            onChange={(event) =>
              onUpdate(address.key, "street", event.target.value)
            }
            autoComplete="address-line1"
            placeholder="Rua, avenida ou estrada"
            required
          />
        </div>

        <div className="form-field customer-address-number">
          <label htmlFor={fieldId("number")}>Número</label>
          <input
            id={fieldId("number")}
            value={address.addressNumber ?? ""}
            onChange={(event) =>
              onUpdate(address.key, "addressNumber", event.target.value)
            }
            autoComplete="address-line2"
            placeholder="Ex.: 128-A ou s/n"
            required={Boolean(address.postalCode)}
          />
        </div>

        <div className="form-field customer-address-complement">
          <label htmlFor={fieldId("complement")}>Complemento</label>
          <input
            id={fieldId("complement")}
            value={address.addressComplement ?? ""}
            onChange={(event) =>
              onUpdate(address.key, "addressComplement", event.target.value)
            }
            autoComplete="address-line3"
            placeholder="Apartamento, bloco ou referência — opcional"
          />
        </div>

        <div className="form-field customer-address-neighborhood">
          <label htmlFor={fieldId("neighborhood")}>Bairro</label>
          <input
            id={fieldId("neighborhood")}
            value={address.neighborhood ?? ""}
            onChange={(event) =>
              onUpdate(address.key, "neighborhood", event.target.value)
            }
            autoComplete="address-level3"
            required={Boolean(address.postalCode)}
          />
        </div>

        <div className="form-field customer-address-city">
          <label htmlFor={fieldId("city")}>Cidade</label>
          <input
            id={fieldId("city")}
            value={address.city ?? ""}
            onChange={(event) =>
              onUpdate(address.key, "city", event.target.value)
            }
            autoComplete="address-level2"
            required={Boolean(address.postalCode)}
          />
        </div>

        <div className="form-field customer-address-state">
          <label htmlFor={fieldId("state")}>UF</label>
          <input
            id={fieldId("state")}
            value={address.state ?? ""}
            onChange={(event) =>
              onUpdate(
                address.key,
                "state",
                event.target.value.toUpperCase().slice(0, 2),
              )
            }
            autoComplete="address-level1"
            maxLength={2}
            placeholder="SP"
            required={Boolean(address.postalCode)}
          />
        </div>
      </div>

      <div className="form-field customer-address-instructions">
        <label htmlFor={fieldId("note")}>Instruções para chegar</label>
        <input
          id={fieldId("note")}
          value={address.deliveryInstructions ?? ""}
          onChange={(event) =>
            onUpdate(address.key, "deliveryInstructions", event.target.value)
          }
          placeholder="Portaria, referência ou cuidado especial — opcional"
        />
      </div>
    </section>
  );
}

export function CustomersDashboard({
  initialWorkspace,
}: CustomersDashboardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const privacyDialogRef = useRef<HTMLDialogElement>(null);
  const dialogScrollRef = useRef<HTMLDivElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);
  const lastHandledNotification = useRef<number | null>(null);
  const initialActionState: CustomerActionState = {
    status: "idle",
    message: "",
    workspace: initialWorkspace,
    customer: null,
    candidate: null,
    notificationId: null,
  };
  const [actionState, formAction, pending] = useActionState(
    saveCustomerAction,
    initialActionState,
  );
  const initialPrivacyState: CustomerPrivacyActionState = {
    status: "idle",
    message: "",
    workspace: initialWorkspace,
    notificationId: null,
  };
  const [privacyState, privacyFormAction, privacyPending] = useActionState(
    anonymizeCustomerAction,
    initialPrivacyState,
  );
  const [exportPending, startExportTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredDelivery, setPreferredDelivery] = useState("");
  const [preferredPayment, setPreferredPayment] = useState("");
  const [addresses, setAddresses] = useState<AddressDraft[]>([]);
  const [dismissedNotification, setDismissedNotification] = useState<
    number | null
  >(null);
  const [ignoredDuplicate, setIgnoredDuplicate] = useState<string | null>(null);
  const [privacyConfirmation, setPrivacyConfirmation] = useState("");
  const [privacyReason, setPrivacyReason] = useState("");
  const [privacyNotice, setPrivacyNotice] = useState<{
    id: number;
    message: string;
  } | null>(null);

  const workspace =
    privacyState.status === "success"
      ? privacyState.workspace
      : actionState.workspace;
  const query = normalize(search.trim());
  const visibleCustomers = workspace.customers.filter((customer) =>
    normalize(
      `${customer.name} ${customer.primaryPhone} ${customer.email ?? ""} ${customer.addresses.map((address) => address.formattedAddress).join(" ")}`,
    ).includes(query),
  );
  const notificationCandidate =
    privacyState.status === "success" && privacyState.notificationId
      ? {
          id: privacyState.notificationId,
          message: privacyState.message,
        }
      : actionState.status === "success" && actionState.notificationId
        ? { id: actionState.notificationId, message: actionState.message }
        : privacyNotice;
  const notification =
    notificationCandidate && notificationCandidate.id !== dismissedNotification
      ? [notificationCandidate]
      : [];
  const duplicate =
    actionState.status === "duplicate" &&
    actionState.candidate?.id !== ignoredDuplicate
      ? actionState.candidate
      : null;

  useEffect(() => {
    if (
      actionState.status !== "success" ||
      !actionState.notificationId ||
      lastHandledNotification.current === actionState.notificationId
    ) {
      return;
    }
    lastHandledNotification.current = actionState.notificationId;
    setDismissedNotification(null);
    dialogRef.current?.close();
  }, [actionState.notificationId, actionState.status]);

  useEffect(() => {
    if (privacyState.status !== "success") return;
    privacyDialogRef.current?.close();
    dialogRef.current?.close();
  }, [privacyState.status, privacyState.notificationId]);

  function resetForm() {
    setEditingId("");
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setPreferredDelivery("");
    setPreferredPayment("");
    setAddresses([]);
    setIgnoredDuplicate(actionState.candidate?.id ?? null);
  }

  function showCustomerDialog() {
    dialogRef.current?.showModal();
    dialogScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }

  function openNewCustomer() {
    resetForm();
    showCustomerDialog();
  }

  function openCustomer(customer: CustomerProfile) {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.primaryPhone);
    setEmail(customer.email ?? "");
    setNotes(customer.notes ?? "");
    setPreferredDelivery(customer.preferredDeliveryMode ?? "");
    setPreferredPayment(customer.preferredPaymentMethod ?? "");
    setAddresses(customer.addresses.map(addressDraft));
    setIgnoredDuplicate(actionState.candidate?.id ?? null);
    showCustomerDialog();
  }

  const updateAddress = useCallback(function updateAddress(
    key: string,
    field: AddressField,
    value: string | boolean,
  ) {
    setAddresses((current) =>
      current.map((address) =>
        address.key === key ? { ...address, [field]: value } : address,
      ),
    );
  }, []);

  const patchAddress = useCallback(function patchAddress(
    key: string,
    values: Partial<AddressDraft>,
  ) {
    setAddresses((current) =>
      current.map((address) =>
        address.key === key ? { ...address, ...values } : address,
      ),
    );
  }, []);

  function addAddress() {
    setAddresses((current) => [
      ...current.map((address) => ({ ...address, isDefault: false })),
      emptyAddress(name),
    ]);
  }

  const removeAddress = useCallback(function removeAddress(key: string) {
    setAddresses((current) => {
      const remaining = current.filter((address) => address.key !== key);
      if (
        remaining.length > 0 &&
        !remaining.some((address) => address.isDefault)
      ) {
        remaining[0] = { ...remaining[0]!, isDefault: true };
      }
      return remaining;
    });
  }, []);

  const chooseDefaultAddress = useCallback(function chooseDefaultAddress(
    key: string,
  ) {
    setAddresses((current) =>
      current.map((address) => ({
        ...address,
        isDefault: address.key === key,
      })),
    );
  }, []);

  function prepareSubmission(event: FormEvent<HTMLFormElement>) {
    if (!payloadRef.current) {
      event.preventDefault();
      return;
    }
    setIgnoredDuplicate(null);
    payloadRef.current.value = JSON.stringify({
      name,
      primaryPhone: phone,
      email: email.trim() || null,
      notes: notes.trim() || null,
      preferredDeliveryMode: preferredDelivery || null,
      preferredPaymentMethod: preferredPayment || null,
      addresses: addresses.map((address) => {
        const structuredAddress = {
          postalCode: address.postalCode?.trim() || null,
          street: address.street?.trim() || null,
          addressNumber: address.addressNumber?.trim() || null,
          addressComplement: address.addressComplement?.trim() || null,
          neighborhood: address.neighborhood?.trim() || null,
          city: address.city?.trim() || null,
          state: address.state?.trim().toUpperCase() || null,
        };
        return {
          id: address.id || undefined,
          label: address.label,
          recipient: address.recipient,
          formattedAddress: formatCustomerAddress(structuredAddress),
          ...structuredAddress,
          isDefault: address.isDefault,
          deliveryInstructions: address.deliveryInstructions?.trim() || null,
        };
      }),
    });
  }

  function openDuplicateCandidate() {
    if (!duplicate) return;
    const customer = workspace.customers.find(
      (entry) => entry.id === duplicate.id,
    );
    if (customer) openCustomer(customer);
  }

  function openPrivacyDialog() {
    setPrivacyConfirmation("");
    setPrivacyReason("");
    privacyDialogRef.current?.showModal();
  }

  function downloadPrivacyData() {
    if (!editingId) return;
    startExportTransition(async () => {
      const result = await exportCustomerPrivacyAction(editingId);
      const noticeId = Date.now();
      setPrivacyNotice({ id: noticeId, message: result.message });
      setDismissedNotification(null);
      if (!result.content || !result.filename) return;
      const blob = new Blob([result.content], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="view customers-view" aria-labelledby="customers-title">
      <PageBackButton />
      <header className="page-head customers-page-head">
        <div>
          <p className="eyebrow">Caderno de clientes</p>
          <h1 id="customers-title">Quem volta, já chega conhecida.</h1>
          <p className="lead">
            Contato, entrega e pequenos combinados guardados com propósito.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          aria-haspopup="dialog"
          aria-controls="customer-panel"
          onClick={openNewCustomer}
        >
          <Plus aria-hidden="true" />
          Nova cliente
        </button>
      </header>

      <div className="summary-line" aria-label="Resumo dos clientes">
        <span>
          <strong>{workspace.summary.customerCount}</strong> clientes no caderno
        </span>
        <span>
          <strong>{workspace.summary.deliveryReadyCount}</strong> com endereço
          pronto
        </span>
        <span>
          <strong>{workspace.summary.returningCount}</strong> já voltaram a
          pedir
        </span>
      </div>

      <section className="customers-book" aria-labelledby="customer-list-title">
        <div className="section-head customers-list-head">
          <div>
            <h2 id="customer-list-title">Pessoas que já conhecemos</h2>
            <span>Abra um cartão para cuidar dos detalhes</span>
          </div>
          <label className="customer-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Buscar cliente</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, telefone ou endereço"
            />
          </label>
        </div>

        {visibleCustomers.length > 0 ? (
          <div className="customer-list">
            {visibleCustomers.map((customer) => {
              const defaultAddress =
                customer.addresses.find((address) => address.isDefault) ??
                customer.addresses[0];
              return (
                <button
                  className="customer-card"
                  type="button"
                  key={customer.id}
                  onClick={() => openCustomer(customer)}
                  aria-label={`Abrir cadastro de ${customer.name}`}
                >
                  <span className="customer-initial" aria-hidden="true">
                    {customer.name.charAt(0).toLocaleUpperCase("pt-BR")}
                  </span>
                  <span className="customer-card-copy">
                    <small>
                      {customer.orderCount > 0
                        ? `${customer.orderCount} pedido${customer.orderCount > 1 ? "s" : ""}`
                        : "Novo vínculo"}
                    </small>
                    <strong>{customer.name}</strong>
                    <span>{customer.primaryPhone}</span>
                  </span>
                  <span className="customer-card-address">
                    <MapPin aria-hidden="true" />
                    <span>
                      <small>
                        {defaultAddress?.label ?? "Entrega a combinar"}
                      </small>
                      <strong>
                        {defaultAddress?.formattedAddress ??
                          "Nenhum endereço necessário por enquanto"}
                      </strong>
                    </span>
                  </span>
                  <span className="customer-card-preference">
                    {customer.preferredDeliveryMode === "pickup"
                      ? "Prefere retirar"
                      : customer.preferredDeliveryMode === "delivery"
                        ? "Prefere entrega"
                        : "Combina a cada pedido"}
                    <Pencil aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="customers-empty">
            <ContactRound aria-hidden="true" />
            <h3>Ninguém apareceu com essa busca.</h3>
            <p>
              Experimente o primeiro nome, o telefone ou uma parte do endereço.
            </p>
          </div>
        )}
      </section>

      <dialog
        className="purchase-dialog customer-dialog"
        ref={dialogRef}
        aria-labelledby="customer-dialog-title"
        aria-describedby="customer-dialog-description"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <section
          className="purchase-panel customer-panel rounded-scroll-shell"
          id="customer-panel"
        >
          <ModalGlassHeader
            title={editingId ? name : "Nova cliente"}
            titleId="customer-dialog-title"
            eyebrow={editingId ? "Editar cliente" : "Clientes"}
            closeLabel="Fechar cadastro de cliente"
            onClose={() => dialogRef.current?.close()}
          />
          <div
            className="purchase-panel-scroll rounded-scroll-area"
            ref={dialogScrollRef}
          >
            <div className="purchase-panel-head customer-panel-head">
              <div>
                <h2>{editingId ? name : "Quem está chegando?"}</h2>
              </div>
              <p id="customer-dialog-description">
                Guardamos somente o que ajuda a reconhecer, combinar e entregar
                bem.
              </p>
            </div>

            <form
              action={formAction}
              className="purchase-form customer-form"
              onSubmit={prepareSubmission}
            >
              <input ref={payloadRef} type="hidden" name="customerPayload" />
              <input type="hidden" name="customerId" value={editingId} />

              <fieldset>
                <legend>
                  <span>1</span> Como reconhecemos
                </legend>
                <div className="form-grid customer-contact-grid">
                  <div className="form-field">
                    <label htmlFor="customer-name">Nome</label>
                    <input
                      id="customer-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      placeholder="Ex.: Ana Paula"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="customer-phone">Telefone com DDD</label>
                    <input
                      id="customer-phone"
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      autoComplete="tel"
                      placeholder="(11) 98888-1234"
                      required
                    />
                  </div>
                  <div className="form-field form-field-wide">
                    <label htmlFor="customer-email">E-mail</label>
                    <input
                      id="customer-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="Opcional"
                    />
                    <small>
                      Só informe se ele for usado em confirmações ou recibos.
                    </small>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>
                  <span>2</span> Onde entregamos
                </legend>
                <div className="customer-addresses">
                  {addresses.map((address, index) => (
                    <CustomerAddressEditor
                      key={address.key}
                      address={address}
                      index={index}
                      customerName={name}
                      onUpdate={updateAddress}
                      onPatch={patchAddress}
                      onChooseDefault={chooseDefaultAddress}
                      onRemove={removeAddress}
                    />
                  ))}
                  <button
                    className="button button-secondary customer-add-address"
                    type="button"
                    onClick={addAddress}
                    disabled={addresses.length >= 5}
                  >
                    <Plus aria-hidden="true" />
                    {addresses.length === 0
                      ? "Adicionar endereço"
                      : "Adicionar outro endereço"}
                  </button>
                  <small>
                    Endereço é opcional para quem costuma retirar na
                    confeitaria.
                  </small>
                </div>
              </fieldset>

              <fieldset>
                <legend>
                  <span>3</span> Pequenos combinados
                </legend>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="customer-delivery-preference">
                      Entrega habitual
                    </label>
                    <SearchableCombobox
                      id="customer-delivery-preference"
                      name="preferredDeliveryMode"
                      options={deliveryOptions}
                      value={preferredDelivery}
                      onValueChange={setPreferredDelivery}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="customer-payment-preference">
                      Pagamento habitual
                    </label>
                    <SearchableCombobox
                      id="customer-payment-preference"
                      name="preferredPaymentMethod"
                      options={paymentOptions}
                      value={preferredPayment}
                      onValueChange={setPreferredPayment}
                    />
                  </div>
                  <div className="form-field form-field-wide">
                    <label htmlFor="customer-notes">
                      O que ajuda a atender bem?
                    </label>
                    <TextAreaField
                      id="customer-notes"
                      value={notes}
                      onValueChange={setNotes}
                      maxLength={1000}
                      placeholder="Ex.: prefere mensagem curta, confirmar antes de sair…"
                    />
                    <small>
                      Evite dados sensíveis; anote somente o necessário para o
                      atendimento.
                    </small>
                  </div>
                </div>
              </fieldset>

              {duplicate ? (
                <div className="duplicate-suggestion" role="alert">
                  <div>
                    <CircleUserRound aria-hidden="true" />
                    <div>
                      <h3>Essa cliente talvez já esteja no caderno</h3>
                      <p>{actionState.message}</p>
                    </div>
                  </div>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={openDuplicateCandidate}
                  >
                    Abrir cadastro de {duplicate.name}
                  </button>
                </div>
              ) : null}

              {actionState.status === "error" ? (
                <p className="form-message is-error" role="alert">
                  {actionState.message}
                </p>
              ) : null}

              <aside className="customer-privacy-note">
                <ContactRound aria-hidden="true" />
                <div>
                  <strong>Dados com finalidade</strong>
                  <span>
                    Este cadastro serve para reconhecer a cliente, combinar e
                    entregar. Nada além disso.
                  </span>
                </div>
              </aside>

              {editingId ? (
                <section
                  className="customer-privacy-actions"
                  aria-labelledby="customer-privacy-title"
                >
                  <div>
                    <ShieldCheck aria-hidden="true" />
                    <div>
                      <strong id="customer-privacy-title">
                        Privacidade da cliente
                      </strong>
                      <span>
                        Entregue uma cópia ou remova os dados pessoais sem
                        apagar pedidos e valores históricos.
                      </span>
                    </div>
                  </div>
                  <div>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={downloadPrivacyData}
                      disabled={exportPending}
                    >
                      <Download aria-hidden="true" />
                      {exportPending ? "Preparando…" : "Baixar cópia"}
                    </button>
                    <button
                      className="quiet-action is-danger"
                      type="button"
                      onClick={openPrivacyDialog}
                    >
                      Anonimizar dados
                    </button>
                  </div>
                </section>
              ) : null}

              <div className="purchase-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending}
                >
                  <ContactRound aria-hidden="true" />
                  {pending
                    ? "Guardando com cuidado…"
                    : editingId
                      ? "Salvar alterações"
                      : "Guardar cliente"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </dialog>

      <dialog
        className="purchase-dialog privacy-confirm-dialog"
        ref={privacyDialogRef}
        aria-labelledby="privacy-confirm-title"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            privacyDialogRef.current?.close();
          }
        }}
      >
        <section className="purchase-panel privacy-confirm-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Anonimizar cliente"
            eyebrow="Privacidade"
            closeLabel="Fechar confirmação de anonimização"
            onClose={() => privacyDialogRef.current?.close()}
          />
          <div className="purchase-panel-scroll privacy-confirm-content rounded-scroll-area">
            <p className="eyebrow">Solicitação de privacidade</p>
            <h2 id="privacy-confirm-title">Remover os dados pessoais?</h2>
            <p>
              Nome, contato, endereço e observações serão substituídos. Pedidos,
              recebimentos e valores permanecem preservados sem identificar a
              cliente.
            </p>
            <form action={privacyFormAction}>
              <input type="hidden" name="customerId" value={editingId} />
              <div className="form-field">
                <label htmlFor="privacy-reason">Motivo da solicitação</label>
                <TextAreaField
                  id="privacy-reason"
                  name="reason"
                  value={privacyReason}
                  onValueChange={setPrivacyReason}
                  placeholder="Ex.: solicitação feita pela titular"
                  required
                  minLength={5}
                  maxLength={500}
                />
              </div>
              <div className="form-field">
                <label htmlFor="privacy-confirmation">
                  Digite ANONIMIZAR para confirmar
                </label>
                <input
                  id="privacy-confirmation"
                  name="confirmation"
                  value={privacyConfirmation}
                  onChange={(event) =>
                    setPrivacyConfirmation(event.target.value.toUpperCase())
                  }
                  autoComplete="off"
                  required
                />
              </div>
              {privacyState.status === "error" ? (
                <p className="form-message is-error" role="alert">
                  {privacyState.message}
                </p>
              ) : null}
              <div className="purchase-actions">
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => privacyDialogRef.current?.close()}
                >
                  Voltar
                </button>
                <button
                  className="button button-danger"
                  type="submit"
                  disabled={
                    privacyPending ||
                    privacyConfirmation !== "ANONIMIZAR" ||
                    privacyReason.trim().length < 5
                  }
                >
                  {privacyPending ? "Anonimizando…" : "Anonimizar agora"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </dialog>

      <SystemNotifications
        notifications={notification}
        onDismiss={(id) => setDismissedNotification(id)}
      />
    </section>
  );
}
