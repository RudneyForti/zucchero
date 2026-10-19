import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

describe("postal code route", () => {
  it("recusa uma consulta antes dos oito números", async () => {
    const externalFetch = vi.fn();
    vi.stubGlobal("fetch", externalFetch);
    const response = await GET(
      new Request("http://localhost/address/postal-code?cep=11075"),
    );
    expect(response.status).toBe(400);
    expect(externalFetch).not.toHaveBeenCalled();
  });

  it("traduz a resposta do ViaCEP para o contrato do Zucchero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          cep: "11075-440",
          logradouro: "Rua Doutor Carvalho de Mendonça",
          complemento: "",
          bairro: "Marapé",
          localidade: "Santos",
          uf: "SP",
        }),
      ),
    );
    const response = await GET(
      new Request("http://localhost/address/postal-code?cep=11075-440"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      street: "Rua Doutor Carvalho de Mendonça",
      neighborhood: "Marapé",
      city: "Santos",
      state: "SP",
    });
  });

  it("explica quando o CEP não existe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ erro: true })),
    );
    const response = await GET(
      new Request("http://localhost/address/postal-code?cep=99999999"),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining("não foi encontrado"),
    });
  });
});
