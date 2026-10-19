import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { orders, shoppingNeeds } from "../../database/schema";
import { ProductionService } from "../production/production.service";

const activeStatuses = new Set(["confirmed", "in_production", "ready"]);

function baseView(tenantId: string) {
  return {
    tenantId,
    tenantName: "Stefanie Dellavolpe Doces",
    ownerName: "Stefanie",
    dateLabel: "Segunda-feira · 24 de agosto",
    greeting: "Bom dia, Stefanie. A cozinha já tem seu ritmo.",
    lead: "Primeiro o que pede suas mãos. Depois, o que pode esperar sozinho.",
    activeOrderCount: 4,
    currentTask: {
      id: "demo-ganache",
      status: "in_progress" as const,
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
        kind: "intermediate" as const,
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
        status: "on_target" as const,
      },
      ingredients: [
        {
          id: "demo-chocolate",
          name: "Chocolate meio amargo",
          requiredG: 500,
          reservedG: 500,
          shortageG: 0,
          status: "available" as const,
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
              status: "on_target" as const,
            },
          },
        },
        {
          id: "demo-chantilly",
          name: "Chantilly",
          requiredG: 300,
          reservedG: 300,
          shortageG: 0,
          status: "available" as const,
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
              status: "on_target" as const,
            },
          },
        },
      ],
      note: null,
      steps: [
        { id: "massa", label: "Massa", state: "done" as const },
        { id: "ganache", label: "Ganache", state: "current" as const },
        { id: "desenforme", label: "Desenforme", state: "pending" as const },
        { id: "montagem", label: "Montagem", state: "pending" as const },
        { id: "pronto", label: "Pronto", state: "pending" as const },
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
}

@Injectable()
export class TodayService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProductionService)
    private readonly productionService: ProductionService,
  ) {}

  async getForTenant(tenantId: string) {
    const base = baseView(tenantId);
    if (!this.database.isConfigured) return base;

    return this.database.withTenant(tenantId, async (transaction) => {
      const [storedOrders, needs, board] = await Promise.all([
        transaction.select().from(orders),
        transaction.select().from(shoppingNeeds),
        this.productionService.loadBoard(transaction),
      ]);
      const activeOrders = storedOrders.filter((order) =>
        activeStatuses.has(order.status),
      );
      const firstNeed = needs.find(
        (need) =>
          need.status === "open" &&
          activeOrders.some((order) => order.id === need.orderId),
      );

      return {
        ...base,
        activeOrderCount: board.activeOrderCount,
        currentTask: board.currentTask,
        otherOrders: board.otherOrders,
        note: firstNeed
          ? {
              title: "Antes de acender o forno",
              body: `${firstNeed.itemNameSnapshot} ainda precisa entrar na despensa para um dos próximos pedidos. A compra já está separada na lista.`,
              foot: "A lista evita compras repetidas e respeita as entregas.",
            }
          : {
              title: "Despensa em ordem",
              body: "Os pedidos ativos não têm compras pendentes neste momento.",
              foot: "Ao surgir uma falta, ela aparece aqui sem interromper seu ritmo.",
            },
      };
    });
  }
}
