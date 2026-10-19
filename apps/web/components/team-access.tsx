"use client";

import {
  Check,
  Clipboard,
  KeyRound,
  MailPlus,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteOwnAccountAction,
  mutateTeamAction,
  type DeleteAccountState,
  type TeamActionState,
} from "@/app/ajustes/team-actions";
import type { SettingsWorkspace } from "@/lib/settings";
import {
  SystemNotifications,
  type SystemNotification,
} from "@/components/system-notifications";
import {
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/form-controls";
import { ModalGlassHeader } from "@/components/modal-glass-header";

type WorkspaceMember = SettingsWorkspace["people"]["members"][number];
type AccessProfile = "operational" | "financial" | "combined";

const accessProfileOptions: ComboboxOption[] = [
  { value: "operational", label: "Operacional" },
  { value: "financial", label: "Financeiro" },
  { value: "combined", label: "Operacional + Financeiro" },
];

function accessLabel(operational: boolean, financial: boolean) {
  if (operational && financial) return "Operacional e Financeiro";
  return operational ? "Operacional" : "Financeiro";
}

function closeDialog(dialog: HTMLDialogElement | null) {
  if (dialog?.open) dialog.close();
}

function profileOf(member: WorkspaceMember): AccessProfile {
  if (member.operationalAccess && member.financialAccess) return "combined";
  return member.operationalAccess ? "operational" : "financial";
}

function MemberAccessForm({
  member,
  action,
  pending,
  onRemove,
}: {
  member: WorkspaceMember;
  action: (payload: FormData) => void;
  pending: boolean;
  onRemove: () => void;
}) {
  const [profile, setProfile] = useState<AccessProfile>(() =>
    profileOf(member),
  );
  const operationalAccess = profile === "operational" || profile === "combined";
  const financialAccess = profile === "financial" || profile === "combined";

  return (
    <form className="person-access-form" action={action}>
      <input type="hidden" name="operation" value="update" />
      <input type="hidden" name="userId" value={member.userId} />
      {operationalAccess ? (
        <input type="hidden" name="operationalAccess" value="on" />
      ) : null}
      {financialAccess ? (
        <input type="hidden" name="financialAccess" value="on" />
      ) : null}
      <div className="person-access-profile">
        <SearchableCombobox
          id={`member-access-${member.userId}`}
          name="accessProfile"
          options={accessProfileOptions}
          value={profile}
          onValueChange={(value) => setProfile(value as AccessProfile)}
          ariaLabel={`Perfil de acesso de ${member.displayName}`}
          searchable={false}
        />
      </div>
      <button className="quiet-action" type="submit" disabled={pending}>
        Guardar
      </button>
      <button
        className="icon-action is-danger"
        type="button"
        aria-label={`Remover acesso de ${member.displayName}`}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </form>
  );
}

export function TeamAccess({
  initialWorkspace,
}: {
  initialWorkspace: SettingsWorkspace;
}) {
  const router = useRouter();
  const teamInitial: TeamActionState = {
    status: "idle",
    operation: null,
    message: "",
    workspace: initialWorkspace,
    invitePath: null,
    notificationId: null,
  };
  const deleteInitial: DeleteAccountState = {
    status: "idle",
    message: "",
    deleted: false,
  };
  const [state, teamAction, teamPending] = useActionState(
    mutateTeamAction,
    teamInitial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteOwnAccountAction,
    deleteInitial,
  );
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [removeTarget, setRemoveTarget] = useState<
    SettingsWorkspace["people"]["members"][number] | null
  >(null);
  const [copied, setCopied] = useState(false);
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const lastNotification = useRef<number | null>(null);
  const workspace = state.workspace;

  useEffect(() => {
    if (
      !state.notificationId ||
      state.notificationId === lastNotification.current
    )
      return;
    lastNotification.current = state.notificationId;
    setNotifications((current) => [
      ...current,
      { id: state.notificationId as number, message: state.message },
    ]);
    if (state.operation === "remove") closeDialog(removeDialog.current);
  }, [state]);

  useEffect(() => {
    if (deleteState.deleted) router.replace("/entrar?conta=excluida");
  }, [deleteState.deleted, router]);

  async function copyInvite() {
    if (!state.invitePath) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}${state.invitePath}`,
    );
    setCopied(true);
  }

  return (
    <>
      {workspace.accountNotifications.map((notification) => (
        <aside className="account-notice" key={notification.id} role="status">
          <MailPlus aria-hidden="true" />
          <div>
            <strong>Um convite encontrou outra confeitaria</strong>
            <p>{notification.message}</p>
          </div>
        </aside>
      ))}

      <section className="settings-card settings-people" id="pessoas">
        <header className="settings-card-head">
          <span>
            <UsersRound aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Pessoas e acessos</p>
            <h2>Quem divide a bancada com você</h2>
            <p>
              Cada pessoa entra com a própria conta. Os grupos liberam apenas o
              necessário para o trabalho dela.
            </p>
          </div>
          {workspace.account.canManageTeam ? (
            <button
              className="button button-primary people-invite-button"
              type="button"
              onClick={() => inviteDialog.current?.showModal()}
            >
              <MailPlus aria-hidden="true" /> Convidar pessoa
            </button>
          ) : null}
        </header>

        {state.status === "error" ? (
          <div className="settings-error" role="alert">
            {state.message}
          </div>
        ) : null}

        <div className="people-list" aria-label="Contas vinculadas">
          {workspace.people.members.map((member) => (
            <article className="person-row" key={member.userId}>
              <span className="person-avatar" aria-hidden="true">
                {member.displayName.charAt(0).toLocaleUpperCase("pt-BR")}
              </span>
              <div className="person-identity">
                <strong>
                  {member.displayName}{" "}
                  {member.current ? <small>Você</small> : null}
                </strong>
                <span>{member.email}</span>
              </div>
              {member.role === "owner" ? (
                <div className="person-full-access">
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>Full</strong>
                    <small>Acesso obrigatório da proprietária</small>
                  </span>
                </div>
              ) : workspace.account.canManageTeam ? (
                <MemberAccessForm
                  member={member}
                  action={teamAction}
                  pending={teamPending}
                  onRemove={() => {
                    setRemoveTarget(member);
                    removeDialog.current?.showModal();
                  }}
                />
              ) : (
                <span className="person-access-summary">
                  {accessLabel(
                    member.operationalAccess,
                    member.financialAccess,
                  )}
                </span>
              )}
            </article>
          ))}
        </div>

        {workspace.account.canManageTeam &&
        workspace.people.invitations.length ? (
          <div className="pending-invitations">
            <h3>Convites aguardando resposta</h3>
            {workspace.people.invitations.map((invitation) => (
              <div key={invitation.id}>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    {accessLabel(
                      invitation.operationalAccess,
                      invitation.financialAccess,
                    )}{" "}
                    · válido até{" "}
                    {new Intl.DateTimeFormat("pt-BR").format(
                      new Date(invitation.expiresAt),
                    )}
                  </small>
                </span>
                <form action={teamAction}>
                  <input type="hidden" name="operation" value="revoke" />
                  <input
                    type="hidden"
                    name="invitationId"
                    value={invitation.id}
                  />
                  <button
                    className="quiet-action is-danger"
                    type="submit"
                    disabled={teamPending}
                  >
                    Cancelar convite
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="settings-card profile-danger" id="perfil">
        <header className="settings-card-head">
          <span>
            <UserRound aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Meu perfil</p>
            <h2>Seu acesso também pertence a você</h2>
            <p>
              Você pode excluir sua própria conta. Esta decisão encerra o acesso
              imediatamente e não possui recuperação pelo aplicativo.
            </p>
          </div>
        </header>
        <div className="profile-danger-copy">
          <div>
            <strong>
              {workspace.account.role === "owner" &&
              workspace.people.members.length === 1
                ? "Ao excluir, a confeitaria inteira deixa de existir no Zucchero."
                : workspace.account.role === "owner"
                  ? "Antes de sair, remova os demais acessos da confeitaria."
                  : "Ao excluir, você deixa esta confeitaria e perde o acesso aos dados."}
            </strong>
            <span>
              Registros sujeitos a obrigações legais podem ser preservados de
              forma restrita e anonimizada.
            </span>
          </div>
          <button
            className="button button-danger"
            type="button"
            onClick={() => deleteDialog.current?.showModal()}
          >
            <Trash2 aria-hidden="true" /> Excluir minha conta
          </button>
        </div>
      </section>

      <dialog className="purchase-dialog team-dialog" ref={inviteDialog}>
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Convidar para a bancada"
            eyebrow="Pessoas e acessos"
            closeLabel="Fechar convite"
            onClose={() => closeDialog(inviteDialog.current)}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Novo acesso</p>
                <h2>Quem vem dividir a bancada?</h2>
              </div>
              <p>
                O link vale por sete dias e cria uma conta dentro desta
                confeitaria — nunca uma empresa nova.
              </p>
            </header>
            {state.invitePath ? (
              <div className="invite-ready" role="status">
                <Check aria-hidden="true" />
                <div>
                  <strong>Convite pronto para enviar</strong>
                  <p>Por segurança, este link aparece somente agora.</p>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={copyInvite}
                  >
                    <Clipboard aria-hidden="true" />{" "}
                    {copied ? "Link copiado" : "Copiar link do convite"}
                  </button>
                </div>
              </div>
            ) : (
              <form className="team-invite-form" action={teamAction}>
                <input type="hidden" name="operation" value="invite" />
                <label className="settings-field">
                  <span>E-mail da pessoa</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    placeholder="pessoa@email.com"
                  />
                </label>
                <fieldset className="access-choices">
                  <legend>O que ela poderá fazer?</legend>
                  <label>
                    <input
                      type="checkbox"
                      name="operationalAccess"
                      defaultChecked
                    />
                    <span>
                      <strong>Operacional</strong>
                      <small>
                        Pedidos, receitas, produção, clientes, despensa e
                        equipamentos.
                      </small>
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" name="financialAccess" />
                    <span>
                      <strong>Financeiro</strong>
                      <small>
                        Financeiro completo e leitura dos pedidos, sem alterar a
                        operação.
                      </small>
                    </span>
                  </label>
                </fieldset>
                <div className="dialog-actions">
                  <button
                    className="signin-text-button"
                    type="button"
                    onClick={() => closeDialog(inviteDialog.current)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={teamPending}
                  >
                    <MailPlus aria-hidden="true" />{" "}
                    {teamPending ? "Preparando…" : "Preparar convite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog confirmation-dialog"
        ref={removeDialog}
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Remover acesso"
            eyebrow="Pessoas e acessos"
            closeLabel="Fechar remoção de acesso"
            onClose={() => closeDialog(removeDialog.current)}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <h2>{removeTarget?.displayName} deixa esta bancada?</h2>
              </div>
              <p>
                A conta perde o acesso imediatamente. Os registros que ela criou
                permanecem no histórico.
              </p>
            </header>
            <form action={teamAction}>
              <input type="hidden" name="operation" value="remove" />
              <input
                type="hidden"
                name="userId"
                value={removeTarget?.userId ?? ""}
              />
              <div className="dialog-actions">
                <button
                  className="signin-text-button"
                  type="button"
                  onClick={() => closeDialog(removeDialog.current)}
                >
                  Manter acesso
                </button>
                <button
                  className="button button-danger"
                  type="submit"
                  disabled={teamPending}
                >
                  <Trash2 aria-hidden="true" /> Remover acesso
                </button>
              </div>
            </form>
          </div>
        </div>
      </dialog>

      <dialog
        className="purchase-dialog delete-account-dialog"
        ref={deleteDialog}
      >
        <div className="purchase-panel rounded-scroll-shell">
          <ModalGlassHeader
            title="Excluir minha conta"
            eyebrow="Decisão irreversível"
            closeLabel="Fechar exclusão da conta"
            onClose={() => closeDialog(deleteDialog.current)}
          />
          <div className="purchase-panel-scroll rounded-scroll-area">
            <header className="purchase-panel-head">
              <div>
                <p className="eyebrow">Decisão irreversível</p>
                <h2>Confirme com cuidado.</h2>
              </div>
              <p>
                {workspace.account.role === "owner"
                  ? `Se esta for a única conta, ${workspace.tenantName} também será excluída sem possibilidade de recuperação pelo aplicativo.`
                  : "Seu acesso será encerrado e esta conta não poderá ser recuperada."}
              </p>
            </header>
            <form className="delete-account-form" action={deleteAction}>
              <label className="settings-field">
                <span>Digite o nome exato da confeitaria</span>
                <input
                  name="tenantName"
                  required
                  autoComplete="off"
                  placeholder={workspace.tenantName}
                />
              </label>
              <label className="settings-field">
                <span>Confirme sua senha</span>
                <span className="danger-password-field">
                  <KeyRound aria-hidden="true" />
                  <input
                    type="password"
                    name="password"
                    required
                    autoComplete="current-password"
                  />
                </span>
              </label>
              <label className="irreversible-check">
                <input
                  type="checkbox"
                  name="irreversibleConfirmation"
                  required
                />
                <span>Entendi que esta ação não pode ser desfeita.</span>
              </label>
              {deleteState.status === "error" ? (
                <div className="settings-error" role="alert">
                  {deleteState.message}
                </div>
              ) : null}
              <div className="dialog-actions">
                <button
                  className="signin-text-button"
                  type="button"
                  onClick={() => closeDialog(deleteDialog.current)}
                >
                  Voltar sem excluir
                </button>
                <button
                  className="button button-danger"
                  type="submit"
                  disabled={deletePending}
                >
                  <Trash2 aria-hidden="true" />{" "}
                  {deletePending ? "Excluindo…" : "Excluir definitivamente"}
                </button>
              </div>
            </form>
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
    </>
  );
}
