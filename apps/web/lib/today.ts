export type ProductionStep = {
  id: string;
  label: string;
  state: "done" | "current" | "pending";
};

export type OtherOrder = {
  id: string;
  time: string;
  title: string;
  detail: string;
};

export type ConsumptionVariance = {
  plannedG: number;
  actualUsedG: number;
  lossG: number;
  actualTotalG: number;
  deltaG: number;
  deltaPercentage: number;
  lossPercentage: number;
  status: "on_target" | "above" | "below";
};

export type TodayView = {
  tenantName: string;
  ownerName: string;
  dateLabel: string;
  greeting: string;
  lead: string;
  activeOrderCount: number;
  currentTask: null | {
    id: string;
    status: "available" | "in_progress" | "waiting";
    orderNumber: string;
    finalProduct: string;
    attentionLabel: string;
    timeRange: string;
    title: string;
    instruction: string;
    preparation: {
      id: string;
      name: string;
      kind: "intermediate" | "final";
      dedicatedToOrder: boolean;
      parentName: string | null;
    };
    metadata: string[];
    equipment: null | {
      kind: "oven" | "mixer" | "refrigeration" | "stove" | "utensil" | "other";
      label: string;
      state: "ready" | "warning" | "missing" | "busy" | "maintenance";
      assetName: string | null;
      blocking: boolean;
      message: string;
    };
    ingredientScope: "task" | "order";
    consumptionRequired: boolean;
    consumptionConfirmed: boolean;
    consumptionVariance: ConsumptionVariance | null;
    ingredients: Array<{
      id: string;
      name: string;
      requiredG: number;
      reservedG: number;
      shortageG: number;
      status: "available" | "substitution" | "partial" | "unavailable";
      preferredItemName: string | null;
      consumption: null | {
        originalActualUsedG: number;
        originalLossG: number;
        actualUsedG: number;
        lossG: number;
        confirmedAt: string;
        correctionCount: number;
        lastCorrectedAt: string | null;
        variance: ConsumptionVariance;
      };
    }>;
    note: string | null;
    steps: ProductionStep[];
  };
  otherOrders: OtherOrder[];
  note: {
    title: string;
    body: string;
    foot: string;
  };
};

export const demoToday: TodayView = {
  tenantName: "Stefanie Dellavolpe Doces",
  ownerName: "Stefanie",
  dateLabel: "Segunda-feira · 24 de agosto",
  greeting: "Bom dia, Stefanie. A cozinha já tem seu ritmo.",
  lead: "Primeiro o que pede suas mãos. Depois, o que pode esperar sozinho.",
  activeOrderCount: 4,
  currentTask: {
    id: "demo-ganache",
    status: "in_progress",
    orderNumber: "#1040",
    finalProduct: "Bolo da Marina",
    attentionLabel: "Próxima atenção em 12 min",
    timeRange: "10h20 — 10h45",
    title: "Preparar a ganache",
    instruction:
      "O creme já está aquecendo. Quando as bordas começarem a borbulhar, verta sobre o chocolate e deixe repousar por dois minutos.",
    preparation: {
      id: "demo-preparation-ganache",
      name: "Ganache",
      kind: "intermediate",
      dedicatedToOrder: true,
      parentName: "Bolo da Marina",
    },
    metadata: [
      "Preparação intermediária",
      "1.200 g previstos",
      "Harald preferencial",
    ],
    equipment: null,
    ingredientScope: "task",
    consumptionRequired: true,
    consumptionConfirmed: true,
    consumptionVariance: {
      plannedG: 800,
      actualUsedG: 775,
      lossG: 15,
      actualTotalG: 790,
      deltaG: -10,
      deltaPercentage: -1.25,
      lossPercentage: 1.875,
      status: "on_target",
    },
    ingredients: [
      {
        id: "demo-chocolate",
        name: "Chocolate meio amargo",
        requiredG: 500,
        reservedG: 500,
        shortageG: 0,
        status: "available",
        preferredItemName: "Harald Melken meio amargo 1,01 kg",
        consumption: {
          originalActualUsedG: 490,
          originalLossG: 10,
          actualUsedG: 480,
          lossG: 10,
          confirmedAt: "2026-08-24T13:28:00.000Z",
          correctionCount: 1,
          lastCorrectedAt: "2026-08-24T13:31:00.000Z",
          variance: {
            plannedG: 500,
            actualUsedG: 480,
            lossG: 10,
            actualTotalG: 490,
            deltaG: -10,
            deltaPercentage: -2,
            lossPercentage: 2,
            status: "on_target",
          },
        },
      },
      {
        id: "demo-chantilly",
        name: "Chantilly",
        requiredG: 300,
        reservedG: 300,
        shortageG: 0,
        status: "available",
        preferredItemName: "Chantilly Amélia 1 L",
        consumption: {
          originalActualUsedG: 295,
          originalLossG: 5,
          actualUsedG: 295,
          lossG: 5,
          confirmedAt: "2026-08-24T13:28:00.000Z",
          correctionCount: 0,
          lastCorrectedAt: null,
          variance: {
            plannedG: 300,
            actualUsedG: 295,
            lossG: 5,
            actualTotalG: 300,
            deltaG: 0,
            deltaPercentage: 0,
            lossPercentage: 1.667,
            status: "on_target",
          },
        },
      },
    ],
    note: null,
    steps: [
      { id: "massa", label: "Massa", state: "done" },
      { id: "ganache", label: "Ganache", state: "current" },
      { id: "desenforme", label: "Desenforme", state: "pending" },
      { id: "montagem", label: "Montagem", state: "pending" },
      { id: "pronto", label: "Pronto", state: "pending" },
    ],
  },
  otherOrders: [
    {
      id: "1038",
      time: "11h40",
      title: "#1038 · Cupcakes da Helena",
      detail: "Cobertura e embalagem · retirada hoje às 14h",
    },
    {
      id: "1041",
      time: "15h20",
      title: "#1041 · Torta de limão do Carlos",
      detail: "Montagem · entrega amanhã às 11h30",
    },
    {
      id: "1039",
      time: "17h10",
      title: "#1039 · 100 brigadeiros da Camila",
      detail: "Embalagem · retirada hoje às 18h",
    },
  ],
  note: {
    title: "Antes de acender o forno",
    body: "O morango do pedido da Ana ainda não está na despensa. Ao confirmar a encomenda, ele entra automaticamente na lista de compras.",
    foot: "A lista evita compras repetidas e respeita as entregas.",
  },
};

export async function getToday(
  requestHeaders?: HeadersInit,
): Promise<TodayView> {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001/v1";
  const headers = requestHeaders ?? {
    "x-demo-tenant-id":
      process.env.DEMO_TENANT_ID ?? "11111111-1111-4111-8111-111111111111",
  };

  try {
    const response = await fetch(`${apiUrl}/today`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(1_500),
    });

    if (!response.ok) return demoToday;
    return (await response.json()) as TodayView;
  } catch {
    return demoToday;
  }
}
