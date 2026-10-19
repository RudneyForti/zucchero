"use client";

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Invitation = {
  tenantName: string;
  email: string;
  operationalAccess: boolean;
  financialAccess: boolean;
  expiresAt: string;
};

export function InvitationFlow({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/auth/invitation/inspect?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const result = (await response.json()) as Invitation & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(result.message ?? "Convite indisponível.");
        if (active) setInvitation(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Convite indisponível.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const rules = useMemo(
    () => [
      password.length >= 8,
      /[A-Z]/.test(password) && /[a-z]/.test(password),
      /\d/.test(password) && /[^A-Za-z0-9]/.test(password),
      Boolean(confirmation) && password === confirmation,
    ],
    [password, confirmation],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rules.every(Boolean)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/auth/invitation/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          displayName: displayName.trim(),
          password,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(
          result.message ?? "Não foi possível aceitar o convite.",
        );
      setPassword("");
      setConfirmation("");
      setAccepted(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível aceitar o convite.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (busy && !invitation) {
    return (
      <div className="signin-access-inner signin-access-auth">
        <p className="eyebrow">Abrindo convite</p>
        <h1>Preparando seu lugar na bancada…</h1>
      </div>
    );
  }
  if (error && !invitation) {
    return (
      <div className="signin-access-inner signin-access-auth">
        <p className="eyebrow">Convite indisponível</p>
        <h1>Este acesso não pode mais ser usado.</h1>
        <div className="signin-error" role="alert">
          <span>{error}</span>
        </div>
        <Link className="button button-secondary" href="/entrar">
          Voltar ao acesso
        </Link>
      </div>
    );
  }
  if (accepted && invitation) {
    return (
      <div className="signin-access-inner signin-access-auth">
        <p className="eyebrow">Tudo pronto</p>
        <h1>Seu lugar em {invitation.tenantName} está preparado.</h1>
        <p>Entre com {invitation.email} e a senha que acabou de criar.</p>
        <Link
          className="button button-primary"
          href={`/entrar?conta=convite-aceito&email=${encodeURIComponent(invitation.email)}`}
        >
          Entrar na bancada <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    );
  }
  if (!invitation) return null;

  return (
    <div className="signin-access-inner signin-access-auth invitation-flow">
      <p className="eyebrow">Convite para a bancada</p>
      <h1>{invitation.tenantName} guardou um lugar para você.</h1>
      <div className="invitation-access-summary">
        <Check aria-hidden="true" />
        <span>
          <strong>{invitation.email}</strong>
          <small>
            Acesso {invitation.operationalAccess ? "Operacional" : ""}
            {invitation.operationalAccess && invitation.financialAccess
              ? " e "
              : ""}
            {invitation.financialAccess ? "Financeiro" : ""}
          </small>
        </span>
      </div>
      <form className="signin-form" onSubmit={submit}>
        <div className="signin-field">
          <label htmlFor="invitation-name">Como podemos chamar você?</label>
          <span className="signin-input-wrap">
            <UserRound aria-hidden="true" />
            <input
              id="invitation-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              required
              maxLength={100}
            />
          </span>
        </div>
        <div className="signin-field">
          <label htmlFor="invitation-password">Crie sua senha</label>
          <span className="signin-input-wrap">
            <LockKeyhole aria-hidden="true" />
            <input
              id="invitation-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            <button
              className="signin-password-toggle"
              type="button"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowPassword((value) => !value)}
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
          <label htmlFor="invitation-confirmation">Repita a senha</label>
          <span className="signin-input-wrap">
            <KeyRound aria-hidden="true" />
            <input
              id="invitation-confirmation"
              type={showPassword ? "text" : "password"}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
            />
          </span>
        </div>
        <ul className="signup-password-rules" aria-label="Requisitos da senha">
          {[
            "8 ou mais caracteres",
            "maiúscula e minúscula",
            "número e símbolo",
            "senhas iguais",
          ].map((label, index) => (
            <li key={label} data-valid={rules[index]}>
              <Check aria-hidden="true" /> {label}
            </li>
          ))}
        </ul>
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || !displayName.trim() || !rules.every(Boolean)}
        >
          {busy ? "Preparando…" : "Aceitar convite"}
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
      {error ? (
        <div className="signin-error" role="alert">
          <strong>Não conseguimos continuar.</strong>
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
