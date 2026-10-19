"use client";

import { useEffect, useState } from "react";
import { postalCodeDigits, type PostalCodeAddress } from "@/lib/postal-code";

type LookupStatus = "idle" | "loading" | "success" | "error";

export function usePostalCodeLookup(
  postalCode: string,
  onResolved: (address: PostalCodeAddress) => void,
) {
  const [result, setResult] = useState<{
    digits: string;
    status: LookupStatus;
    message: string;
  }>({ digits: "", status: "idle", message: "" });
  const digits = postalCodeDigits(postalCode);

  useEffect(() => {
    if (digits.length !== 8) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResult({
        digits,
        status: "loading",
        message: "Buscando o endereço…",
      });
      try {
        const response = await fetch(
          `/address/postal-code?cep=${encodeURIComponent(digits)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as
          (PostalCodeAddress & { message?: never }) | { message?: string };
        if (!response.ok || !("city" in result)) {
          setResult({
            digits,
            status: "error",
            message:
              result.message ??
              "Não encontramos esse CEP. Você ainda pode preencher o endereço à mão.",
          });
          return;
        }
        onResolved(result);
        setResult({
          digits,
          status: "success",
          message: "Endereço encontrado. Complete o número e o complemento.",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setResult({
          digits,
          status: "error",
          message:
            "A busca de CEP está indisponível agora. Preencha o endereço à mão.",
        });
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [digits, onResolved]);

  return digits.length === 8 && result.digits === digits
    ? { status: result.status, message: result.message }
    : { status: "idle" as const, message: "" };
}
