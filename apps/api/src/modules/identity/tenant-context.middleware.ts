import {
  Inject,
  Injectable,
  type NestMiddleware,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { createPublicKey, verify } from "node:crypto";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service";
import { appUsers, memberships } from "../../database/schema";
import type { TenantRawRequest } from "./tenant-request";
import {
  isLocalIdentityToken,
  verifyLocalIdentityToken,
} from "./local-identity-token";

const tenantIdSchema = z.string().uuid();
const jwtHeaderSchema = z.object({ alg: z.literal("RS256"), kid: z.string() });
const jwtPayloadSchema = z.object({
  sub: z.string().min(1),
  iss: z.string().url(),
  exp: z.number().int(),
  nbf: z.number().int().optional(),
  token_use: z.enum(["access", "id"]),
  client_id: z.string().optional(),
  aud: z.string().optional(),
  "custom:tenant_id": z.string().uuid(),
  "custom:tenant_name": z.string().trim().min(2).max(120).optional(),
  email: z.string().email().max(254).optional(),
  name: z.string().trim().min(2).max(100).optional(),
});

type JsonWebKeySet = {
  keys: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }>;
};

const jwksCache = new Map<
  string,
  { expiresAt: number; keys: JsonWebKeySet["keys"] }
>();

function decodePart(value: string) {
  return JSON.parse(
    Buffer.from(value, "base64url").toString("utf8"),
  ) as unknown;
}

export function validateCognitoClaims(
  payload: unknown,
  expectedIssuer: string,
  expectedClientId?: string,
) {
  const parsed = jwtPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.iss !== expectedIssuer) {
    throw new UnauthorizedException("Token de acesso inválido.");
  }
  const now = Math.floor(Date.now() / 1_000);
  if (parsed.data.exp <= now || (parsed.data.nbf && parsed.data.nbf > now)) {
    throw new UnauthorizedException("A sessão expirou. Entre novamente.");
  }
  if (
    expectedClientId &&
    parsed.data.client_id !== expectedClientId &&
    parsed.data.aud !== expectedClientId
  ) {
    throw new UnauthorizedException("Token emitido para outro aplicativo.");
  }
  return parsed.data;
}

async function signingKey(issuer: string, kid: string) {
  const cached = jwksCache.get(issuer);
  let keys =
    cached?.expiresAt && cached.expiresAt > Date.now() ? cached.keys : null;
  if (!keys) {
    const response = await fetch(`${issuer}/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        "Não foi possível validar a identidade agora.",
      );
    }
    const parsed = z
      .object({ keys: z.array(z.record(z.string(), z.unknown())) })
      .parse(await response.json());
    keys = parsed.keys;
    jwksCache.set(issuer, { expiresAt: Date.now() + 3_600_000, keys });
  }
  const key = keys.find((entry) => entry.kid === kid && entry.kty === "RSA");
  if (!key)
    throw new UnauthorizedException("Chave de assinatura desconhecida.");
  return createPublicKey({ key, format: "jwk" });
}

async function verifyCognitoToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new UnauthorizedException("Token inválido.");
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [
    string,
    string,
    string,
  ];
  const header = jwtHeaderSchema.safeParse(decodePart(encodedHeader));
  if (!header.success) throw new UnauthorizedException("Token inválido.");
  const region = process.env.AWS_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!region || !userPoolId) {
    throw new ServiceUnavailableException(
      "A identidade gerenciada ainda não foi configurada.",
    );
  }
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const claims = validateCognitoClaims(
    decodePart(encodedPayload),
    issuer,
    process.env.COGNITO_CLIENT_ID,
  );
  const key = await signingKey(issuer, header.data.kid);
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    key,
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!valid) throw new UnauthorizedException("Assinatura do token inválida.");
  return claims;
}

function tenantSlug(name: string, tenantId: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "confeitaria"}-${tenantId.slice(0, 8)}`;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async use(
    request: TenantRawRequest,
    _reply: ServerResponse,
    next: () => void,
  ) {
    if (process.env.NODE_ENV !== "production") {
      const authorization = request.headers.authorization;
      const bearer = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : null;
      if (bearer && isLocalIdentityToken(bearer)) {
        const claims = verifyLocalIdentityToken(bearer);
        const membership = await this.membership(claims.tenantId, claims.sub);
        if (!membership) {
          throw new UnauthorizedException(
            "Esta conta não está vinculada a esta confeitaria.",
          );
        }
        request.tenantContext = {
          tenantId: claims.tenantId,
          userId: membership.userId,
          subject: claims.sub,
          role: membership.role,
          operationalAccess: membership.operationalAccess,
          financialAccess: membership.financialAccess,
          source: "local",
        };
        next();
        return;
      }
      const header = request.headers["x-demo-tenant-id"];
      const parsed = tenantIdSchema.safeParse(
        Array.isArray(header) ? header[0] : header,
      );
      if (!parsed.success) {
        throw new UnauthorizedException(
          "Contexto da empresa ausente ou inválido.",
        );
      }
      const demoOwner = await this.firstOwner(parsed.data);
      request.tenantContext = {
        tenantId: parsed.data,
        userId: demoOwner?.userId ?? null,
        subject: demoOwner?.subject ?? "local-demo-owner",
        role: "owner",
        operationalAccess: true,
        financialAccess: true,
        source: "development-demo",
      };
      next();
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Entre para acessar sua confeitaria.");
    }
    const claims = await verifyCognitoToken(authorization.slice(7));
    const tenantId = claims["custom:tenant_id"];
    let membership = await this.membership(tenantId, claims.sub);
    if (!membership) {
      const tenantName = claims["custom:tenant_name"];
      const email = claims.email;
      if (!tenantName || !email) {
        throw new UnauthorizedException(
          "Esta conta ainda não foi vinculada a uma confeitaria.",
        );
      }
      try {
        await this.database.bootstrapTenantOwner({
          tenantId,
          subject: claims.sub,
          email,
          displayName: claims.name ?? tenantName,
          tenantName,
          slug: tenantSlug(tenantName, tenantId),
        });
      } catch {
        throw new UnauthorizedException(
          "Não foi possível preparar a confeitaria desta conta.",
        );
      }
      membership = {
        userId: claims.sub,
        role: "owner" as const,
        operationalAccess: true,
        financialAccess: true,
      };
    }
    request.tenantContext = {
      tenantId,
      userId: membership.userId,
      subject: claims.sub,
      role: membership.role,
      operationalAccess: membership.operationalAccess,
      financialAccess: membership.financialAccess,
      source: "cognito",
    };
    next();
  }

  private membership(tenantId: string, subject: string) {
    return this.database.withTenant(tenantId, async (transaction) => {
      const [entry] = await transaction
        .select({
          userId: appUsers.id,
          role: memberships.role,
          operationalAccess: memberships.operationalAccess,
          financialAccess: memberships.financialAccess,
        })
        .from(appUsers)
        .innerJoin(memberships, eq(memberships.userId, appUsers.id))
        .where(
          and(
            eq(appUsers.externalSubject, subject),
            eq(memberships.tenantId, tenantId),
          ),
        );
      return entry;
    });
  }

  private firstOwner(tenantId: string) {
    return this.database.withTenant(tenantId, async (transaction) => {
      const [entry] = await transaction
        .select({ userId: appUsers.id, subject: appUsers.externalSubject })
        .from(appUsers)
        .innerJoin(memberships, eq(memberships.userId, appUsers.id))
        .where(
          and(
            eq(memberships.tenantId, tenantId),
            eq(memberships.role, "owner"),
          ),
        )
        .limit(1);
      return entry;
    });
  }
}
