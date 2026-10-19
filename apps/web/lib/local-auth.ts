import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export type LocalAuthConfiguration = {
  email: string;
  passwordHash: string;
  totpSecret: string;
  sessionSecret: string;
};

export function localAuthEnabled() {
  return process.env.LOCAL_AUTH_ENABLED === "true";
}

export function localAuthConfiguration(): LocalAuthConfiguration | null {
  if (!localAuthEnabled()) return null;

  const email = process.env.LOCAL_AUTH_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.LOCAL_AUTH_PASSWORD_HASH;
  const totpSecret = process.env.LOCAL_AUTH_TOTP_SECRET;
  const sessionSecret = process.env.LOCAL_AUTH_SESSION_SECRET;
  return email && passwordHash && totpSecret && sessionSecret
    ? { email, passwordHash, totpSecret, sessionSecret }
    : null;
}

export function verifyLocalPassword(
  config: LocalAuthConfiguration,
  email: string,
  password: string,
) {
  const [algorithm, saltHex, expectedHex] = config.passwordHash.split(":");
  if (algorithm !== "scrypt" || !saltHex || !expectedHex) return false;

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(
      password,
      Buffer.from(saltHex, "hex"),
      expected.length,
    );
    return (
      email.trim().toLowerCase() === config.email &&
      expected.length > 0 &&
      timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function createLocalMfaSession(
  config: LocalAuthConfiguration,
  issuedAt = Date.now(),
) {
  const timestamp = Math.floor(issuedAt / 1000).toString();
  const signature = createHmac("sha256", config.sessionSecret)
    .update(`${config.email}:${timestamp}`)
    .digest("base64url");
  return `local:${timestamp}:${signature}`;
}

export function verifyLocalMfaSession(
  config: LocalAuthConfiguration,
  session: string,
  now = Date.now(),
) {
  const [kind, timestamp, signature] = session.split(":");
  if (kind !== "local" || !timestamp || !signature) return false;

  const issuedAt = Number(timestamp) * 1000;
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt > now + 30_000 ||
    now - issuedAt > 300_000
  ) {
    return false;
  }

  const expected = createHmac("sha256", config.sessionSecret)
    .update(`${config.email}:${timestamp}`)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const character of value.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function localTotpCode(secret: string, time = Date.now()) {
  const counter = Math.floor(time / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function verifyLocalTotp(
  config: LocalAuthConfiguration,
  code: string,
  now = Date.now(),
) {
  return [-30_000, 0, 30_000].some((offset) => {
    const expected = Buffer.from(
      localTotpCode(config.totpSecret, now + offset),
    );
    const actual = Buffer.from(code);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}
