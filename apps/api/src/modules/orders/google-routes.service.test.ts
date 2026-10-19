import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleRoutesService } from "./google-routes.service";

const routeInput = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  customerId: "22222222-2222-4222-8222-222222222222",
  customerAddressId: "33333333-3333-4333-8333-333333333333",
  origin: "Rua da Confeitaria, 10, Santos, SP, Brasil",
  destination: "Rua da Cliente, 40, Santos, SP, Brasil",
  costPerKm: 3.5,
};

describe("GoogleRoutesService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calcula a rota, aplica a tarifa e assina uma cotação verificável", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "server-key");
    vi.stubEnv(
      "DELIVERY_QUOTE_SECRET",
      "delivery-secret-with-more-than-32-characters",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 12_340,
                duration: "1500s",
                polyline: { encodedPolyline: "encoded-route" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([137, 80, 78, 71]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = new GoogleRoutesService();
    const quote = await service.calculate(routeInput);

    expect(quote).toMatchObject({
      distanceKm: 12.3,
      durationMinutes: 25,
      costPerKm: 3.5,
      deliveryCost: 43.19,
      provider: "google_maps",
      attribution: "Google Maps",
      mapImageDataUrl: "data:image/png;base64,iVBORw==",
    });
    expect(service.verifyQuote(quote.quoteToken, routeInput)).toEqual({
      deliveryCost: 43.19,
      distanceKm: 12.3,
      durationMinutes: 25,
    });
    const staticMapCall = fetchMock.mock.calls[1];
    expect(staticMapCall?.[0]).toContain(
      "maps.googleapis.com/maps/api/staticmap",
    );
    expect(staticMapCall?.[0]).toContain("encoded-route");
  });

  it("rejeita a cotação se endereço ou tarifa mudarem", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "server-key");
    vi.stubEnv(
      "DELIVERY_QUOTE_SECRET",
      "delivery-secret-with-more-than-32-characters",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            routes: [{ distanceMeters: 5_000, duration: "600s" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const service = new GoogleRoutesService();
    const quote = await service.calculate(routeInput);

    expect(
      service.verifyQuote(quote.quoteToken, {
        ...routeInput,
        destination: "Outro endereço, 99, Santos, SP, Brasil",
      }),
    ).toBeNull();
    expect(
      service.verifyQuote(quote.quoteToken, { ...routeInput, costPerKm: 4 }),
    ).toBeNull();
  });
});
