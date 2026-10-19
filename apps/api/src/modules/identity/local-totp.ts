import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const encryptedPrefix = "enc:v1";

function encryptionKey() {
  const source =
    process.env.LOCAL_MFA_ENCRYPTION_KEY?.trim() ||
    process.env.LOCAL_AUTH_SESSION_SECRET;
  if (!source || source.length < 32) {
    throw new Error(
      "LOCAL_MFA_ENCRYPTION_KEY or LOCAL_AUTH_SESSION_SECRET must contain at least 32 characters.",
    );
  }
  return createHash("sha256").update(source).digest();
}

export function encodeBase32(value: Buffer) {
  let bits = 0;
  let accumulator = 0;
  let result = "";

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += base32Alphabet[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += base32Alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value: string) {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const character of value.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = base32Alphabet.indexOf(character);
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

export function createTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpCode(secret: string, time = Date.now()) {
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

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-30_000, 0, 30_000].some((offset) => {
    const expected = Buffer.from(totpCode(secret, now + offset));
    const supplied = Buffer.from(code);
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  });
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    encryptedPrefix,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptTotpSecret(value: string) {
  if (!value.startsWith(`${encryptedPrefix}:`)) {
    return value;
  }
  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid encrypted TOTP secret.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function totpProvisioningUri(email: string, secret: string) {
  const issuer = "Zucchero";
  const label = `${issuer}:${email.trim().toLowerCase()}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}
