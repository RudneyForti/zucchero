export type CustomerAddress = {
  id: string;
  label: string;
  recipient: string;
  formattedAddress: string;
  postalCode: string | null;
  street: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  deliveryInstructions: string | null;
  isDefault: boolean;
};

export type CustomerAddressParts = Pick<
  CustomerAddress,
  | "postalCode"
  | "street"
  | "addressNumber"
  | "addressComplement"
  | "neighborhood"
  | "city"
  | "state"
>;

export function formatCustomerAddress(address: CustomerAddressParts) {
  const street = [address.street?.trim(), address.addressNumber?.trim()]
    .filter(Boolean)
    .join(", ");
  const city = [address.city?.trim(), address.state?.trim().toUpperCase()]
    .filter(Boolean)
    .join(" - ");
  const postalCode = address.postalCode?.trim();

  return [
    street,
    address.addressComplement?.trim(),
    address.neighborhood?.trim(),
    city,
    postalCode ? `CEP ${postalCode}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export type CustomerProfile = {
  id: string;
  name: string;
  primaryPhone: string;
  email: string | null;
  notes: string | null;
  preferredDeliveryMode: "delivery" | "pickup" | null;
  preferredPaymentMethod: "pix" | "card" | "cash" | null;
  addresses: CustomerAddress[];
  orderCount: number;
  lastOrderAt: string | null;
};

export type CustomerWorkspace = {
  summary: {
    customerCount: number;
    deliveryReadyCount: number;
    returningCount: number;
  };
  customers: CustomerProfile[];
};

export type CustomerPrivacyExport = {
  generatedAt: string;
  customer: CustomerProfile;
  orders: Array<{
    number: number;
    status: string;
    confirmedAt: string;
    deliveryAt: string;
    deliveryMode: string;
    address: unknown;
    items: Array<{
      recipeName: string;
      recipeVersionNumber: number;
      requestedMassG: number;
      price: number;
    }>;
    receipts: Array<{
      kind: string;
      amount: number;
      feeAmount: number;
      paymentMethod: string;
      receivedAt: string;
    }>;
  }>;
};

const fallbackCustomers: CustomerProfile[] = [
  {
    id: "91111111-1111-4111-8111-111111111111",
    name: "Ana Paula",
    primaryPhone: "(11) 98888-1234",
    email: "ana@example.invalid",
    notes: "Prefere confirmações objetivas pelo WhatsApp.",
    preferredDeliveryMode: "delivery",
    preferredPaymentMethod: "pix",
    addresses: [
      {
        id: "94111111-1111-4111-8111-111111111111",
        label: "Casa",
        recipient: "Ana Paula",
        formattedAddress: "Rua das Acácias, 128 · Centro",
        postalCode: null,
        street: "Rua das Acácias",
        addressNumber: "128",
        addressComplement: null,
        neighborhood: "Centro",
        city: null,
        state: null,
        deliveryInstructions:
          "Interfone 12; deixar na portaria somente com autorização.",
        isDefault: true,
      },
    ],
    orderCount: 0,
    lastOrderAt: null,
  },
  {
    id: "92222222-2222-4222-8222-222222222222",
    name: "Marina Lopes",
    primaryPhone: "(11) 97777-4455",
    email: null,
    notes: null,
    preferredDeliveryMode: "pickup",
    preferredPaymentMethod: "pix",
    addresses: [],
    orderCount: 0,
    lastOrderAt: null,
  },
  {
    id: "93333333-3333-4333-8333-333333333333",
    name: "Beatriz Nunes",
    primaryPhone: "(11) 96666-7788",
    email: "beatriz@example.invalid",
    notes: "Entregas em horário comercial.",
    preferredDeliveryMode: "delivery",
    preferredPaymentMethod: "card",
    addresses: [
      {
        id: "94333333-3333-4333-8333-333333333333",
        label: "Trabalho",
        recipient: "Beatriz Nunes",
        formattedAddress: "Av. das Flores, 440 · Jardim América",
        postalCode: null,
        street: "Av. das Flores",
        addressNumber: "440",
        addressComplement: null,
        neighborhood: "Jardim América",
        city: null,
        state: null,
        deliveryInstructions: "Recepção no térreo.",
        isDefault: true,
      },
    ],
    orderCount: 0,
    lastOrderAt: null,
  },
];

export const fallbackCustomerWorkspace: CustomerWorkspace = {
  summary: {
    customerCount: fallbackCustomers.length,
    deliveryReadyCount: fallbackCustomers.filter(
      (customer) => customer.addresses.length > 0,
    ).length,
    returningCount: 0,
  },
  customers: fallbackCustomers,
};

export async function getCustomers(
  requestHeaders?: HeadersInit,
): Promise<CustomerWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };
  const request = (baseUrl: string) =>
    fetch(`${baseUrl}/customers`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(1_500),
    });

  try {
    let response = await request(apiUrl);
    if (
      response.status === 404 &&
      process.env.NODE_ENV !== "production" &&
      apiUrl === "http://localhost:3111/v1"
    ) {
      response = await request("http://localhost:3112/v1");
    }
    if (!response.ok) return fallbackCustomerWorkspace;
    return (await response.json()) as CustomerWorkspace;
  } catch {
    return fallbackCustomerWorkspace;
  }
}
