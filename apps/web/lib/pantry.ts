export type DuplicateCandidate = {
  id: string;
  displayName: string;
  groupName: string;
  packageLabel: string;
  reason: string;
  confidence: number;
};

export type PantryItemView = {
  id: string;
  displayName: string;
  brandName: string | null;
  packageLabel: string;
  availableBase: number;
  availableLabel: string;
  lotCount: number;
  lastUnitCost: number;
  nextExpiry: string | null;
  nextExpiryLabel: string | null;
  status: "ok" | "attention" | "low";
  lots: Array<{
    id: string;
    lotCode: string | null;
    entryDate: string;
    expiryDate: string | null;
    availableBase: number;
    availableLabel: string;
    physicalBase: number;
    physicalLabel: string;
    reservedBase: number;
    reservedLabel: string;
    unitCost: number;
    inventoryValue: number;
  }>;
};

export type PantryGroupView = {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  baseUnit: string;
  minimumStock: number;
  availableBase: number;
  availableLabel: string;
  status: "ok" | "attention" | "low";
  items: PantryItemView[];
};

export type PantryView = {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  categories: Array<{
    id: string;
    name: string;
    kind: "ingredient" | "packaging" | "operational";
    groupCount: number;
  }>;
  summary: {
    groupCount: number;
    itemCount: number;
    openLotCount: number;
    inventoryValue: number;
  };
  attention: Array<{
    id: string;
    tone: "expiry" | "low";
    title: string;
    detail: string;
  }>;
  shoppingList: Array<{
    commercialItemId: string;
    displayName: string;
    packageLabel: string;
    neededBase: number;
    availableBase: number;
    remainingBase: number;
    remainingLabel: string;
    packagesToBuy: number;
    orderCount: number;
    neededBy: string;
  }>;
  groups: PantryGroupView[];
};

