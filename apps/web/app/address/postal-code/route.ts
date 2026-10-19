import { postalCodeDigits } from "@/lib/postal-code";

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function GET(request: Request) {
  const rawPostalCode = new URL(request.url).searchParams.get("cep") ?? "";
  const postalCode = postalCodeDigits(rawPostalCode);
  if (postalCode.length !== 8) {
    return Response.json(
      { message: "Digite um CEP com oito números." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `https://viacep.com.br/ws/${postalCode}/json/`,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 60 * 60 * 24 * 30 },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error(`ViaCEP respondeu ${response.status}`);
    const address = (await response.json()) as ViaCepResponse;
    if (address.erro || !address.localidade || !address.uf) {
      return Response.json(
        {
          message:
            "Esse CEP não foi encontrado. Confira os números ou preencha à mão.",
        },
        { status: 404 },
      );
    }
    return Response.json({
      postalCode: address.cep ?? postalCode,
      street: address.logradouro ?? "",
      neighborhood: address.bairro ?? "",
      complement: address.complemento ?? "",
      city: address.localidade,
      state: address.uf.toUpperCase(),
    });
  } catch {
    return Response.json(
      {
        message:
          "Não conseguimos consultar o CEP agora. Você pode preencher o endereço à mão.",
      },
      { status: 502 },
    );
  }
}
