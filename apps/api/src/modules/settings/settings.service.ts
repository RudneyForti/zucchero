import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  appUsers,
  auditEvents,
  localAuthCredentials,
  memberships,
  tenantInvitations,
  tenants,
  tenantSettings,
} from "../../database/schema";
import type {
  BusinessDay,
  SettingsMutationResult,
  SettingsWorkspace,
  UpdateBusinessHoursInput,
  UpdateCompanyInput,
  UpdateProfileInput,
  UpdateSalesPresetsInput,
} from "./settings.contract";
import type { TenantContext } from "../identity/tenant-context";
import { verifyLocalPasswordHash } from "../identity/local-identity.service";
import {
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  totpProvisioningUri,
  verifyTotp,
} from "../identity/local-totp";

const demoTenantId = "11111111-1111-4111-8111-111111111111";

const defaultBusinessHours: BusinessDay[] = [
  { day: "monday", enabled: true, start: "08:00", end: "18:00" },
  { day: "tuesday", enabled: true, start: "08:00", end: "18:00" },
  { day: "wednesday", enabled: true, start: "08:00", end: "18:00" },
  { day: "thursday", enabled: true, start: "08:00", end: "18:00" },
  { day: "friday", enabled: true, start: "08:00", end: "18:00" },
  { day: "saturday", enabled: true, start: "08:00", end: "14:00" },
  { day: "sunday", enabled: false, start: "08:00", end: "14:00" },
];

