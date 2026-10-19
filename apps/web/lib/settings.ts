export type BusinessDay = {
  day:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  enabled: boolean;
  start: string;
  end: string;
};

export type SettingsWorkspace = {
  tenantName: string;
  ownerName: string;
  account: {
    userId: string | null;
    email: string | null;
    role: "owner" | "employee";
    operationalAccess: boolean;
    financialAccess: boolean;
    canManageTeam: boolean;
    avatarDataUrl: string | null;
    mfaAvailable: boolean;
    mfaEnabled: boolean;
  };
  timezone: string;
  company: {
    name: string;
    phone: string | null;
    email: string | null;
    taxDocument: string | null;
    addressLine: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    isCommercialPoint: boolean;
    logoDataUrl: string | null;
  };
  sales: {
    defaultMarginPercentage: number;
    defaultDepositPercentage: number;
    defaultPaymentMethod: "pix" | "card" | "cash";
    defaultDeliveryMode: "delivery" | "pickup";
    deliveryCostPerKm: number;
  };
  integrations: {
    googleMapsRoutesEnabled: boolean;
  };
  businessHours: BusinessDay[];
  people: {
    members: Array<{
      userId: string;
      displayName: string;
      email: string;
      role: "owner" | "employee";
      operationalAccess: boolean;
      financialAccess: boolean;
      current: boolean;
      joinedAt: string;
    }>;
    invitations: Array<{
      id: string;
      email: string;
      operationalAccess: boolean;
      financialAccess: boolean;
      expiresAt: string;
      createdAt: string;
    }>;
  };
  accountNotifications: Array<{
    id: string;
    kind: string;
    message: string;
    createdAt: string;
  }>;
  updatedAt: string;
};

function fallback(): SettingsWorkspace {
  return {
    tenantName: "Stefanie Dellavolpe Doces",
    ownerName: "Stefanie",
    account: {
      userId: null,
      email: null,
      role: "owner",
      operationalAccess: true,
      financialAccess: true,
      canManageTeam: true,
      avatarDataUrl: null,
      mfaAvailable: false,
      mfaEnabled: false,
    },
    timezone: "America/Sao_Paulo",
    company: {
      name: "Stefanie Dellavolpe Doces",
      phone: null,
      email: null,
      taxDocument: null,
      addressLine: null,
      addressNumber: null,
      addressComplement: null,
      neighborhood: null,
      city: null,
      state: null,
      postalCode: null,
      isCommercialPoint: false,
      logoDataUrl: null,
    },
    sales: {
      defaultMarginPercentage: 35,
      defaultDepositPercentage: 50,
      defaultPaymentMethod: "pix",
      defaultDeliveryMode: "delivery",
      deliveryCostPerKm: 0,
    },
    integrations: { googleMapsRoutesEnabled: false },
    businessHours: [
      { day: "monday", enabled: true, start: "08:00", end: "18:00" },
      { day: "tuesday", enabled: true, start: "08:00", end: "18:00" },
      { day: "wednesday", enabled: true, start: "08:00", end: "18:00" },
      { day: "thursday", enabled: true, start: "08:00", end: "18:00" },
      { day: "friday", enabled: true, start: "08:00", end: "18:00" },
      { day: "saturday", enabled: true, start: "08:00", end: "14:00" },
      { day: "sunday", enabled: false, start: "08:00", end: "14:00" },
    ],
    people: { members: [], invitations: [] },
    accountNotifications: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getSettings(
  requestHeaders?: HeadersInit,
): Promise<SettingsWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };
  try {
    const response = await fetch(`${apiUrl}/settings`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return fallback();
    return (await response.json()) as SettingsWorkspace;
  } catch {
    return fallback();
  }
}
