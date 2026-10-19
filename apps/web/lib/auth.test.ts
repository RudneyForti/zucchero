import { describe, expect, it } from "vitest";
import { pkceChallenge, safeReturnTo } from "./auth";

describe("auth helpers", () => {
  it("aceita somente retornos internos", () => {
    expect(safeReturnTo("/pedidos?filtro=hoje")).toBe("/pedidos?filtro=hoje");
    expect(safeReturnTo("//host-malicioso.example")).toBe("/");
    expect(safeReturnTo("https://host-malicioso.example")).toBe("/");
  });

  it("gera o desafio PKCE S256 conhecido", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
