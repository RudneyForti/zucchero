import { Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { SigninFlow } from "@/components/signin-flow";
import { SignupFlow } from "@/components/signup-flow";
import { cognitoPasswordConfiguration, safeReturnTo } from "@/lib/auth";
import { localAuthEnabled } from "@/lib/local-auth";
import { InvitationFlow } from "@/components/invitation-flow";

export const metadata: Metadata = {
  title: "Entrar — Zucchero",
  description: "Abra o espaço de trabalho da sua confeitaria.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    cadastro?: string;
    convite?: string;
    conta?: string;
    email?: string;
    erro?: string;
    returnTo?: string;
  }>;
}) {
  const { cadastro, convite, conta, email, erro, returnTo } =
    await searchParams;
  const safeDestination = safeReturnTo(returnTo ?? null);
  const cognitoConfigured = Boolean(cognitoPasswordConfiguration());
  const signupConfigured = Boolean(cognitoConfigured || localAuthEnabled());
  const configured = signupConfigured;
  return (
    <main className="signin-page">
      <section className="signin-window" aria-labelledby="signin-title">
        <div className="signin-story">
          <div className="signin-brand">
            <Image
              className="signin-wordmark"
              src="/zucchero-logo.svg"
              alt="Zucchero"
              width={368}
              height={80}
              priority
            />
            <span className="signin-brand-name">
              <small>feito à mão, com método</small>
            </span>
          </div>

          <div className="signin-story-copy">
            <p className="eyebrow">A rotina cabe aqui</p>
            <p className="signin-story-title">
              O cuidado fica nas mãos. O restante, a bancada ajuda a lembrar.
            </p>
            <p>
              Pedidos, receitas e despensa conversam para deixar o dia mais leve
              — sem tirar o seu jeito de fazer.
            </p>
          </div>

          <aside className="signin-note" aria-label="Ao entrar na bancada">
            <span className="signin-note-tape" aria-hidden="true" />
            <strong>Quando você entrar</strong>
            <ul>
              <li>
                <Check aria-hidden="true" />
                <span>o primeiro preparo que pede suas mãos</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>o que precisa sair da despensa</span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>os pedidos e todos os seus combinados</span>
              </li>
            </ul>
          </aside>
        </div>

        <div className="signin-access">
          {convite ? (
            <InvitationFlow token={convite} />
          ) : cadastro === "1" ? (
            <SignupFlow
              configured={signupConfigured}
              emailConfirmation={cognitoConfigured}
              returnTo={safeDestination}
            />
          ) : (
            <SigninFlow
              configured={configured}
              initialEmail={email}
              initialError={erro}
              initialNotice={
                conta === "criada"
                  ? "Conta criada. Agora entre para abrir sua nova bancada."
                  : conta === "confirmada"
                    ? "Conta confirmada. Agora entre para abrir sua nova bancada."
                    : conta === "convite-aceito"
                      ? "Convite aceito. Entre para abrir a bancada compartilhada."
                      : undefined
              }
              returnTo={safeDestination}
            />
          )}
        </div>
      </section>
    </main>
  );
}
