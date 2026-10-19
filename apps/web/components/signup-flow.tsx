"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  ImageUp,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePostalCodeLookup } from "@/components/use-postal-code-lookup";
import {
  formatPostalCode,
  preserveTypedAddressDetail,
  type PostalCodeAddress,
} from "@/lib/postal-code";

type SignupStep = "identity" | "profile" | "password" | "confirmation";

type SignupResponse = {
  status?: "verification-required" | "account-created" | "confirmed" | "resent";
  destination?: string;
  message?: string;
};

export function SignupFlow({
  configured,
  emailConfirmation,
  returnTo,
}: {
  configured: boolean;
  emailConfirmation: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<SignupStep>("identity");
  const [ownerName, setOwnerName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [email, setEmail] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [addressLine, setAddressLine] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [isCommercialPoint, setIsCommercialPoint] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const flowRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const resolvePostalCode = useCallback((address: PostalCodeAddress) => {
    setPostalCode(formatPostalCode(address.postalCode));
    setAddressLine(address.street);
    setAddressComplement((current) =>
      preserveTypedAddressDetail(current, address.complement),
    );
    setNeighborhood(address.neighborhood);
    setCity(address.city);
    setState(address.state);
  }, []);
  const postalCodeLookup = usePostalCodeLookup(postalCode, resolvePostalCode);

  useEffect(() => {
    flowRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    if (step === "password")
      passwordRef.current?.focus({ preventScroll: true });
    if (step === "confirmation")
      codeRef.current?.focus({ preventScroll: true });
  }, [step]);

  const passwordRules = useMemo(
    () => [
      { label: "8 ou mais caracteres", valid: password.length >= 8 },
      {
        label: "maiúscula e minúscula",
        valid: /[A-Z]/.test(password) && /[a-z]/.test(password),
      },
      {
        label: "número e símbolo",
        valid: /\d/.test(password) && /[^A-Za-z0-9]/.test(password),
      },
    ],
    [password],
  );
  const passwordReady =
    passwordRules.every((rule) => rule.valid) && password === confirmation;
  const loginHref = `/entrar?returnTo=${encodeURIComponent(returnTo)}`;

  function goTo(next: SignupStep) {
    setError("");
    setNotice("");
    setStep(next);
  }

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as SignupResponse;
      if (!response.ok) {
        setError(
          result.message ?? "Não foi possível continuar. Tente novamente.",
        );
        return null;
      }
      return result;
    } catch {
      setError("A conexão falhou. Confira a internet e tente novamente.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerName.trim() || !tenantName.trim() || !email.trim()) return;
    goTo("profile");
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goTo("password");
  }

  function chooseLogo(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {
      setError("Escolha uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > 512 * 1024) {
      setError("A imagem pode ter até 512 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result ?? ""));
    reader.onerror = () => setError("Não foi possível ler essa imagem.");
    reader.readAsDataURL(file);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordReady) return;
    const result = await post("/auth/signup", {
      ownerName: ownerName.trim(),
      tenantName: tenantName.trim(),
      email: email.trim(),
      password,
      logoDataUrl: logoDataUrl || null,
      addressLine: showAddress ? addressLine.trim() || null : null,
      addressNumber: showAddress ? addressNumber.trim() || null : null,
      addressComplement: showAddress ? addressComplement.trim() || null : null,
      neighborhood: showAddress ? neighborhood.trim() || null : null,
      city: showAddress ? city.trim() || null : null,
      state: showAddress ? state.trim().toUpperCase() || null : null,
      postalCode: showAddress ? postalCode.trim() || null : null,
      isCommercialPoint: showAddress && isCommercialPoint,
    });
    if (!result) return;
    setPassword("");
    setConfirmation("");
    if (result.status === "account-created") {
      router.push(
        `${loginHref}&conta=criada&email=${encodeURIComponent(email.trim())}`,
      );
      return;
    }
    setNotice(
      result.destination
        ? `Enviamos o código para ${result.destination}.`
        : "Enviamos um código de confirmação para o seu e-mail.",
    );
    setStep("confirmation");
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await post("/auth/signup/confirm", {
      email: email.trim(),
      code,
    });
    if (result?.status === "confirmed") {
      router.push(
        `${loginHref}&conta=confirmada&email=${encodeURIComponent(email.trim())}`,
      );
    }
  }

  async function resendCode() {
    const result = await post("/auth/signup/resend", { email: email.trim() });
    if (result?.status === "resent") {
      setNotice("Um novo código foi enviado. Use sempre o mais recente.");
    }
  }

  return (
    <div ref={flowRef} className="signin-access-inner signin-access-auth">
      <div className="signin-mobile-brand" aria-hidden="true">
        <Image src="/zucchero-logo.svg" alt="" width={184} height={40} />
      </div>

      <p className="eyebrow">Um espaço para chamar de seu</p>
      <h1 id="signin-title">Vamos criar sua bancada.</h1>
      <div className="signin-access-rule" aria-hidden="true">
        <span />
      </div>

      {step === "identity" ? (
        <form className="signin-form" onSubmit={submitIdentity}>
          <div>
            <h2>Começamos por você</h2>
            <p>Esses dados dão nome ao seu espaço e ao seu acesso.</p>
          </div>
          <div className="signin-field">
            <label htmlFor="signup-owner">Como podemos chamar você?</label>
            <span className="signin-input-wrap">
              <UserRound aria-hidden="true" />
              <input
                id="signup-owner"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                placeholder="Seu nome"
                required
              />
            </span>
          </div>
          <div className="signin-field">
            <label htmlFor="signup-tenant">Nome da sua confeitaria</label>
            <span className="signin-input-wrap">
              <Building2 aria-hidden="true" />
              <input
                id="signup-tenant"
                value={tenantName}
                onChange={(event) => setTenantName(event.target.value)}
                autoComplete="organization"
                maxLength={120}
                placeholder="Ex.: Doces da Ana"
                required
              />
            </span>
          </div>
          <div className="signin-field">
            <label htmlFor="signup-email">E-mail de acesso</label>
            <span className="signin-input-wrap">
              <Mail aria-hidden="true" />
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                placeholder="voce@suaconfeitaria.com.br"
                required
              />
            </span>
          </div>
          <button className="button button-primary" type="submit">
            Criar minha senha <ArrowRight aria-hidden="true" />
          </button>
          <Link className="signin-recovery" href={loginHref}>
            Já tenho uma conta
          </Link>
        </form>
      ) : null}

      {step === "profile" ? (
        <form className="signin-form" onSubmit={submitProfile}>
          <button
            className="signin-back"
            type="button"
            onClick={() => goTo("identity")}
          >
            <ArrowLeft aria-hidden="true" /> Rever identificação
          </button>
          <div>
            <h2>Agora, o rosto da sua confeitaria</h2>
            <p>
              Imagem e endereço são opcionais. Você também pode cuidar disso
              depois.
            </p>
          </div>
          <div className="signup-logo-field">
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
              <label className="signup-file-button" htmlFor="signup-logo">
                <ImageUp aria-hidden="true" />
                {logoDataUrl ? "Trocar imagem" : "Escolher imagem"}
              </label>
              <input
                id="signup-logo"
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => chooseLogo(event.target.files?.[0])}
              />
            </span>
          </div>
          <button
            className="signup-address-toggle"
            type="button"
            aria-expanded={showAddress}
            onClick={() => setShowAddress((current) => !current)}
          >
            <MapPin aria-hidden="true" />
            <span>
              <strong>
                {showAddress ? "Ocultar endereço" : "Adicionar endereço"}
              </strong>
              <small>Útil para retiradas, documentos e contatos.</small>
            </span>
          </button>
          {showAddress ? (
            <div className="signup-address-fields">
              <div className="signin-field signup-postal-code-field">
                <label htmlFor="signup-postal-code">CEP</label>
                <span
                  className="signin-input-wrap signin-input-plain"
                  aria-busy={postalCodeLookup.status === "loading"}
                >
                  <input
                    id="signup-postal-code"
                    value={postalCode}
                    onChange={(event) =>
                      setPostalCode(formatPostalCode(event.target.value))
                    }
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="00000-000"
                    aria-describedby={
                      postalCodeLookup.status === "error"
                        ? "signup-postal-code-error"
                        : undefined
                    }
                    aria-invalid={postalCodeLookup.status === "error"}
                  />
                </span>
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
                    id="signup-postal-code-error"
                    role="alert"
                  >
                    <CircleAlert aria-hidden="true" />
                    {postalCodeLookup.message}
                  </small>
                ) : null}
              </div>
              <div className="signin-field signup-field-wide">
                <label htmlFor="signup-address">Logradouro</label>
                <span className="signin-input-wrap">
                  <MapPin aria-hidden="true" />
                  <input
                    id="signup-address"
                    value={addressLine}
                    onChange={(event) => setAddressLine(event.target.value)}
                    autoComplete="address-line1"
                    maxLength={240}
                    placeholder="Rua, avenida ou estrada"
                  />
                </span>
              </div>
              <div className="signin-field signup-number-field">
                <label htmlFor="signup-address-number">Número</label>
                <span className="signin-input-wrap signin-input-plain">
                  <input
                    id="signup-address-number"
                    value={addressNumber}
                    onChange={(event) => setAddressNumber(event.target.value)}
                    autoComplete="address-line2"
                    maxLength={24}
                    placeholder="128 ou s/n"
                  />
                </span>
              </div>
              <div className="signin-field signup-complement-field">
                <label htmlFor="signup-address-complement">Complemento</label>
                <span className="signin-input-wrap signin-input-plain">
                  <input
                    id="signup-address-complement"
                    value={addressComplement}
                    onChange={(event) =>
                      setAddressComplement(event.target.value)
                    }
                    autoComplete="address-line3"
                    maxLength={120}
                    placeholder="Sala, bloco ou referência"
                  />
                </span>
              </div>
              <div className="signin-field signup-neighborhood-field">
                <label htmlFor="signup-neighborhood">Bairro</label>
                <span className="signin-input-wrap signin-input-plain">
                  <input
                    id="signup-neighborhood"
                    value={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.value)}
                    autoComplete="address-level3"
                    maxLength={100}
                  />
                </span>
              </div>
              <div className="signin-field">
                <label htmlFor="signup-city">Cidade</label>
                <span className="signin-input-wrap signin-input-plain">
                  <input
                    id="signup-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    autoComplete="address-level2"
                    maxLength={100}
                  />
                </span>
              </div>
              <div className="signin-field signup-state-field">
                <label htmlFor="signup-state">UF</label>
                <span className="signin-input-wrap signin-input-plain">
                  <input
                    id="signup-state"
                    value={state}
                    onChange={(event) =>
                      setState(
                        event.target.value
                          .replace(/[^A-Za-z]/g, "")
                          .slice(0, 2)
                          .toUpperCase(),
                      )
                    }
                    autoComplete="address-level1"
                    maxLength={2}
                    inputMode="text"
                  />
                </span>
              </div>
              <label className="signup-commercial-point signup-field-wide">
                <input
                  type="checkbox"
                  checked={isCommercialPoint}
                  onChange={(event) =>
                    setIsCommercialPoint(event.target.checked)
                  }
                />
                <span>
                  <strong>Este endereço é um ponto comercial</strong>
                  <small>
                    Isso poderá ajudar a organizar retiradas e horários.
                  </small>
                </span>
              </label>
            </div>
          ) : null}
          <button className="button button-primary" type="submit">
            {logoDataUrl || showAddress ? "Continuar" : "Pular por enquanto"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      ) : null}

      {step === "password" ? (
        <form className="signin-form" onSubmit={submitPassword}>
          <button
            className="signin-back"
            type="button"
            onClick={() => goTo("profile")}
          >
            <ArrowLeft aria-hidden="true" /> Rever perfil
          </button>
          <div>
            <h2>Agora, uma senha segura</h2>
            <p>Ela protege a rotina e os dados da sua confeitaria.</p>
          </div>
          <div className="signin-field">
            <label htmlFor="signup-password">Senha</label>
            <span className="signin-input-wrap">
              <LockKeyhole aria-hidden="true" />
              <input
                id="signup-password"
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                maxLength={256}
                required
              />
              <button
                className="signin-password-toggle"
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </button>
            </span>
          </div>
          <div className="signin-field">
            <label htmlFor="signup-confirmation">Repita a senha</label>
            <span className="signin-input-wrap">
              <LockKeyhole aria-hidden="true" />
              <input
                id="signup-confirmation"
                type={showPassword ? "text" : "password"}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                maxLength={256}
                required
              />
            </span>
          </div>
          <ul
            className="signup-password-rules"
            aria-label="Requisitos da senha"
          >
            {passwordRules.map((rule) => (
              <li key={rule.label} data-valid={rule.valid}>
                <Check aria-hidden="true" /> {rule.label}
              </li>
            ))}
            <li data-valid={Boolean(confirmation) && password === confirmation}>
              <Check aria-hidden="true" /> senhas iguais
            </li>
          </ul>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || !passwordReady}
          >
            {busy ? "Criando seu espaço…" : "Criar minha conta"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      ) : null}

      {step === "confirmation" ? (
        <form className="signin-form" onSubmit={submitCode}>
          <button
            className="signin-back"
            type="button"
            onClick={() => goTo("identity")}
          >
            <ArrowLeft aria-hidden="true" /> Corrigir e-mail
          </button>
          <div>
            <h2>Confirme seu e-mail</h2>
            <p className="signin-identity">
              Digite o código enviado para {email}.
            </p>
          </div>
          <div className="signin-field">
            <label htmlFor="signup-code">Código de confirmação</label>
            <span className="signin-input-wrap signin-code-wrap">
              <KeyRound aria-hidden="true" />
              <input
                id="signup-code"
                ref={codeRef}
                type="text"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                placeholder="000 000"
                required
              />
            </span>
          </div>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || code.length !== 6}
          >
            {busy ? "Confirmando…" : "Confirmar minha conta"}
            <ArrowRight aria-hidden="true" />
          </button>
          <button
            className="signin-text-button"
            type="button"
            onClick={resendCode}
            disabled={busy}
          >
            Enviar um novo código
          </button>
        </form>
      ) : null}

      {notice ? (
        <p className="signin-success" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="signin-error" role="alert">
          <strong>Não conseguimos continuar.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {!configured && step === "identity" ? (
        <p className="signin-config-note">
          O formulário já está pronto. Neste ambiente de demonstração, a criação
          real aguarda a conexão com o Cognito.
        </p>
      ) : null}

      <div className="signin-security">
        <ShieldCheck aria-hidden="true" />
        <p>
          <strong>Sua confeitaria nasce separada.</strong>
          <span>
            {emailConfirmation
              ? "Cada nova conta recebe um espaço próprio. A confirmação por e-mail protege o primeiro acesso."
              : "Cada nova conta recebe um espaço próprio e fica pronta para entrar neste piloto local."}
          </span>
        </p>
      </div>
    </div>
  );
}
