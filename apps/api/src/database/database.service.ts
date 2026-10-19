import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type AppDatabase = PostgresJsDatabase<typeof schema>;
export type AppTransaction = Parameters<
  Parameters<AppDatabase["transaction"]>[0]
>[0];

export type LocalAuthCredential = {
  userId: string;
  externalSubject: string;
  tenantId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  mfaEnabled: boolean;
  mfaSecret: string | null;
};

export type LocalInvitationPreview = {
  invitationId: string;
  tenantName: string;
  email: string;
  operationalAccess: boolean;
  financialAccess: boolean;
  expiresAt: Date;
};

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: Sql | null;
  readonly db: AppDatabase | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    this.client = databaseUrl
      ? postgres(databaseUrl, { max: 10, prepare: false })
      : null;
    this.db = this.client ? drizzle(this.client, { schema }) : null;
  }

  get isConfigured() {
    return this.client !== null;
  }

  async ping() {
    if (!this.client) return false;
    await this.client`select 1`;
    return true;
  }

  async withTenant<T>(
    tenantId: string,
    work: (transaction: AppTransaction) => Promise<T>,
  ) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }

    return this.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.current_tenant_id', ${tenantId}, true)`,
      );
      return work(transaction);
    });
  }

  async bootstrapTenantOwner(input: {
    tenantId: string;
    subject: string;
    email: string;
    displayName: string;
    tenantName: string;
    slug: string;
  }) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    await this.db.execute(
      sql`select bootstrap_tenant_owner(
        ${input.tenantId}::uuid,
        ${input.subject},
        ${input.email},
        ${input.displayName},
        ${input.tenantName},
        ${input.slug}
      )`,
    );
  }

  async registerLocalTenantOwner(input: {
    tenantId: string;
    userId: string;
    subject: string;
    email: string;
    displayName: string;
    tenantName: string;
    slug: string;
    passwordHash: string;
    logoDataUrl: string | null;
    addressLine: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    isCommercialPoint: boolean;
  }) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    await this.db.execute(
      sql`select register_local_tenant_owner(
        ${input.tenantId}::uuid,
        ${input.userId}::uuid,
        ${input.subject},
        ${input.email},
        ${input.displayName},
        ${input.tenantName},
        ${input.slug},
        ${input.passwordHash},
        ${input.logoDataUrl},
        ${input.addressLine},
        ${input.addressNumber},
        ${input.addressComplement},
        ${input.neighborhood},
        ${input.city},
        ${input.state},
        ${input.postalCode},
        ${input.isCommercialPoint}
      )`,
    );
  }

  async findLocalAuthCredential(email: string) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    const result = await this.db.execute(
      sql<LocalAuthCredential>`
        select
          user_id as "userId",
          external_subject as "externalSubject",
          tenant_id as "tenantId",
          email,
          display_name as "displayName",
          password_hash as "passwordHash",
          mfa_enabled as "mfaEnabled",
          mfa_secret as "mfaSecret"
        from find_local_auth_credential(${email})
      `,
    );
    const rows = result as unknown as LocalAuthCredential[];
    return rows[0] ?? null;
  }

  async createLocalInvitation(input: {
    tenantId: string;
    actorSubject: string;
    email: string;
    operationalAccess: boolean;
    financialAccess: boolean;
    tokenHash: string;
    expiresAt: Date;
  }) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    const result = await this.db.execute(
      sql<{ resultCode: string; invitationId: string | null }>`
        select
          result_code as "resultCode",
          invitation_id as "invitationId"
        from create_local_invitation(
          ${input.tenantId}::uuid,
          ${input.actorSubject},
          ${input.email},
          ${input.operationalAccess},
          ${input.financialAccess},
          ${input.tokenHash},
          ${input.expiresAt.toISOString()}::timestamptz
        )
      `,
    );
    const rows = result as unknown as Array<{
      resultCode: string;
      invitationId: string | null;
    }>;
    return rows[0] ?? null;
  }

  async findLocalInvitation(tokenHash: string) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    const result = await this.db.execute(
      sql<LocalInvitationPreview>`
        select
          invitation_id as "invitationId",
          tenant_name as "tenantName",
          email,
          operational_access as "operationalAccess",
          financial_access as "financialAccess",
          expires_at as "expiresAt"
        from find_local_invitation(${tokenHash})
      `,
    );
    const rows = result as unknown as LocalInvitationPreview[];
    return rows[0] ?? null;
  }

  async acceptLocalInvitation(input: {
    tokenHash: string;
    userId: string;
    subject: string;
    displayName: string;
    passwordHash: string;
  }) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    const result = await this.db.execute(
      sql<{ tenantId: string; tenantName: string; email: string }>`
        select
          tenant_id as "tenantId",
          tenant_name as "tenantName",
          email
        from accept_local_invitation(
          ${input.tokenHash},
          ${input.userId}::uuid,
          ${input.subject},
          ${input.displayName},
          ${input.passwordHash}
        )
      `,
    );
    const rows = result as unknown as Array<{
      tenantId: string;
      tenantName: string;
      email: string;
    }>;
    return rows[0] ?? null;
  }

  async listAccountNotifications(subject: string) {
    if (!this.db) return [];
    const result = await this.db.execute(
      sql<{ id: string; kind: string; message: string; createdAt: Date }>`
        select id, kind, message, created_at as "createdAt"
        from list_account_notifications(${subject})
      `,
    );
    return result as unknown as Array<{
      id: string;
      kind: string;
      message: string;
      createdAt: Date;
    }>;
  }

  async removeLocalAccount(input: {
    tenantId: string;
    subject: string;
    expectedTenantName: string;
  }) {
    if (!this.db) {
      throw new ServiceUnavailableException("Banco de dados não configurado.");
    }
    const result = await this.db.execute(
      sql<{ mode: string }>`
        select remove_local_account(
          ${input.tenantId}::uuid,
          ${input.subject},
          ${input.expectedTenantName}
        ) as mode
      `,
    );
    const rows = result as unknown as Array<{ mode: string }>;
    return rows[0]?.mode ?? null;
  }

  async onModuleDestroy() {
    await this.client?.end({ timeout: 5 });
  }
}
