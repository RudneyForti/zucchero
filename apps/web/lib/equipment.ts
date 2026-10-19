export type EquipmentKind =
  "oven" | "mixer" | "refrigeration" | "stove" | "utensil" | "other";
export type EquipmentStatus = "active" | "maintenance" | "retired";

export type EquipmentAsset = {
  id: string;
  name: string;
  kind: EquipmentKind;
  brand: string | null;
  model: string | null;
  purchaseDate: string | null;
  purchaseValue: number;
  capacityUnits: number;
  status: EquipmentStatus;
  notes: string | null;
  maintenanceSpend: number;
  nextMaintenanceDate: string | null;
  usageCount: number;
  supportedOrderCount: number;
  supportedRevenue: number;
  maintenance: Array<{
    id: string;
    performedAt: string;
    description: string;
    cost: number;
    provider: string | null;
    nextDueDate: string | null;
  }>;
  usages: Array<{
    id: string;
    usedAt: string;
    durationMinutes: number | null;
    orderId: string | null;
    orderLabel: string | null;
    notes: string | null;
    source: "manual" | "production";
    productionTaskId: string | null;
  }>;
  unavailability: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string;
  }>;
};

export type EquipmentWorkspace = {
  tenantName: string;
  ownerName: string;
  summary: {
    activeCount: number;
    attentionCount: number;
    acquisitionValue: number;
    maintenanceSpend: number;
    supportedRevenue: number;
  };
  equipment: EquipmentAsset[];
  ordersForUsage: Array<{ id: string; label: string }>;
};

const fallback: EquipmentWorkspace = {
  tenantName: "Stefanie Dellavolpe Doces",
  ownerName: "Stefanie",
  summary: {
    activeCount: 0,
    attentionCount: 0,
    acquisitionValue: 0,
    maintenanceSpend: 0,
    supportedRevenue: 0,
  },
  equipment: [],
  ordersForUsage: [],
};

export async function getEquipment(
  requestHeaders?: HeadersInit,
): Promise<EquipmentWorkspace> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };
  try {
    const response = await fetch(`${apiUrl}/equipment`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return fallback;
    return (await response.json()) as EquipmentWorkspace;
  } catch {
    return fallback;
  }
}