function nullable(value?: string) {
  return value?.trim() || null;
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getForTenant(tenant: TenantContext): Promise<SettingsWorkspace> {
    if (!this.database.isConfigured) return this.fallback(tenant.tenantId);
    const workspace = await this.database.withTenant(
      tenant.tenantId,
      (transaction) =>
        this.loadWorkspace(transaction, tenant.tenantId, tenant.subject),
    );
    workspace.accountNotifications = (
      await this.database.listAccountNotifications(tenant.subject)
    ).map((notification) => ({
      ...notification,
      createdAt: new Date(notification.createdAt).toISOString(),
    }));
    return workspace;
  }

  async updateCompany(
    tenantId: string,
    input: UpdateCompanyInput,
  ): Promise<SettingsMutationResult> {
    this.requireDatabase();
    return this.database.withTenant(tenantId, async (transaction) => {
      const [updated] = await transaction
        .update(tenants)
        .set({
          name: input.name,
          phone: nullable(input.phone),
          email: nullable(input.email),
          taxDocument: nullable(input.taxDocument),
          addressLine: nullable(input.addressLine),
          addressNumber: nullable(input.addressNumber),
          addressComplement: nullable(input.addressComplement),
          neighborhood: nullable(input.neighborhood),
          city: nullable(input.city),
          state: nullable(input.state)?.toUpperCase() ?? null,
          postalCode: nullable(input.postalCode),
          isCommercialPoint: input.isCommercialPoint ?? false,
          ...(input.logoDataUrl !== undefined
            ? { logoDataUrl: input.logoDataUrl }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId))
        .returning({ id: tenants.id });
      if (!updated) throw new NotFoundException("Confeitaria não encontrada.");
      await this.audit(transaction, tenantId, "SETTINGS_COMPANY_UPDATED", {
        fields: Object.keys(input),
      });
      return {
        message: "Dados da confeitaria guardados.",
        workspace: await this.loadWorkspace(transaction, tenantId),
      };
    });
  }

  async updateProfile(
    tenant: TenantContext,
    input: UpdateProfileInput,
  ): Promise<SettingsMutationResult> {
    this.requireDatabase();
    if (!tenant.userId) {
      throw new ConflictException("Não encontramos o usuário deste acesso.");
    }
    return this.database.withTenant(tenant.tenantId, async (transaction) => {
      const [updated] = await transaction
        .update(appUsers)
        .set({
          displayName: input.displayName,
          ...(input.avatarDataUrl !== undefined
            ? { avatarDataUrl: input.avatarDataUrl }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(appUsers.id, tenant.userId as string))
        .returning({ id: appUsers.id });
      if (!updated) throw new NotFoundException("Perfil não encontrado.");
      await this.audit(
        transaction,
        tenant.tenantId,
        "PROFILE_UPDATED",
        { fields: Object.keys(input) },
        tenant.userId,
      );
      return {
        message: "Seu perfil foi guardado.",
        workspace: await this.loadWorkspace(
          transaction,
          tenant.tenantId,
          tenant.subject,
        ),
      };
    });
  }

  async setupMfa(tenant: TenantContext) {
    this.assertLocalProfile(tenant);
    const secret = createTotpSecret();
    const result = await this.database.withTenant(
      tenant.tenantId,
      async (transaction) => {
        const [credential] = await transaction
          .select({
            email: localAuthCredentials.email,
            mfaEnabled: localAuthCredentials.mfaEnabled,
          })
          .from(localAuthCredentials)
          .where(eq(localAuthCredentials.userId, tenant.userId as string))
          .limit(1);
        if (!credential) throw new NotFoundException("Conta não encontrada.");
        if (credential.mfaEnabled) {
          throw new ConflictException(
            "O Authenticator já está ativo nesta conta.",
          );
        }
        await transaction
          .update(localAuthCredentials)
          .set({
            mfaSecret: encryptTotpSecret(secret),
            mfaEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(localAuthCredentials.userId, tenant.userId as string));
        await this.audit(
          transaction,
          tenant.tenantId,
          "PROFILE_MFA_SETUP_STARTED",
          { method: "totp" },
          tenant.userId,
        );
        return { email: credential.email };
      },
    );
    return {
      status: "setup-ready" as const,
      secret,
      provisioningUri: totpProvisioningUri(result.email, secret),
    };
  }

  async confirmMfa(tenant: TenantContext, input: { code: string }) {
    this.assertLocalProfile(tenant);
    return this.database.withTenant(tenant.tenantId, async (transaction) => {
      const [credential] = await transaction
        .select({
          mfaSecret: localAuthCredentials.mfaSecret,
          mfaEnabled: localAuthCredentials.mfaEnabled,
        })
        .from(localAuthCredentials)
        .where(eq(localAuthCredentials.userId, tenant.userId as string))
        .limit(1);
      if (!credential?.mfaSecret) {
        throw new ConflictException(
          "Comece a configuração do Authenticator novamente.",
        );
      }
      if (
        credential.mfaEnabled ||
        !verifyTotp(decryptTotpSecret(credential.mfaSecret), input.code)
      ) {
        throw new UnauthorizedException(
          credential.mfaEnabled
            ? "O Authenticator já está ativo nesta conta."
            : "O código não conferiu. Aguarde o próximo e tente novamente.",
        );
      }
      await transaction
        .update(localAuthCredentials)
        .set({ mfaEnabled: true, updatedAt: new Date() })
        .where(eq(localAuthCredentials.userId, tenant.userId as string));
      await this.audit(
        transaction,
        tenant.tenantId,
        "PROFILE_MFA_ENABLED",
        { method: "totp" },
        tenant.userId,
      );
      return {
        message: "Authenticator ativado. Seu próximo acesso pedirá um código.",
        workspace: await this.loadWorkspace(
          transaction,
          tenant.tenantId,
          tenant.subject,
        ),
      };
    });
  }

  async disableMfa(
    tenant: TenantContext,
    input: { password: string; code: string },
  ) {
    this.assertLocalProfile(tenant);
    return this.database.withTenant(tenant.tenantId, async (transaction) => {
      const [credential] = await transaction
        .select({
          passwordHash: localAuthCredentials.passwordHash,
          mfaSecret: localAuthCredentials.mfaSecret,
          mfaEnabled: localAuthCredentials.mfaEnabled,
        })
        .from(localAuthCredentials)
        .where(eq(localAuthCredentials.userId, tenant.userId as string))
        .limit(1);
      if (!credential?.mfaEnabled || !credential.mfaSecret) {
        throw new ConflictException("O Authenticator não está ativo.");
      }
      const [passwordMatches, codeMatches] = await Promise.all([
        verifyLocalPasswordHash(credential.passwordHash, input.password),
        Promise.resolve(
          verifyTotp(decryptTotpSecret(credential.mfaSecret), input.code),
        ),
      ]);
      if (!passwordMatches || !codeMatches) {
        throw new UnauthorizedException(
          "A senha ou o código não conferem. Revise os dois campos.",
        );
      }
      await transaction
        .update(localAuthCredentials)
        .set({ mfaSecret: null, mfaEnabled: false, updatedAt: new Date() })
        .where(eq(localAuthCredentials.userId, tenant.userId as string));
      await this.audit(
        transaction,
        tenant.tenantId,
        "PROFILE_MFA_DISABLED",
        { method: "totp" },
        tenant.userId,
      );
      return {
        message: "Authenticator desativado para esta conta.",
        workspace: await this.loadWorkspace(
          transaction,
          tenant.tenantId,
          tenant.subject,
        ),
      };
    });
  }

  async updateSales(
    tenantId: string,
    input: UpdateSalesPresetsInput,
  ): Promise<SettingsMutationResult> {
    this.requireDatabase();
    return this.database.withTenant(tenantId, async (transaction) => {
      await transaction
        .insert(tenantSettings)
        .values({
          tenantId,
          defaultMarginBasisPoints: Math.round(
            input.defaultMarginPercentage * 100,
          ),
          defaultDepositBasisPoints: Math.round(
            input.defaultDepositPercentage * 100,
          ),
          defaultPaymentMethod: input.defaultPaymentMethod,
          defaultDeliveryMode: input.defaultDeliveryMode,
          deliveryCostPerKm: input.deliveryCostPerKm,
          businessHours: defaultBusinessHours,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tenantSettings.tenantId,
          set: {
            defaultMarginBasisPoints: Math.round(
              input.defaultMarginPercentage * 100,
            ),
            defaultDepositBasisPoints: Math.round(
              input.defaultDepositPercentage * 100,
            ),
            defaultPaymentMethod: input.defaultPaymentMethod,
            defaultDeliveryMode: input.defaultDeliveryMode,
            deliveryCostPerKm: input.deliveryCostPerKm,
            updatedAt: new Date(),
          },
        });
      await this.audit(transaction, tenantId, "SETTINGS_SALES_UPDATED", {
        defaultMarginPercentage: input.defaultMarginPercentage,
        defaultDepositPercentage: input.defaultDepositPercentage,
        defaultPaymentMethod: input.defaultPaymentMethod,
        defaultDeliveryMode: input.defaultDeliveryMode,
        deliveryCostPerKm: input.deliveryCostPerKm,
      });
      return {
        message: "Combinados de venda atualizados.",
        workspace: await this.loadWorkspace(transaction, tenantId),
      };
    });
  }

  async updateBusinessHours(
    tenantId: string,
    input: UpdateBusinessHoursInput,
  ): Promise<SettingsMutationResult> {
    this.requireDatabase();
    return this.database.withTenant(tenantId, async (transaction) => {
      await transaction
        .insert(tenantSettings)
        .values({ tenantId, businessHours: input.days, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: tenantSettings.tenantId,
          set: { businessHours: input.days, updatedAt: new Date() },
        });
      await this.audit(transaction, tenantId, "SETTINGS_HOURS_UPDATED", {
        enabledDays: input.days
          .filter((entry) => entry.enabled)
          .map((entry) => entry.day),
      });
      return {
        message: "Ritmo da cozinha atualizado.",
        workspace: await this.loadWorkspace(transaction, tenantId),
      };
    });
  }

  async inviteMember(
    tenant: TenantContext,
    input: {
      email: string;
      operationalAccess: boolean;
      financialAccess: boolean;
    },
  ) {
    this.requireDatabase();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
    const result = await this.database.createLocalInvitation({
      tenantId: tenant.tenantId,
      actorSubject: tenant.subject,
      email: input.email,
      operationalAccess: input.operationalAccess,
      financialAccess: input.financialAccess,
      tokenHash,
      expiresAt,
    });
    if (!result || result.resultCode !== "created" || !result.invitationId) {
      const messages: Record<string, string> = {
        already_member: "Este e-mail já faz parte desta confeitaria.",
        already_invited: "Este e-mail já possui um convite ativo.",
        email_in_use:
          "Este e-mail já está vinculado a outra confeitaria. A pessoa precisa excluir a conta criada por engano antes de receber este convite.",
      };
      throw new ConflictException(
        messages[result?.resultCode ?? ""] ??
          "Não foi possível preparar este convite.",
      );
    }
    const workspace = await this.database.withTenant(
      tenant.tenantId,
      (transaction) =>
        this.loadWorkspace(transaction, tenant.tenantId, tenant.subject),
    );
    return {
      message: "Convite preparado. Copie o link e envie para a pessoa.",
      invitationId: result.invitationId,
      token,
      expiresAt: expiresAt.toISOString(),
      workspace,
    };
  }

  async updateMemberAccess(
    tenant: TenantContext,
    userId: string,
    input: { operationalAccess: boolean; financialAccess: boolean },
  ) {
    return this.database.withTenant(tenant.tenantId, async (transaction) => {
      const [member] = await transaction
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.tenantId, tenant.tenantId),
            eq(memberships.userId, userId),
          ),
        )
        .limit(1);
      if (!member) throw new NotFoundException("Acesso não encontrado.");
      if (member.role === "owner") {
        throw new ForbiddenException(
          "O acesso Full da proprietária não pode ser reduzido.",
        );
      }
      await transaction
        .update(memberships)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(memberships.tenantId, tenant.tenantId),
            eq(memberships.userId, userId),
          ),
        );
      await this.audit(
        transaction,
        tenant.tenantId,
        "TEAM_MEMBER_ACCESS_UPDATED",
        { userId, ...input },
        tenant.userId,
      );
      return {
        message: "Acesso atualizado.",
        workspace: await this.loadWorkspace(
          transaction,
          tenant.tenantId,
          tenant.subject,
        ),
      };
    });
  }

  async removeMember(tenant: TenantContext, userId: string) {
    if (tenant.userId === userId) {
      throw new BadRequestException(
        "Para remover seu próprio acesso, use Meu perfil.",
      );
    }
    return this.database.withTenant(tenant.tenantId, async (transaction) => {
      const [member] = await transaction
        .select({ role: memberships.role, email: appUsers.email })
        .from(memberships)
        .innerJoin(appUsers, eq(memberships.userId, appUsers.id))
        .where(
          and(
            eq(memberships.tenantId, tenant.tenantId),
            eq(memberships.userId, userId),
          ),
        )
        .limit(1);
      if (!member) throw new NotFoundException("Acesso não encontrado.");
      if (member.role === "owner") {
        throw new ForbiddenException(
          "A proprietária é o acesso Full obrigatório desta confeitaria.",
        );
      }
      await this.audit(
        transaction,
        tenant.tenantId,
        "TEAM_MEMBER_REMOVED",
        { userId, email: member.email },
        tenant.userId,
      );
      await transaction
        .delete(localAuthCredentials)
        .where(eq(localAuthCredentials.userId, userId));
      await transaction
        .update(appUsers)
        .set({
          email: `removed+${userId}@zucchero.invalid`,
          externalSubject: `removed:${userId}`,
          displayName: "Conta removida",
          deletedAt: new Date(),
        })
        .where(eq(appUsers.id, userId));
      await transaction
        .delete(memberships)
        .where(
          and(
            eq(memberships.tenantId, tenant.tenantId),
            eq(memberships.userId, userId),
          ),
        );
      return {
        message: "Acesso removido desta confeitaria.",
        workspace: await this.loadWorkspace(
          transaction,
          tenant.tenantId,
          tenant.subject,
        ),
      };
    });
  }

  async revokeInvitation(tenant: TenantContext, invitationId: string) {
    return this.database.withTenant(tenant.tenantId, async (transaction) => {
      const [revoked] = await transaction
        .update(tenantInvitations)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(tenantInvitations.id, invitationId),
            eq(tenantInvitations.tenantId, tenant.tenantId),
            isNull(tenantInvitations.acceptedAt),
            isNull(tenantInvitations.revokedAt),
          ),
        )
        .returning({ id: tenantInvitations.id });
      if (!revoked) throw new NotFoundException("Convite não encontrado.");
      await this.audit(
        transaction,
        tenant.tenantId,
        "TEAM_INVITATION_REVOKED",
        { invitationId },
        tenant.userId,
      );
      return {
        message: "Convite cancelado.",
        workspace: await this.loadWorkspace(
          transaction,
          tenant.tenantId,
          tenant.subject,
        ),
      };
    });
  }

  async deleteOwnAccount(
    tenant: TenantContext,
    input: { password: string; tenantName: string },
  ) {
    if (tenant.source !== "local" || !tenant.userId) {
      throw new ForbiddenException(
        "A exclusão desta identidade deve ser concluída pelo provedor de acesso.",
      );
    }
    const credential = await this.database.withTenant(
      tenant.tenantId,
      async (transaction) => {
        const [entry] = await transaction
          .select({ passwordHash: localAuthCredentials.passwordHash })
          .from(localAuthCredentials)
          .where(eq(localAuthCredentials.userId, tenant.userId as string))
          .limit(1);
        return entry;
      },
    );
    if (
      !credential ||
      !(await verifyLocalPasswordHash(credential.passwordHash, input.password))
    ) {
      throw new UnauthorizedException("A senha não confere.");
    }
    try {
      const mode = await this.database.removeLocalAccount({
        tenantId: tenant.tenantId,
        subject: tenant.subject,
        expectedTenantName: input.tenantName,
      });
      return {
        status: mode,
        message:
          mode === "company-deleted"
            ? "A conta e a confeitaria foram excluídas."
            : "Seu acesso e sua conta foram excluídos.",
      };
    } catch (error) {
      const message = this.errorMessage(error);
      if (message.includes("tenant_name_mismatch")) {
        throw new BadRequestException(
          "Digite exatamente o nome da confeitaria para confirmar.",
        );
      }
      if (message.includes("owner_has_team")) {
        throw new ConflictException(
          "Remova os demais acessos antes de excluir a confeitaria. A transferência de propriedade ficará para uma próxima etapa.",
        );
      }
      throw error;
    }
  }

  private errorMessage(error: unknown) {
    const messages: string[] = [];
    let current: unknown = error;
    for (let index = 0; index < 4 && current; index += 1) {
      if (current instanceof Error) messages.push(current.message);
      current =
        typeof current === "object" && current && "cause" in current
          ? (current as { cause?: unknown }).cause
          : null;
    }
    return messages.join(" ");
  }

  private requireDatabase() {
    if (!this.database.isConfigured) {
      throw new ConflictException("Conecte o banco para guardar os ajustes.");
    }
  }

  private assertLocalProfile(tenant: TenantContext) {
    this.requireDatabase();
    if (tenant.source !== "local" || !tenant.userId) {
      throw new ForbiddenException(
        "Esta configuração pertence ao provedor de acesso desta conta.",
      );
    }
  }

  private async audit(
    transaction: AppTransaction,
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
    actorUserId: string | null = null,
  ) {
    await transaction.insert(auditEvents).values({
      tenantId,
      actorUserId,
      eventType,
      correlationId: randomUUID(),
      payload,
    });
  }

  private async loadWorkspace(
    transaction: AppTransaction,
    tenantId: string,
    subject?: string,
  ): Promise<SettingsWorkspace> {
    const [[tenant], [settings], members, invitations] = await Promise.all([
      transaction
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1),
      transaction
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1),
      transaction
        .select({
          userId: appUsers.id,
          externalSubject: appUsers.externalSubject,
          displayName: appUsers.displayName,
          email: appUsers.email,
          avatarDataUrl: appUsers.avatarDataUrl,
          role: memberships.role,
          operationalAccess: memberships.operationalAccess,
          financialAccess: memberships.financialAccess,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(appUsers, eq(memberships.userId, appUsers.id))
        .where(eq(memberships.tenantId, tenantId))
        .orderBy(asc(appUsers.displayName)),
      transaction
        .select({
          id: tenantInvitations.id,
          email: tenantInvitations.email,
          operationalAccess: tenantInvitations.operationalAccess,
          financialAccess: tenantInvitations.financialAccess,
          expiresAt: tenantInvitations.expiresAt,
          createdAt: tenantInvitations.createdAt,
        })
        .from(tenantInvitations)
        .where(
          and(
            eq(tenantInvitations.tenantId, tenantId),
            isNull(tenantInvitations.acceptedAt),
            isNull(tenantInvitations.revokedAt),
            gt(tenantInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(tenantInvitations.createdAt)),
    ]);
    if (!tenant) throw new NotFoundException("Confeitaria não encontrada.");
    const owner = members.find((member) => member.role === "owner");
    const current =
      members.find((member) => member.externalSubject === subject) ?? owner;
    const [localCredential] = current
      ? await transaction
          .select({ mfaEnabled: localAuthCredentials.mfaEnabled })
          .from(localAuthCredentials)
          .where(eq(localAuthCredentials.userId, current.userId))
          .limit(1)
      : [];
    const businessHours = settings?.businessHours?.length
      ? settings.businessHours
      : defaultBusinessHours;
    return {
      tenantName: tenant.name,
      ownerName: current?.displayName ?? owner?.displayName ?? "Proprietária",
      account: {
        userId: current?.userId ?? null,
        email: current?.email ?? null,
        role: current?.role ?? "owner",
        operationalAccess: current?.operationalAccess ?? true,
        financialAccess: current?.financialAccess ?? true,
        canManageTeam: (current?.role ?? "owner") === "owner",
        avatarDataUrl: current?.avatarDataUrl ?? null,
        mfaAvailable: Boolean(current?.externalSubject.startsWith("local:")),
        mfaEnabled: localCredential?.mfaEnabled ?? false,
      },
      timezone: settings?.timezone ?? "America/Sao_Paulo",
      company: {
        name: tenant.name,
        phone: tenant.phone,
        email: tenant.email,
        taxDocument: tenant.taxDocument,
        addressLine: tenant.addressLine,
        addressNumber: tenant.addressNumber,
        addressComplement: tenant.addressComplement,
        neighborhood: tenant.neighborhood,
        city: tenant.city,
        state: tenant.state,
        postalCode: tenant.postalCode,
        isCommercialPoint: tenant.isCommercialPoint,
        logoDataUrl: tenant.logoDataUrl,
      },
      sales: {
        defaultMarginPercentage:
          (settings?.defaultMarginBasisPoints ?? 3_500) / 100,
        defaultDepositPercentage:
          (settings?.defaultDepositBasisPoints ?? 5_000) / 100,
        defaultPaymentMethod: (settings?.defaultPaymentMethod ?? "pix") as
          "pix" | "card" | "cash",
        defaultDeliveryMode: (settings?.defaultDeliveryMode ?? "delivery") as
          "delivery" | "pickup",
        deliveryCostPerKm: settings?.deliveryCostPerKm ?? 0,
      },
      integrations: {
        googleMapsRoutesEnabled: Boolean(
          process.env.GOOGLE_MAPS_API_KEY?.trim(),
        ),
      },
      businessHours,
      people: {
        members: members
          .map((member) => ({
            userId: member.userId,
            displayName: member.displayName,
            email: member.email,
            role: member.role,
            operationalAccess: member.operationalAccess,
            financialAccess: member.financialAccess,
            current: member.externalSubject === subject,
            joinedAt: member.joinedAt.toISOString(),
          }))
          .sort((left, right) =>
            left.role === right.role ? 0 : left.role === "owner" ? -1 : 1,
          ),
        invitations: invitations.map((invitation) => ({
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        })),
      },
      accountNotifications: [],
      updatedAt: (settings?.updatedAt ?? tenant.updatedAt).toISOString(),
    };
  }

  private fallback(tenantId: string): SettingsWorkspace {
    const tenantName =
      tenantId === demoTenantId
        ? "Stefanie Dellavolpe Doces"
        : "Confeitaria Vizinha";
    return {
      tenantName,
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
      account: {
        userId: null,
        email: null,
        role: "owner",
        operationalAccess: true,
        financialAccess: true,
        canManageTeam: true,
        avatarDataUrl: null,
        mfaAvailable: false,
        mfaEnabled: false,
      },
      timezone: "America/Sao_Paulo",
      company: {
        name: tenantName,
        phone: null,
        email: null,
        taxDocument: null,
        addressLine: null,
        addressNumber: null,
        addressComplement: null,
        neighborhood: null,
        city: null,
        state: null,
        postalCode: null,
        isCommercialPoint: false,
        logoDataUrl: null,
      },
      sales: {
        defaultMarginPercentage: 35,
        defaultDepositPercentage: 50,
        defaultPaymentMethod: "pix",
        defaultDeliveryMode: "delivery",
        deliveryCostPerKm: 0,
      },
      integrations: {
        googleMapsRoutesEnabled: Boolean(
          process.env.GOOGLE_MAPS_API_KEY?.trim(),
        ),
      },
      businessHours: defaultBusinessHours,
      people: { members: [], invitations: [] },
      accountNotifications: [],
      updatedAt: new Date(0).toISOString(),
    };
  }
}