export const demoPantry: PantryView = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  tenantName: "Stefanie Dellavolpe Doces",
  ownerName: "Stefanie",
  categories: [
    {
      id: "21111111-1111-4111-8111-111111111111",
      name: "Chocolates e cacaus",
      kind: "ingredient",
      groupCount: 1,
    },
    {
      id: "22222222-2222-4222-8222-222222222223",
      name: "Cremes e laticínios",
      kind: "ingredient",
      groupCount: 1,
    },
    {
      id: "23333333-3333-4333-8333-333333333333",
      name: "Frutas",
      kind: "ingredient",
      groupCount: 1,
    },
  ],
  summary: {
    groupCount: 3,
    itemCount: 4,
    openLotCount: 3,
    inventoryValue: 119.6,
  },
  attention: [
    {
      id: "expiry-amelia",
      tone: "expiry",
      title: "Chantilly Amélia vence em 10 dias",
      detail: "1.000 g · validade 03 set",
    },
    {
      id: "low-morango",
      tone: "low",
      title: "Morango está abaixo do mínimo",
      detail: "0 g disponíveis · mínimo 600 g",
    },
  ],
  shoppingList: [
    {
      commercialItemId: "54444444-4444-4444-8444-444444444444",
      displayName: "Morango fresco bandeja 250 g",
      packageLabel: "250 g",
      neededBase: 600,
      availableBase: 0,
      remainingBase: 600,
      remainingLabel: "600 g",
      packagesToBuy: 3,
      orderCount: 1,
      neededBy: "2026-08-28T20:30:00.000Z",
    },
  ],
  groups: [
    {
      id: "32222222-2222-4222-8222-222222222222",
      name: "Chantilly",
      categoryId: "22222222-2222-4222-8222-222222222223",
      category: "Cremes e laticínios",
      baseUnit: "g",
      minimumStock: 1_000,
      availableBase: 1_000,
      availableLabel: "1.000 g",
      status: "ok",
      items: [
        {
          id: "53333333-3333-4333-8333-333333333333",
          displayName: "Chantilly Amélia 1 L",
          brandName: "Amélia",
          packageLabel: "1 L",
          availableBase: 1_000,
          availableLabel: "1.000 g",
          lotCount: 1,
          lastUnitCost: 0.0199,
          nextExpiry: "2026-09-03",
          nextExpiryLabel: "03 set",
          status: "attention",
          lots: [
            {
              id: "63333333-3333-4333-8333-333333333333",
              lotCode: "AME-228",
              entryDate: "2026-08-22",
              expiryDate: "2026-09-03",
              availableBase: 1_000,
              availableLabel: "1.000 g",
              physicalBase: 1_000,
              physicalLabel: "1.000 g",
              reservedBase: 0,
              reservedLabel: "0 g",
              unitCost: 19.9 / 1_000,
              inventoryValue: 19.9,
            },
          ],
        },
      ],
    },
    {
      id: "31111111-1111-4111-8111-111111111111",
      name: "Chocolate meio amargo",
      categoryId: "21111111-1111-4111-8111-111111111111",
      category: "Chocolates e cacaus",
      baseUnit: "g",
      minimumStock: 1_500,
      availableBase: 3_030,
      availableLabel: "3.030 g",
      status: "ok",
      items: [
        {
          id: "51111111-1111-4111-8111-111111111111",
          displayName: "Harald Melken meio amargo 1,01 kg",
          brandName: "Harald",
          packageLabel: "1,01 kg",
          availableBase: 2_020,
          availableLabel: "2.020 g",
          lotCount: 1,
          lastUnitCost: 67.8 / 2_020,
          nextExpiry: "2027-02-20",
          nextExpiryLabel: "20 fev",
          status: "ok",
          lots: [
            {
              id: "61111111-1111-4111-8111-111111111111",
              lotCode: "HML-0826",
              entryDate: "2026-08-18",
              expiryDate: "2027-02-20",
              availableBase: 2_020,
              availableLabel: "2.020 g",
              physicalBase: 2_020,
              physicalLabel: "2.020 g",
              reservedBase: 0,
              reservedLabel: "0 g",
              unitCost: 67.8 / 2_020,
              inventoryValue: 67.8,
            },
          ],
        },
        {
          id: "52222222-2222-4222-8222-222222222222",
          displayName: "Sicao Nobre meio amargo 1,01 kg",
          brandName: "Sicao",
          packageLabel: "1,01 kg",
          availableBase: 1_010,
          availableLabel: "1.010 g",
          lotCount: 1,
          lastUnitCost: 31.9 / 1_010,
          nextExpiry: "2026-12-15",
          nextExpiryLabel: "15 dez",
          status: "ok",
          lots: [
            {
              id: "62222222-2222-4222-8222-222222222222",
              lotCode: "SIC-401",
              entryDate: "2026-08-10",
              expiryDate: "2026-12-15",
              availableBase: 1_010,
              availableLabel: "1.010 g",
              physicalBase: 1_010,
              physicalLabel: "1.010 g",
              reservedBase: 0,
              reservedLabel: "0 g",
              unitCost: 31.9 / 1_010,
              inventoryValue: 31.9,
            },
          ],
        },
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Morango",
      categoryId: "23333333-3333-4333-8333-333333333333",
      category: "Frutas",
      baseUnit: "g",
      minimumStock: 600,
      availableBase: 0,
      availableLabel: "0 g",
      status: "low",
      items: [
        {
          id: "54444444-4444-4444-8444-444444444444",
          displayName: "Morango fresco bandeja 250 g",
          brandName: null,
          packageLabel: "250 g",
          availableBase: 0,
          availableLabel: "0 g",
          lotCount: 0,
          lastUnitCost: 0,
          nextExpiry: null,
          nextExpiryLabel: null,
          status: "low",
          lots: [],
        },
      ],
    },
  ],
};

export async function getPantry(
  requestHeaders?: HeadersInit,
): Promise<PantryView> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };

  try {
    const response = await fetch(`${apiUrl}/pantry`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return demoPantry;
    return (await response.json()) as PantryView;
  } catch {
    return demoPantry;
  }
}
