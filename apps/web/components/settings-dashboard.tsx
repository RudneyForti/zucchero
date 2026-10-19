"use client";

import {
  Building2,
  Check,
  CircleAlert,
  Clock3,
  Clipboard,
  HandCoins,
  ImageUp,
  KeyRound,
  LockKeyhole,
  MapPinned,
  QrCode,
  Save,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import QRCode from "qrcode";
import {
  mutateSettingsAction,
  type SettingsActionState,
} from "@/app/ajustes/actions";
import {
  NumberField,
  SearchableCombobox,
  TimePicker,
} from "@/components/form-controls";
import { PageBackButton } from "@/components/page-back-button";
import {
  SystemNotifications,
  type SystemNotification,
} from "@/components/system-notifications";
import type { BusinessDay, SettingsWorkspace } from "@/lib/settings";
import { TeamAccess } from "@/components/team-access";
import { ModalGlassHeader } from "@/components/modal-glass-header";
import { usePostalCodeLookup } from "@/components/use-postal-code-lookup";
import {
  formatPostalCode,
  preserveTypedAddressDetail,
  type PostalCodeAddress,
} from "@/lib/postal-code";
import { formatBrazilianPhone } from "@/lib/phone";

const dayLabels: Record<BusinessDay["day"], string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
};

const paymentOptions = [
  { value: "pix", label: "Pix" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro" },
];

const deliveryOptions = [
  { value: "delivery", label: "Entrega" },
  { value: "pickup", label: "Retirada" },
];

function ProfileEditor({
  workspace,
  avatarDataUrl,
  setAvatarDataUrl,
  chooseAvatar,
  formAction,
  pending,
  active,
  onSubmit,
  onNotify,
}: {
  workspace: SettingsWorkspace;
  avatarDataUrl: string;
  setAvatarDataUrl: (value: string) => void;
  chooseAvatar: (file: File | undefined) => void;
  formAction: (formData: FormData) => void;
  pending: boolean;
  active: boolean;
  onSubmit: () => void;
  onNotify: (message: string) => void;
}) {
  return (
    <section className="settings-card settings-profile-editor" id="perfil">
      <header className="settings-card-head">
        <span>
          <UserRound aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Meu perfil</p>
          <h2>Seu nome nesta bancada</h2>
          <p>
            Esta é a identidade pessoal que aparece para quem trabalha com você.
          </p>
        </div>
      </header>
      <form
        className="settings-profile-form"
        action={formAction}
        onSubmit={onSubmit}
      >
        <input type="hidden" name="operation" value="profile" />
        <input type="hidden" name="avatarDataUrl" value={avatarDataUrl} />
        <div className="settings-profile-body">
          <div className="signup-logo-field settings-profile-photo">
            <span className="signup-logo-preview" aria-hidden="true">
              {avatarDataUrl ? (
                <Image
                  src={avatarDataUrl}
                  alt=""
                  width={72}
                  height={72}
                  unoptimized
                />
              ) : (
                <UserRound />
              )}
            </span>
            <span>
              <strong>Sua imagem</strong>
              <small>Opcional · PNG, JPG ou WebP, até 512 KB</small>
              <label className="signup-file-button" htmlFor="profile-avatar">
                <ImageUp aria-hidden="true" />
                {avatarDataUrl ? "Trocar imagem" : "Escolher imagem"}
              </label>
              <input
                id="profile-avatar"
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => chooseAvatar(event.target.files?.[0])}
              />
              {avatarDataUrl ? (
                <button
                  className="signin-text-button settings-logo-remove"
                  type="button"
                  onClick={() => setAvatarDataUrl("")}
                >
                  Remover imagem
                </button>
              ) : null}
            </span>
          </div>
          <div className="settings-form-grid settings-profile-fields">
            <label className="settings-field">
              <span>Como podemos chamar você?</span>
              <input
                name="displayName"
                defaultValue={workspace.ownerName}
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label className="settings-field">
              <span>E-mail de acesso</span>
              <input
                value={workspace.account.email ?? ""}
                type="email"
                readOnly
                aria-describedby="profile-email-help"
              />
              <small id="profile-email-help">
                O e-mail de acesso não muda por aqui.
              </small>
            </label>
          </div>
        </div>
        <div className="settings-card-footer">
          <p>A imagem da confeitaria continua separada do seu perfil.</p>
          <button
            className="button button-secondary"
            type="submit"
            disabled={pending}
          >
            <Save aria-hidden="true" />
            {pending && active ? "Guardando…" : "Guardar meu perfil"}
          </button>
        </div>
      </form>
      <MfaSecurity
        available={workspace.account.mfaAvailable}
        initialEnabled={workspace.account.mfaEnabled}
        onNotify={onNotify}
      />
    </section>
  );
}

