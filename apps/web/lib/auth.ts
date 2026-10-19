import { createHash, randomBytes } from "node:crypto";

export const authCookieName = "bancada_identity";
export const authStateCookieName = "bancada_oauth_state";
export const authVerifierCookieName = "bancada_oauth_verifier";
export const authReturnCookieName = "bancada_auth_return";
export const authMfaSessionCookieName = "bancada_auth_mfa_session";
export const authMfaUsernameCookieName = "bancada_auth_mfa_username";

export function authRequired() {
  return process.env.AUTH_REQUIRED === "true";
}

export function cognitoConfiguration() {
  const domain = process.env.COGNITO_DOMAIN?.replace(/\/$/, "");
  const clientId = process.env.COGNITO_CLIENT_ID;
  return domain && clientId ? { domain, clientId } : null;
}

export function cognitoPasswordConfiguration() {
  const region = process.env.AWS_REGION;
  const clientId = process.env.COGNITO_CLIENT_ID;
  return region && clientId ? { region, clientId } : null;
}

export function publicOrigin(fallback: string) {
  return (process.env.WEB_PUBLIC_URL ?? fallback).replace(/\/$/, "");
}

export function secureAuthCookies() {
  const configuredOrigin = process.env.WEB_PUBLIC_URL;
  return configuredOrigin
    ? configuredOrigin.startsWith("https://")
    : process.env.NODE_ENV === "production";
}

export function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function randomUrlSafe(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
