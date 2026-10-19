import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service";
import {
  createLocalIdentityToken,
  createLocalMfaChallenge,
  verifyLocalMfaChallenge,
} from "./local-identity-token";
import { decryptTotpSecret, verifyTotp } from "./local-totp";

const scryptAsync = promisify(scrypt);

export const localSignupSchema = z.object({
  ownerName: z.string().trim().min(2).max(100),
  tenantName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(8)
    .max(256)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .regex(/[^A-Za-z0-9]/),
  logoDataUrl: z
    .string()
    .max(700_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
    .nullable()
    .optional(),
  addressLine: z.string().trim().max(240).nullable().optional(),
  addressNumber: z.string().trim().max(24).nullable().optional(),
  addressComplement: z.string().trim().max(120).nullable().optional(),
  neighborhood: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  isCommercialPoint: z.boolean().optional(),
});

export const localLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export const localMfaVerificationSchema = z.object({
  session: z.string().min(40).max(2_000),
  code: z.string().regex(/^\d{6}$/),
});

export const localInvitationAcceptSchema = z.object({
  token: z.string().min(32).max(256),
  displayName: z.string().trim().min(2).max(100),
  password: z
    .string()
    .min(8)
    .max(256)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .regex(/[^A-Za-z0-9]/),
});

function invitationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function localIdentityEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_AUTH_ENABLED === "true"
  );
}

function slug(name: string, tenantId: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "confeitaria"}-${tenantId.slice(0, 8)}`;
}

export async function hashLocalPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyLocalPasswordHash(hash: string, password: string) {
  const [algorithm, saltHex, expectedHex] = hash.split(":");
  if (algorithm !== "scrypt" || !saltHex || !expectedHex) return false;
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = (await scryptAsync(
      password,
      Buffer.from(saltHex, "hex"),
      expected.length,
    )) as Buffer;
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

@Injectable()
export class LocalIdentityService {
  constructor(private readonly database: DatabaseService) {}

  private assertEnabled() {
    if (!localIdentityEnabled()) {
      throw new ServiceUnavailableException(
        "A criação de contas locais não está disponível neste ambiente.",
      );
    }
  }

  async signup(input: unknown) {
    this.assertEnabled();
    const parsed = localSignupSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        "Revise os dados e use uma senha com maiúscula, minúscula, número e símbolo.",
      );
    }
    const tenantId = randomUUID();
    const userId = randomUUID();
    try {
      await this.database.registerLocalTenantOwner({
        tenantId,
        userId,
        subject: `local:${userId}`,
        email: parsed.data.email,
        displayName: parsed.data.ownerName,
        tenantName: parsed.data.tenantName,
        slug: slug(parsed.data.tenantName, tenantId),
        passwordHash: await hashLocalPassword(parsed.data.password),
        logoDataUrl: parsed.data.logoDataUrl ?? null,
        addressLine: parsed.data.addressLine || null,
        addressNumber: parsed.data.addressNumber || null,
        addressComplement: parsed.data.addressComplement || null,
        neighborhood: parsed.data.neighborhood || null,
        city: parsed.data.city || null,
        state: parsed.data.state || null,
        postalCode: parsed.data.postalCode || null,
        isCommercialPoint: parsed.data.isCommercialPoint ?? false,
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code === "23505") {
        throw new ConflictException("Este e-mail já possui uma conta.");
      }
      throw error;
    }
    return { status: "account-created" as const };
  }

  async login(input: unknown) {
    this.assertEnabled();
    const parsed = localLoginSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnauthorizedException(
        "E-mail ou senha não conferem. Revise os dados e tente novamente.",
      );
    }
    const identity = await this.database.findLocalAuthCredential(
      parsed.data.email,
    );
    if (
      !identity ||
      !(await verifyLocalPasswordHash(
        identity.passwordHash,
        parsed.data.password,
      ))
    ) {
      throw new UnauthorizedException(
        "E-mail ou senha não conferem. Revise os dados e tente novamente.",
      );
    }
    if (identity.mfaEnabled) {
      if (!identity.mfaSecret) {
        throw new ServiceUnavailableException(
          "A proteção desta conta precisa ser revisada antes da entrada.",
        );
      }
      return {
        status: "mfa-required" as const,
        mfaSession: createLocalMfaChallenge({
          userId: identity.userId,
          email: identity.email,
        }),
        expiresIn: 5 * 60,
      };
    }
    const expiresIn = 8 * 60 * 60;
    return {
      status: "authenticated" as const,
      idToken: createLocalIdentityToken(
        {
          sub: identity.externalSubject,
          tenantId: identity.tenantId,
          email: identity.email,
          name: identity.displayName,
        },
        expiresIn,
      ),
      expiresIn,
    };
  }

  async verifyMfa(input: unknown) {
    this.assertEnabled();
    const parsed = localMfaVerificationSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnauthorizedException(
        "Código inválido ou expirado. Confira e tente novamente.",
      );
    }
    const challenge = verifyLocalMfaChallenge(parsed.data.session);
    const identity = await this.database.findLocalAuthCredential(
      challenge.email,
    );
    if (
      !identity ||
      identity.userId !== challenge.userId ||
      !identity.mfaEnabled ||
      !identity.mfaSecret ||
      !verifyTotp(decryptTotpSecret(identity.mfaSecret), parsed.data.code)
    ) {
      throw new UnauthorizedException(
        "Código inválido ou expirado. Confira e tente novamente.",
      );
    }
    const expiresIn = 8 * 60 * 60;
    return {
      status: "authenticated" as const,
      idToken: createLocalIdentityToken(
        {
          sub: identity.externalSubject,
          tenantId: identity.tenantId,
          email: identity.email,
          name: identity.displayName,
        },
        expiresIn,
      ),
      expiresIn,
    };
  }

  async inspectInvitation(token: unknown) {
    this.assertEnabled();
    if (typeof token !== "string" || token.length < 32 || token.length > 256) {
      throw new BadRequestException("Este convite não é válido.");
    }
    const invitation = await this.database.findLocalInvitation(
      invitationHash(token),
    );
    if (!invitation) {
      throw new NotFoundException(
        "Este convite expirou, foi cancelado ou já foi usado.",
      );
    }
    return {
      tenantName: invitation.tenantName,
      email: invitation.email,
      operationalAccess: invitation.operationalAccess,
      financialAccess: invitation.financialAccess,
      expiresAt: new Date(invitation.expiresAt).toISOString(),
    };
  }

  async acceptInvitation(input: unknown) {
    this.assertEnabled();
    const parsed = localInvitationAcceptSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        "Revise seu nome e use uma senha com maiúscula, minúscula, número e símbolo.",
      );
    }
    const userId = randomUUID();
    try {
      const accepted = await this.database.acceptLocalInvitation({
        tokenHash: invitationHash(parsed.data.token),
        userId,
        subject: `local:${userId}`,
        displayName: parsed.data.displayName,
        passwordHash: await hashLocalPassword(parsed.data.password),
      });
      if (!accepted) throw new ConflictException("Convite indisponível.");
      return {
        status: "invitation-accepted" as const,
        email: accepted.email,
        tenantName: accepted.tenantName,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      if (message.includes("email_in_use")) {
        throw new ConflictException(
          "Este e-mail já está vinculado a uma confeitaria. Exclua a conta criada por engano antes de aceitar o convite.",
        );
      }
      if (
        message.includes("invitation_invalid") ||
        message.includes("tenant_unavailable")
      ) {
        throw new ConflictException(
          "Este convite expirou, foi cancelado ou já foi usado.",
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
}
