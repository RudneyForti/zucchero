import { createHmac, timingSafeEqual } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { z } from "zod";

const localTokenPayloadSchema = z.object({
  iss: z.literal("zucchero-local"),
  sub: z.string().min(1),
  tenantId: z.string().uuid(),
  email: z.string().email().max(254),
  name: z.string().trim().min(2).max(100),
  iat: z.number().int(),
  exp: z.number().int(),
});

const localMfaChallengeSchema = z.object({
  kind: z.literal("mfa"),
  userId: z.string().uuid(),
  email: z.string().email().max(254),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type LocalTokenPayload = z.infer<typeof localTokenPayloadSchema>;

function secret() {
  const value = process.env.LOCAL_AUTH_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "LOCAL_AUTH_SESSION_SECRET must contain at least 32 characters.",
    );
  }
  return value;
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createLocalIdentityToken(
  identity: Omit<LocalTokenPayload, "iss" | "iat" | "exp">,
  lifetimeSeconds = 8 * 60 * 60,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1_000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      ...identity,
      iss: "zucchero-local",
      iat: issuedAt,
      exp: issuedAt + lifetimeSeconds,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signature(unsigned)}`;
}

export function isLocalIdentityToken(value: string) {
  const [encodedHeader] = value.split(".");
  if (!encodedHeader) return false;
  try {
    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as { alg?: unknown };
    return header.alg === "HS256";
  } catch {
    return false;
  }
}

export function verifyLocalIdentityToken(value: string, now = Date.now()) {
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new UnauthorizedException("Sessão local inválida.");
  }
  const [header, payload, suppliedSignature] = parts as [
    string,
    string,
    string,
  ];
  const expected = Buffer.from(signature(`${header}.${payload}`));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new UnauthorizedException("Sessão local inválida.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new UnauthorizedException("Sessão local inválida.");
  }
  const parsed = localTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.exp <= Math.floor(now / 1_000)) {
    throw new UnauthorizedException("A sessão expirou. Entre novamente.");
  }
  return parsed.data;
}

export function createLocalMfaChallenge(
  identity: { userId: string; email: string },
  lifetimeSeconds = 5 * 60,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1_000);
  const payload = Buffer.from(
    JSON.stringify({
      kind: "mfa",
      ...identity,
      iat: issuedAt,
      exp: issuedAt + lifetimeSeconds,
    }),
  ).toString("base64url");
  return `mfa.${payload}.${signature(`mfa.${payload}`)}`;
}

export function verifyLocalMfaChallenge(value: string, now = Date.now()) {
  const [kind, payload, suppliedSignature] = value.split(".");
  if (kind !== "mfa" || !payload || !suppliedSignature) {
    throw new UnauthorizedException("A confirmação expirou. Entre novamente.");
  }
  const expected = Buffer.from(signature(`${kind}.${payload}`));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new UnauthorizedException("A confirmação expirou. Entre novamente.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new UnauthorizedException("A confirmação expirou. Entre novamente.");
  }
  const parsed = localMfaChallengeSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.exp <= Math.floor(now / 1_000)) {
    throw new UnauthorizedException("A confirmação expirou. Entre novamente.");
  }
  return parsed.data;
}
