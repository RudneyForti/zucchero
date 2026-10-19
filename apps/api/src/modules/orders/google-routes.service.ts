import { Injectable } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
  }>;
  error?: { message?: string };
};

type DeliveryQuotePayload = {
  tenantId: string;
  customerId: string;
  customerAddressId: string;
  addressFingerprint: string;
  distanceMeters: number;
  durationSeconds: number;
  costPerKmCents: number;
  deliveryCostCents: number;
  expiresAt: number;
};

export type CalculatedDeliveryQuote = {
  distanceKm: number;
  durationMinutes: number;
  costPerKm: number;
  deliveryCost: number;
  quoteToken: string;
  provider: "google_maps";
  attribution: "Google Maps";
  mapImageDataUrl?: string;
};

export class DeliveryRoutingError extends Error {
  constructor(
    readonly code: "not_configured" | "route_not_found" | "provider_error",
    message: string,
  ) {
    super(message);
    this.name = "DeliveryRoutingError";
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function secondsFromDuration(value?: string) {
  const parsed = Number(value?.replace(/s$/, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

@Injectable()
export class GoogleRoutesService {
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
  private readonly signingSecret =
    process.env.DELIVERY_QUOTE_SECRET?.trim() ||
    process.env.LOCAL_AUTH_SESSION_SECRET?.trim() ||
    this.apiKey;

  get isConfigured() {
    return Boolean(this.apiKey && this.signingSecret);
  }

  addressFingerprint(origin: string, destination: string) {
    return createHash("sha256")
      .update(`${origin.trim()}\n${destination.trim()}`)
      .digest("base64url");
  }

  async calculate(input: {
    tenantId: string;
    customerId: string;
    customerAddressId: string;
    origin: string;
    destination: string;
    costPerKm: number;
  }): Promise<CalculatedDeliveryQuote> {
    if (!this.isConfigured) {
      throw new DeliveryRoutingError(
        "not_configured",
        "A integração de rotas ainda não recebeu uma chave do Google Maps.",
      );
    }

    let response: Response;
    try {
      response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask":
              "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
          },
          body: JSON.stringify({
            origin: { address: input.origin },
            destination: { address: input.destination },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
            computeAlternativeRoutes: false,
            languageCode: "pt-BR",
            regionCode: "BR",
            units: "METRIC",
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch {
      throw new DeliveryRoutingError(
        "provider_error",
        "O Google Maps não respondeu. Tente calcular a entrega novamente.",
      );
    }

    const result = (await response
      .json()
      .catch(() => ({}))) as GoogleRoutesResponse;
    if (!response.ok) {
      throw new DeliveryRoutingError(
        "provider_error",
        result.error?.message
          ? "O Google Maps não conseguiu calcular esta rota. Revise os endereços."
          : "Não foi possível calcular a rota de entrega agora.",
      );
    }

    const route = result.routes?.[0];
    const distanceMeters = Math.round(route?.distanceMeters ?? 0);
    if (distanceMeters <= 0) {
      throw new DeliveryRoutingError(
        "route_not_found",
        "Não encontramos uma rota entre a confeitaria e este endereço.",
      );
    }

    const durationSeconds = Math.round(secondsFromDuration(route?.duration));
    const costPerKm = roundMoney(Math.max(0, input.costPerKm));
    const deliveryCost = roundMoney((distanceMeters / 1_000) * costPerKm);
    const mapImageDataUrl = route?.polyline?.encodedPolyline
      ? await this.renderStaticMap(route.polyline.encodedPolyline)
      : undefined;
    const payload: DeliveryQuotePayload = {
      tenantId: input.tenantId,
      customerId: input.customerId,
      customerAddressId: input.customerAddressId,
      addressFingerprint: this.addressFingerprint(
        input.origin,
        input.destination,
      ),
      distanceMeters,
      durationSeconds,
      costPerKmCents: Math.round(costPerKm * 100),
      deliveryCostCents: Math.round(deliveryCost * 100),
      expiresAt: Date.now() + 15 * 60_000,
    };

    return {
      distanceKm: Math.round((distanceMeters / 1_000) * 10) / 10,
      durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
      costPerKm,
      deliveryCost,
      quoteToken: this.sign(payload),
      provider: "google_maps",
      attribution: "Google Maps",
      mapImageDataUrl,
    };
  }

  verifyQuote(
    token: string,
    expected: {
      tenantId: string;
      customerId: string;
      customerAddressId: string;
      origin: string;
      destination: string;
      costPerKm: number;
    },
  ) {
    if (!this.signingSecret) return null;
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;
    const expectedSignature = this.signature(encodedPayload);
    const supplied = Buffer.from(signature, "base64url");
    const calculated = Buffer.from(expectedSignature, "base64url");
    if (
      supplied.length !== calculated.length ||
      !timingSafeEqual(supplied, calculated)
    ) {
      return null;
    }

    let payload: DeliveryQuotePayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as DeliveryQuotePayload;
    } catch {
      return null;
    }

    const expectedRate = Math.round(roundMoney(expected.costPerKm) * 100);
    const valid =
      payload.expiresAt >= Date.now() &&
      payload.tenantId === expected.tenantId &&
      payload.customerId === expected.customerId &&
      payload.customerAddressId === expected.customerAddressId &&
      payload.costPerKmCents === expectedRate &&
      payload.addressFingerprint ===
        this.addressFingerprint(expected.origin, expected.destination);

    return valid
      ? {
          deliveryCost: payload.deliveryCostCents / 100,
          distanceKm: Math.round((payload.distanceMeters / 1_000) * 10) / 10,
          durationMinutes: Math.max(
            1,
            Math.round(payload.durationSeconds / 60),
          ),
        }
      : null;
  }

  private sign(payload: DeliveryQuotePayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.signature(encoded)}`;
  }

  private signature(encodedPayload: string) {
    return createHmac("sha256", this.signingSecret)
      .update(encodedPayload)
      .digest("base64url");
  }

  private async renderStaticMap(encodedPolyline: string) {
    const parameters = new URLSearchParams({
      size: "640x280",
      scale: "2",
      format: "png",
      maptype: "roadmap",
      language: "pt-BR",
      region: "BR",
      key: this.apiKey,
    });
    parameters.append(
      "path",
      `color:0x71384aff|weight:5|enc:${encodedPolyline}`,
    );
    parameters.append("style", "feature:poi|visibility:off");
    parameters.append("style", "feature:transit|visibility:off");

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/staticmap?${parameters.toString()}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.startsWith("image/")) return undefined;

      const image = Buffer.from(await response.arrayBuffer());
      if (image.length === 0 || image.length > 2_000_000) return undefined;

      return `data:${contentType.split(";")[0]};base64,${image.toString("base64")}`;
    } catch {
      // O mapa ilustra a cotação, mas não deve impedir o cálculo da entrega.
      return undefined;
    }
  }
}