type MfaSetup = { secret: string; provisioningUri: string };

function closeDialog(dialog: HTMLDialogElement | null) {
  if (dialog?.open) dialog.close();
}

function MfaSecurity({
  available,
  initialEnabled,
  onNotify,
}: {
  available: boolean;
  initialEnabled: boolean;
  onNotify: (message: string) => void;
}) {
  const router = useRouter();
  const setupDialog = useRef<HTMLDialogElement>(null);
  const disableDialog = useRef<HTMLDialogElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function api(method: "POST" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch("/ajustes/mfa", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as
      (MfaSetup & { message?: string }) | { message?: string } | null;
    if (!response.ok) {
      throw new Error(result?.message ?? "Não foi possível concluir agora.");
    }
    return result;
  }

  async function startSetup() {
    setSetup(null);
    setQrDataUrl("");
    setCode("");
    setError("");
    setCopied(false);
    setupDialog.current?.showModal();
    setBusy(true);
    try {
      const result = await api("POST", { action: "setup" });
      if (!result || !("secret" in result) || !("provisioningUri" in result)) {
        throw new Error("Não foi possível preparar o Authenticator.");
      }
      setSetup(result);
      setQrDataUrl(
        await QRCode.toDataURL(result.provisioningUri, {
          width: 220,
          margin: 1,
          color: { dark: "#71384a", light: "#fffaf4" },
          errorCorrectionLevel: "M",
        }),
      );
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível começar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    if (!/^\d{6}$/.test(code)) {
      setError("Digite os 6 números exibidos no Authenticator.");
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("POST", { action: "confirm", code });
      const message = result?.message ?? "Authenticator ativado.";
      setEnabled(true);
      closeDialog(setupDialog.current);
      onNotify(message);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "O código não conferiu.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openDisable() {
    setPassword("");
    setCode("");
    setError("");
    disableDialog.current?.showModal();
  }

  async function disable() {
    if (!password || !/^\d{6}$/.test(code)) {
      setError("Confirme sua senha e os 6 números do Authenticator.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("DELETE", { password, code });
      const message = result?.message ?? "Authenticator desativado.";
      setEnabled(false);
      closeDialog(disableDialog.current);
      onNotify(message);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível desativar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!setup?.secret) return;
    await navigator.clipboard.writeText(setup.secret);
    setCopied(true);
  }

  return (
    <div className="profile-mfa">
      <div className="profile-mfa-copy">
        <span className={`profile-mfa-icon${enabled ? " is-enabled" : ""}`}>
          {enabled ? (
            <ShieldCheck aria-hidden="true" />
          ) : (
            <Smartphone aria-hidden="true" />
          )}
        </span>
        <div>
          <span className="profile-mfa-heading">
            <strong>Authenticator</strong>
            <small className={enabled ? "is-enabled" : ""}>
              {enabled ? "Ativo" : "Opcional"}
            </small>
          </span>
          <p>
            {enabled
              ? "Depois da senha, esta conta confirma um código que muda a cada 30 segundos."
              : "Acrescente uma confirmação pelo celular para proteger esta conta além da senha."}
          </p>
        </div>
      </div>
      {available ? (
        <button
          className={
            enabled ? "quiet-action is-danger" : "button button-secondary"
          }
          type="button"
          onClick={enabled ? openDisable : startSetup}
        >
          {enabled ? (
            <ShieldOff aria-hidden="true" />
          ) : (
            <QrCode aria-hidden="true" />
          )}
          {enabled ? "Desativar" : "Configurar Authenticator"}
        </button>
      ) : (
        <small className="profile-mfa-unavailable">
          A proteção desta conta é administrada pelo provedor de acesso.
        </small>
      )}

      <dialog className="purchase-dialog mfa-dialog" ref={setupDialog}>
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Configurar Authenticator"
            eyebrow="Proteção do acesso"
            closeLabel="Fechar configuração do Authenticator"
            onClose={() => closeDialog(setupDialog.current)}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Proteção do acesso</p>
                <h2>Leve esta chave para o seu celular.</h2>
              </div>
              <p>
                Escaneie no Google Authenticator, Microsoft Authenticator ou
                outro aplicativo compatível e confirme o primeiro código.
              </p>
            </header>
            {busy && !setup ? (
              <div className="mfa-loading" role="status">
                Preparando sua chave…
              </div>
            ) : setup ? (
              <div className="mfa-setup-body">
                <div className="mfa-qr-card">
                  {qrDataUrl ? (
                    <Image
                      src={qrDataUrl}
                      alt="QR Code para configurar o Authenticator"
                      width={220}
                      height={220}
                      unoptimized
                    />
                  ) : (
                    <span role="status">Desenhando o QR Code…</span>
                  )}
                </div>
                <div className="mfa-setup-fields">
                  <div className="mfa-manual-key">
                    <span>Se preferir, digite esta chave</span>
                    <code>{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                    <button
                      className="quiet-action"
                      type="button"
                      onClick={copySecret}
                    >
                      {copied ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Clipboard aria-hidden="true" />
                      )}
                      {copied ? "Chave copiada" : "Copiar chave"}
                    </button>
                    <small>
                      Guarde em um local seguro. Ela permite reconectar o
                      Authenticator se você trocar de celular.
                    </small>
                  </div>
                  <label className="settings-field">
                    <span>Código de 6 números</span>
                    <span className="mfa-code-field">
                      <KeyRound aria-hidden="true" />
                      <input
                        ref={codeRef}
                        value={code}
                        onChange={(event) =>
                          setCode(
                            event.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        placeholder="000 000"
                        aria-describedby="mfa-code-help"
                      />
                    </span>
                    <small id="mfa-code-help">
                      O código muda a cada 30 segundos.
                    </small>
                  </label>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="settings-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="dialog-actions">
              <button
                className="signin-text-button"
                type="button"
                onClick={() => closeDialog(setupDialog.current)}
              >
                Fazer isso depois
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || !setup}
                onClick={confirmSetup}
              >
                <ShieldCheck aria-hidden="true" />
                {busy && setup ? "Conferindo…" : "Ativar proteção"}
              </button>
            </div>
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog confirmation-dialog mfa-disable-dialog"
        ref={disableDialog}
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Desativar Authenticator"
            eyebrow="Proteção do acesso"
            closeLabel="Fechar desativação do Authenticator"
            onClose={() => closeDialog(disableDialog.current)}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Retirar proteção</p>
                <h2>Desativar o Authenticator?</h2>
              </div>
              <p>
                A conta voltará a depender somente da senha. Confirme os dois
                dados antes de continuar.
              </p>
            </header>
            <div className="mfa-disable-fields">
              <label className="settings-field">
                <span>Sua senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="settings-field">
                <span>Código atual</span>
                <span className="mfa-code-field">
                  <KeyRound aria-hidden="true" />
                  <input
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000 000"
                  />
                </span>
              </label>
            </div>
            {error ? (
              <div className="settings-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="dialog-actions">
              <button
                className="signin-text-button"
                type="button"
                onClick={() => closeDialog(disableDialog.current)}
              >
                Manter proteção
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={busy}
                onClick={disable}
              >
                <ShieldOff aria-hidden="true" />{" "}
                {busy ? "Conferindo…" : "Desativar Authenticator"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function SettingsDashboard({
  initialWorkspace,
}: {
  initialWorkspace: SettingsWorkspace;
}) {
  const router = useRouter();
  const initialState: SettingsActionState = {
    status: "idle",
    operation: null,
    message: "",
    workspace: initialWorkspace,
    notificationId: null,
  };
  const [state, formAction, pending] = useActionState(
    mutateSettingsAction,
    initialState,
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialWorkspace.sales.defaultPaymentMethod,
  );
  const [deliveryMode, setDeliveryMode] = useState(
    initialWorkspace.sales.defaultDeliveryMode,
  );
  const [logoDataUrl, setLogoDataUrl] = useState(
    initialWorkspace.company.logoDataUrl ?? "",
  );
  const [companyPhone, setCompanyPhone] = useState(
    formatBrazilianPhone(initialWorkspace.company.phone ?? ""),
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState(
    initialWorkspace.account.avatarDataUrl ?? "",
  );
  const [companyPostalCode, setCompanyPostalCode] = useState(
    formatPostalCode(initialWorkspace.company.postalCode ?? ""),
  );
  const [companyAddressLine, setCompanyAddressLine] = useState(
    initialWorkspace.company.addressLine ?? "",
  );
  const [companyAddressNumber, setCompanyAddressNumber] = useState(
    initialWorkspace.company.addressNumber ?? "",
  );
  const [companyAddressComplement, setCompanyAddressComplement] = useState(
    initialWorkspace.company.addressComplement ?? "",
  );
  const [companyNeighborhood, setCompanyNeighborhood] = useState(
    initialWorkspace.company.neighborhood ?? "",
  );
  const [companyCity, setCompanyCity] = useState(
    initialWorkspace.company.city ?? "",
  );
  const [companyState, setCompanyState] = useState(
    initialWorkspace.company.state ?? "",
  );
  const [companyIsCommercialPoint, setCompanyIsCommercialPoint] = useState(
    initialWorkspace.company.isCommercialPoint,
  );
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [activeOperation, setActiveOperation] = useState<
    "company" | "sales" | "schedule" | "profile" | null
  >(null);
  const lastNotification = useRef<number | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const workspace = state.workspace;
  const resolveCompanyPostalCode = useCallback((address: PostalCodeAddress) => {
    setCompanyPostalCode(formatPostalCode(address.postalCode));
    setCompanyAddressLine(address.street);
    setCompanyAddressComplement((current) =>
      preserveTypedAddressDetail(current, address.complement),
    );
    setCompanyNeighborhood(address.neighborhood);
    setCompanyCity(address.city);
    setCompanyState(address.state);
  }, []);
  const postalCodeLookup = usePostalCodeLookup(
    companyPostalCode,
    resolveCompanyPostalCode,
  );

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) return;
    if (file.size > 512 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function chooseAvatar(file: File | undefined) {
    if (!file) return;
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) return;
    if (file.size > 512 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarDataUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function notify(message: string) {
    setNotifications((current) => [...current, { id: Date.now(), message }]);
  }

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(".scroll-region")
        ?.scrollTo({ top: 0, behavior: "auto" });

      if (window.location.hash === "#perfil") {
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}`,
        );
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
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
    if (state.operation === "company" || state.operation === "profile") {
      router.refresh();
    }
  }, [router, state]);

  return (
    <section className="view settings-view">
      <PageBackButton />
      <header className="page-head settings-page-head">
        <div>
          <p className="eyebrow">Ajustes</p>
          <h1>Os combinados da sua cozinha.</h1>
          <p className="page-lede">
            Deixe o jeito habitual da confeitaria pronto. Cada pedido continua
            permitindo exceções.
          </p>
        </div>
        <aside
          className="settings-access-note"
          aria-label="Configuração de perfil e acesso atual"
        >
          <LockKeyhole aria-hidden="true" />
          <div>
            <strong>
              {workspace.account.role === "owner"
                ? "Acesso Full à cozinha inteira"
                : "Seu lugar nesta cozinha"}
            </strong>
            <span>
              {workspace.account.role === "owner"
                ? `${workspace.ownerName} é a proprietária deste espaço.`
                : "A proprietária compartilhou esta bancada com você."}
            </span>
          </div>
        </aside>
      </header>

      {state.status === "error" ? (
        <div
          className="settings-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {state.message}
        </div>
      ) : null}

      {workspace.account.canManageTeam ? (
        <div className="settings-layout">
          <form
            className="settings-card settings-company"
            action={formAction}
            onSubmit={() => setActiveOperation("company")}
          >
            <input type="hidden" name="operation" value="company" />
            <input type="hidden" name="logoDataUrl" value={logoDataUrl} />
            <header className="settings-card-head">
              <span>
                <Building2 aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Sua confeitaria</p>
                <h2>O nome por trás de cada entrega</h2>
                <p>
                  Informações de contato e endereço da empresa. Preencha somente
                  o que usa no dia a dia.
                </p>
              </div>
            </header>
            <div className="settings-form-grid">
              <div className="signup-logo-field settings-field-wide">
                <span className="signup-logo-preview" aria-hidden="true">
                  {logoDataUrl ? (
                    <Image
                      src={logoDataUrl}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                    />
                  ) : (
                    <Building2 />
                  )}
                </span>
                <span>
                  <strong>Imagem da confeitaria</strong>
                  <small>PNG, JPG ou WebP, até 512 KB</small>
                  <label className="signup-file-button" htmlFor="settings-logo">
                    <ImageUp aria-hidden="true" />
                    {logoDataUrl ? "Trocar imagem" : "Escolher imagem"}
                  </label>
                  <input
                    id="settings-logo"
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => chooseLogo(event.target.files?.[0])}
                  />
                  {logoDataUrl ? (
                    <button
                      className="signin-text-button settings-logo-remove"
                      type="button"
                      onClick={() => setLogoDataUrl("")}
                    >
                      Remover imagem
                    </button>
                  ) : null}
                </span>
              </div>
              <label className="settings-field settings-field-wide">
                <span>Nome da confeitaria</span>
                <input
                  name="name"
                  defaultValue={workspace.company.name}
                  required
                  maxLength={160}
                  autoComplete="organization"
                />
              </label>
              <label className="settings-field">
                <span>Telefone</span>
                <input
                  name="phone"
                  type="tel"
                  value={companyPhone}
                  onChange={(event) =>
                    setCompanyPhone(formatBrazilianPhone(event.target.value))
                  }
                  maxLength={15}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                />
              </label>
              <label className="settings-field">
                <span>E-mail</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={workspace.company.email ?? ""}
                  maxLength={160}
                  autoComplete="email"
                  placeholder="contato@confeitaria.com"
                />
              </label>
              <label className="settings-field">
                <span>CPF ou CNPJ</span>
                <input
                  name="taxDocument"
                  defaultValue={workspace.company.taxDocument ?? ""}
                  maxLength={24}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              <div className="settings-field">
                <label htmlFor="settings-postal-code">CEP</label>
                <input
                  id="settings-postal-code"
                  name="postalCode"
                  value={companyPostalCode}
                  onChange={(event) =>
                    setCompanyPostalCode(formatPostalCode(event.target.value))
                  }
                  maxLength={9}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  aria-describedby={
                    postalCodeLookup.status === "error"
                      ? "settings-postal-code-error"
                      : undefined
                  }
                  aria-invalid={postalCodeLookup.status === "error"}
                  aria-busy={postalCodeLookup.status === "loading"}
                  placeholder="00000-000"
                />
                <span className="visually-hidden" aria-live="polite">
                  {postalCodeLookup.status === "loading"
                    ? "Buscando o endereço pelo CEP."
                    : postalCodeLookup.status === "success"
                      ? "Endereço encontrado."
                      : ""}
                </span>
                {postalCodeLookup.status === "error" ? (
                  <small
                    className="postal-code-status is-error"
                    id="settings-postal-code-error"
                    role="alert"
                  >
                    <CircleAlert aria-hidden="true" />
                    {postalCodeLookup.message}
                  </small>
                ) : null}
              </div>
              <label className="settings-field settings-field-wide">
                <span>Logradouro</span>
                <input
                  name="addressLine"
                  value={companyAddressLine}
                  onChange={(event) =>
                    setCompanyAddressLine(event.target.value)
                  }
                  maxLength={200}
                  autoComplete="address-line1"
                  placeholder="Rua, avenida ou estrada"
                />
              </label>
              <label className="settings-field">
                <span>Número</span>
                <input
                  name="addressNumber"
                  value={companyAddressNumber}
                  onChange={(event) =>
                    setCompanyAddressNumber(event.target.value)
                  }
                  maxLength={24}
                  autoComplete="address-line2"
                  placeholder="Ex.: 128 ou s/n"
                />
              </label>
              <label className="settings-field">
                <span>Complemento</span>
                <input
                  name="addressComplement"
                  value={companyAddressComplement}
                  onChange={(event) =>
                    setCompanyAddressComplement(event.target.value)
                  }
                  maxLength={120}
                  autoComplete="address-line3"
                  placeholder="Sala, bloco ou referência"
                />
              </label>
              <label className="settings-field">
                <span>Bairro</span>
                <input
                  name="neighborhood"
                  value={companyNeighborhood}
                  onChange={(event) =>
                    setCompanyNeighborhood(event.target.value)
                  }
                  maxLength={100}
                  autoComplete="address-level3"
                />
              </label>
              <label className="settings-field">
                <span>Cidade</span>
                <input
                  name="city"
                  value={companyCity}
                  onChange={(event) => setCompanyCity(event.target.value)}
                  maxLength={100}
                  autoComplete="address-level2"
                />
              </label>
              <label className="settings-field settings-state-field">
                <span>Estado</span>
                <input
                  name="state"
                  value={companyState}
                  onChange={(event) =>
                    setCompanyState(
                      event.target.value
                        .replace(/[^A-Za-z]/g, "")
                        .slice(0, 2)
                        .toUpperCase(),
                    )
                  }
                  maxLength={2}
                  autoComplete="address-level1"
                  placeholder="SP"
                />
              </label>
              <label className="settings-commercial-point settings-field-wide">
                <input
                  type="checkbox"
                  name="isCommercialPoint"
                  checked={companyIsCommercialPoint}
                  onChange={(event) =>
                    setCompanyIsCommercialPoint(event.target.checked)
                  }
                />
                <span>
                  <strong>Este endereço é um ponto comercial</strong>
                  <small>
                    Guardaremos essa informação para apoiar o planejamento de
                    retiradas no futuro.
                  </small>
                </span>
              </label>
            </div>
            <div className="settings-card-footer">
              <p>
                CPF/CNPJ e contato são dados pessoais: use apenas quando
                necessários à operação.
              </p>
              <button
                className="button button-secondary"
                type="submit"
                disabled={pending}
              >
                <Save aria-hidden="true" />
                {pending && activeOperation === "company"
                  ? "Guardando…"
                  : "Guardar dados"}
              </button>
            </div>
          </form>

          <div className="settings-secondary-column">
            <form
              className="settings-card settings-sales"
              action={formAction}
              onSubmit={() => setActiveOperation("sales")}
            >
              <input type="hidden" name="operation" value="sales" />
              <header className="settings-card-head">
                <span>
                  <HandCoins aria-hidden="true" />
                </span>
                <div>
                  <p className="eyebrow">Como você costuma vender</p>
                  <h2>Um ponto de partida, nunca uma trava</h2>
                  <p>
                    Esses valores chegam preenchidos na nova encomenda e podem
                    ser ajustados naquela encomenda.
                  </p>
                </div>
              </header>
              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>Margem padrão</span>
                  <NumberField
                    id="default-margin"
                    name="defaultMarginPercentage"
                    defaultValue={String(
                      workspace.sales.defaultMarginPercentage,
                    )}
                    min={0}
                    max={90}
                    step={1}
                    suffix="%"
                    required
                    ariaDescribedBy="margin-help"
                  />
                  <small id="margin-help">
                    Percentual que você deseja preservar sobre o preço.
                  </small>
                </label>
                <label className="settings-field">
                  <span>Sinal sugerido</span>
                  <NumberField
                    id="default-deposit"
                    name="defaultDepositPercentage"
                    defaultValue={String(
                      workspace.sales.defaultDepositPercentage,
                    )}
                    min={0}
                    max={100}
                    step={5}
                    suffix="%"
                    required
                  />
                  <small>Pode ser alterado ou removido em cada pedido.</small>
                </label>
                <div className="settings-field">
                  <label htmlFor="default-payment">Pagamento habitual</label>
                  <SearchableCombobox
                    id="default-payment"
                    name="defaultPaymentMethod"
                    options={paymentOptions}
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as typeof paymentMethod)
                    }
                    required
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="default-delivery">Entrega habitual</label>
                  <SearchableCombobox
                    id="default-delivery"
                    name="defaultDeliveryMode"
                    options={deliveryOptions}
                    value={deliveryMode}
                    onValueChange={(value) =>
                      setDeliveryMode(value as typeof deliveryMode)
                    }
                    required
                  />
                </div>
                <label className="settings-field settings-field-wide delivery-rate-field">
                  <span>Custo por quilômetro da entrega</span>
                  <NumberField
                    id="delivery-cost-per-km"
                    name="deliveryCostPerKm"
                    defaultValue={String(workspace.sales.deliveryCostPerKm)}
                    min={0}
                    max={10_000}
                    step={0.1}
                    prefix="R$"
                    suffix="/ km"
                    required
                    ariaDescribedBy="delivery-rate-help"
                  />
                  <small id="delivery-rate-help">
                    <MapPinned aria-hidden="true" />
                    {workspace.integrations.googleMapsRoutesEnabled
                      ? "Rota de ida calculada pelo Google Maps na nova encomenda."
                      : "A tarifa está salva; falta configurar a chave do Google Maps na API."}
                  </small>
                </label>
              </div>
              <div className="settings-card-footer">
                <p>
                  Preferências salvas na cliente continuam tendo prioridade.
                </p>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending}
                >
                  <Save aria-hidden="true" />
                  {pending && activeOperation === "sales"
                    ? "Guardando…"
                    : "Guardar combinados"}
                </button>
              </div>
            </form>

            <ProfileEditor
              workspace={workspace}
              avatarDataUrl={avatarDataUrl}
              setAvatarDataUrl={setAvatarDataUrl}
              chooseAvatar={chooseAvatar}
              formAction={formAction}
              pending={pending}
              active={activeOperation === "profile"}
              onSubmit={() => setActiveOperation("profile")}
              onNotify={notify}
            />
          </div>

          <form
            className="settings-card settings-schedule"
            action={formAction}
            onSubmit={() => setActiveOperation("schedule")}
          >
            <input type="hidden" name="operation" value="schedule" />
            <header className="settings-card-head">
              <span>
                <Clock3 aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Quando a cozinha trabalha</p>
                <h2>Seu ritmo também entra no planejamento</h2>
                <p>
                  Os horários ajudam o “Hoje” a distribuir preparos sem ocupar
                  períodos que você reservou para descansar.
                </p>
              </div>
            </header>
            <fieldset className="settings-week">
              <legend className="sr-only">Horários de funcionamento</legend>
              {workspace.businessHours.map((entry) => (
                <div className="settings-day" key={entry.day}>
                  <label className="settings-day-toggle">
                    <input
                      type="checkbox"
                      name={`${entry.day}_enabled`}
                      defaultChecked={entry.enabled}
                    />
                    <span aria-hidden="true" />
                    <strong>{dayLabels[entry.day]}</strong>
                  </label>
                  <label>
                    <span>Das</span>
                    <TimePicker
                      id={`${entry.day}-start`}
                      name={`${entry.day}_start`}
                      defaultValue={entry.start}
                      ariaLabel={`Início de ${dayLabels[entry.day]}`}
                      required
                    />
                  </label>
                  <label>
                    <span>até</span>
                    <TimePicker
                      id={`${entry.day}-end`}
                      name={`${entry.day}_end`}
                      defaultValue={entry.end}
                      ariaLabel={`Fim de ${dayLabels[entry.day]}`}
                      required
                    />
                  </label>
                </div>
              ))}
            </fieldset>
            <div className="settings-card-footer">
              <p>
                Fuso horário: Brasília. A agenda continua permitindo
                compromissos excepcionais.
              </p>
              <button
                className="button button-secondary"
                type="submit"
                disabled={pending}
              >
                <Save aria-hidden="true" />
                {pending && activeOperation === "schedule"
                  ? "Guardando…"
                  : "Guardar horários"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {!workspace.account.canManageTeam ? (
        <div className="settings-layout settings-layout-profile-only">
          <ProfileEditor
            workspace={workspace}
            avatarDataUrl={avatarDataUrl}
            setAvatarDataUrl={setAvatarDataUrl}
            chooseAvatar={chooseAvatar}
            formAction={formAction}
            pending={pending}
            active={activeOperation === "profile"}
            onSubmit={() => setActiveOperation("profile")}
            onNotify={notify}
          />
        </div>
      ) : null}

      <TeamAccess initialWorkspace={workspace} />

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
