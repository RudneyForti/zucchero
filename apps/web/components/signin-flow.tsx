"use client";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Step = "email" | "password" | "mfa";

type AuthResponse = {
  status?: "authenticated" | "mfa-required";
  returnTo?: string;
  code?: string;
  message?: string;
};

export function SigninFlow({
  configured,
  initialError,
  initialEmail,
  initialNotice,
  returnTo,
}: {
  configured: boolean;
  initialError?: string;
  initialEmail?: string;
  initialNotice?: string;
  returnTo: string;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    initialError ? "Não conseguimos concluir a entrada. Tente novamente." : "",
  );
  const [managedLoginNeeded, setManagedLoginNeeded] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus();
    if (step === "mfa") codeRef.current?.focus();
  }, [step]);

  function goTo(nextStep: Step) {
    setError("");
    setManagedLoginNeeded(false);
    setStep(nextStep);
  }

  async function requestAuthentication(
    path: "/auth/password" | "/auth/mfa",
    body: Record<string, string>,
  ) {
    setBusy(true);
    setError("");
    setManagedLoginNeeded(false);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, returnTo }),
      });
      const result = (await response.json()) as AuthResponse;

      if (!response.ok) {
        setError(
          result.message ?? "Não foi possível continuar. Tente novamente.",
        );
        setManagedLoginNeeded(result.code === "managed-login-required");
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

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    goTo("password");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await requestAuthentication("/auth/password", {
      email: email.trim(),
      password,
    });
    if (!result) return;

    if (result.status === "mfa-required") {
      setPassword("");
      goTo("mfa");
      return;
    }

    if (result.status === "authenticated") {
      window.location.assign(result.returnTo ?? returnTo);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await requestAuthentication("/auth/mfa", { code });
    if (result?.status === "authenticated") {
      window.location.assign(result.returnTo ?? returnTo);
    }
  }

  const hostedReturnTo = encodeURIComponent(returnTo);

  return (
    <div className="signin-access-inner signin-access-auth">
      <div className="signin-mobile-brand" aria-hidden="true">
        <Image src="/zucchero-logo.svg" alt="" width={184} height={40} />
      </div>

      <p className="eyebrow">Seu espaço está à espera</p>
      <h1 id="signin-title">Vamos abrir a bancada?</h1>

      <div className="signin-access-rule" aria-hidden="true">
        <span />
      </div>

      {step === "email" ? (
        <form className="signin-form" onSubmit={submitEmail}>
          <div>
            <h2>Qual é o seu e-mail?</h2>
            <p>É o endereço usado no acesso da sua confeitaria.</p>
          </div>
          <div className="signin-field">
            <label htmlFor="signin-email">E-mail</label>
            <span className="signin-input-wrap">
              <Mail aria-hidden="true" />
              <input
                id="signin-email"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                inputMode="email"
                placeholder="voce@suaconfeitaria.com.br"
                required
              />
            </span>
          </div>
          <button className="button button-primary" type="submit">
            Continuar
            <ArrowRight aria-hidden="true" />
          </button>
          <Link
            className="signin-create-account"
            href={`/entrar?cadastro=1&returnTo=${hostedReturnTo}`}
          >
            Ainda não usa o Zucchero? <strong>Criar minha conta</strong>
          </Link>
        </form>
      ) : null}

      {step === "password" ? (
        <form className="signin-form" onSubmit={submitPassword}>
          <button
            className="signin-back"
            type="button"
            onClick={() => goTo("email")}
          >
            <ArrowLeft aria-hidden="true" />
            Trocar e-mail
          </button>
          <div>
            <h2>Agora, sua senha</h2>
            <p className="signin-identity">{email}</p>
          </div>
          <div className="signin-field">
            <label htmlFor="signin-password">Senha</label>
            <span className="signin-input-wrap">
              <LockKeyhole aria-hidden="true" />
              <input
                id="signin-password"
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
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
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            {busy ? "Conferindo…" : "Entrar"}
            <ArrowRight aria-hidden="true" />
          </button>
          <Link
            className="signin-recovery"
            href={`/auth/login?returnTo=${hostedReturnTo}`}
          >
            Esqueci minha senha ou é meu primeiro acesso
          </Link>
        </form>
      ) : null}

      {step === "mfa" ? (
        <form className="signin-form" onSubmit={submitMfa}>
          <button
            className="signin-back"
            type="button"
            onClick={() => goTo("password")}
          >
            <ArrowLeft aria-hidden="true" />
            Voltar à senha
          </button>
          <div>
            <h2>Confirme que é você</h2>
            <p>Digite o código de 6 números do seu Authenticator.</p>
          </div>
          <div className="signin-field">
            <label htmlFor="signin-code">Código de autenticação</label>
            <span className="signin-input-wrap signin-code-wrap">
              <KeyRound aria-hidden="true" />
              <input
                id="signin-code"
                ref={codeRef}
                type="text"
                name="code"
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
            {busy ? "Confirmando…" : "Confirmar e entrar"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="signin-error" role="alert">
          <strong>Não conseguimos continuar.</strong>
          <span>{error}</span>
          {managedLoginNeeded ? (
            <Link href={`/auth/login?returnTo=${hostedReturnTo}`}>
              Resolver no acesso seguro
            </Link>
          ) : null}
        </div>
      ) : null}

      {initialNotice && !error ? (
        <p className="signin-success" role="status">
          {initialNotice}
        </p>
      ) : null}

      {!configured && step === "email" ? (
        <div className="signin-demo-option">
          <p>
            A conexão com o acesso protegido ainda não está ativa neste
            ambiente.
          </p>
          <Link className="button button-secondary" href="/">
            <LogIn aria-hidden="true" />
            Usar a demonstração
          </Link>
        </div>
      ) : null}

      <div className="signin-security">
        <ShieldCheck aria-hidden="true" />
        <p>
          <strong>Um acesso, uma cozinha.</strong>
          <span>
            Sua senha nunca é armazenada em texto legível e cada confeitaria
            permanece em seu próprio espaço.
          </span>
        </p>
      </div>
    </div>
  );
}
