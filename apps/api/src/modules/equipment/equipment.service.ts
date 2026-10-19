import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  equipmentAssets,
  equipmentMaintenanceEvents,
  equipmentUnavailability,
  equipmentUsages,
  orderItems,
  orders,
} from "../../database/schema";
import type {
  CreateEquipmentInput,
  EquipmentMutationResult,
  EquipmentStatus,
  EquipmentWorkspace,
  RegisterEquipmentUnavailabilityInput,
  RegisterEquipmentUsageInput,
  RegisterMaintenanceInput,
} from "./equipment.contract";

const demoTenantId = "11111111-1111-4111-8111-111111111111";

function normalizedName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function exactDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new ConflictException("Informe uma data válida.");
  return date;
}

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}
function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class EquipmentService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getForTenant(tenantId: string): Promise<EquipmentWorkspace> {
    if (!this.database.isConfigured) return this.emptyWorkspace(tenantId);
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadWorkspace(transaction, tenantId),
    );
  }

  async create(
    tenantId: string,
    input: CreateEquipmentInput,
  ): Promise<EquipmentMutationResult> {
    this.assertConfigured();
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [idempotent] = await transaction
          .select({ id: equipmentAssets.id })
          .from(equipmentAssets)
          .where(eq(equipmentAssets.idempotencyKey, input.idempotencyKey));
        if (idempotent) return true;
        const normalized = normalizedName(input.name);
        const [duplicate] = await transaction
          .select({ id: equipmentAssets.id })
          .from(equipmentAssets)
          .where(eq(equipmentAssets.normalizedName, normalized));
        if (duplicate)
          throw new ConflictException(
            "Já existe um equipamento com esse nome.",
          );
        await transaction.insert(equipmentAssets).values({
          tenantId,
          idempotencyKey: input.idempotencyKey,
          name: input.name,
          normalizedName: normalized,
          kind: input.kind,
          brand: input.brand,
          model: input.model,
          purchaseDate: input.purchaseDate
            ? exactDate(input.purchaseDate)
            : null,
          purchaseValue: money(input.purchaseValue),
          capacityUnits: input.capacityUnits,
          notes: input.notes,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EQUIPMENT_CREATED",
          correlationId: input.idempotencyKey,
          payload: {
            name: input.name,
            kind: input.kind,
            purchaseValue: input.purchaseValue,
          },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Este equipamento já estava cadastrado."
        : `${input.name} entrou na cozinha.`,
      workspace: await this.getForTenant(tenantId),
      repeated,
    };
  }

  async registerMaintenance(
    tenantId: string,
    equipmentId: string,
    input: RegisterMaintenanceInput,
  ): Promise<EquipmentMutationResult> {
    this.assertConfigured();
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [idempotent] = await transaction
          .select({ id: equipmentMaintenanceEvents.id })
          .from(equipmentMaintenanceEvents)
          .where(
            eq(equipmentMaintenanceEvents.idempotencyKey, input.idempotencyKey),
          );
        if (idempotent) return true;
        const asset = await this.findAsset(transaction, equipmentId);
        const performedAt = exactDate(input.performedAt);
        const nextDueDate = input.nextDueDate
          ? exactDate(input.nextDueDate)
          : null;
        if (nextDueDate && nextDueDate <= performedAt)
          throw new ConflictException(
            "A próxima revisão precisa acontecer depois desta manutenção.",
          );
        await transaction.insert(equipmentMaintenanceEvents).values({
          tenantId,
          equipmentId,
          idempotencyKey: input.idempotencyKey,
          performedAt,
          description: input.description,
          cost: money(input.cost),
          provider: input.provider,
          nextDueDate,
          notes: input.notes,
        });
        await transaction
          .update(equipmentAssets)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(equipmentAssets.id, equipmentId));
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EQUIPMENT_MAINTENANCE_REGISTERED",
          correlationId: input.idempotencyKey,
          payload: {
            equipmentId,
            equipmentName: asset.name,
            cost: input.cost,
            nextDueDate: input.nextDueDate,
          },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Esta manutenção já estava no histórico."
        : "Manutenção registrada; equipamento disponível.",
      workspace: await this.getForTenant(tenantId),
      repeated,
    };
  }

  async registerUsage(
    tenantId: string,
    equipmentId: string,
    input: RegisterEquipmentUsageInput,
  ): Promise<EquipmentMutationResult> {
    this.assertConfigured();
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [idempotent] = await transaction
          .select({ id: equipmentUsages.id })
          .from(equipmentUsages)
          .where(eq(equipmentUsages.idempotencyKey, input.idempotencyKey));
        if (idempotent) return true;
        const asset = await this.findAsset(transaction, equipmentId);
        if (asset.status === "retired")
          throw new ConflictException(
            "Um equipamento retirado não pode receber novos usos.",
          );
        if (input.orderId) {
          const [order] = await transaction
            .select({ id: orders.id, status: orders.status })
            .from(orders)
            .where(eq(orders.id, input.orderId));
          if (!order || order.status === "cancelled")
            throw new NotFoundException("Pedido não encontrado ou cancelado.");
        }
        await transaction.insert(equipmentUsages).values({
          tenantId,
          equipmentId,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
          usedAt: exactDate(input.usedAt),
          durationMinutes: input.durationMinutes,
          notes: input.notes,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EQUIPMENT_USAGE_REGISTERED",
          correlationId: input.idempotencyKey,
          payload: {
            equipmentId,
            equipmentName: asset.name,
            orderId: input.orderId,
            durationMinutes: input.durationMinutes,
          },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Este uso já estava registrado."
        : "Uso registrado no histórico do equipamento.",
      workspace: await this.getForTenant(tenantId),
      repeated,
    };
  }

  async registerUnavailability(
    tenantId: string,
    equipmentId: string,
    input: RegisterEquipmentUnavailabilityInput,
  ): Promise<EquipmentMutationResult> {
    this.assertConfigured();
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [idempotent] = await transaction
          .select({ id: equipmentUnavailability.id })
          .from(equipmentUnavailability)
          .where(
            eq(equipmentUnavailability.idempotencyKey, input.idempotencyKey),
          );
        if (idempotent) return true;
        const asset = await this.findAsset(transaction, equipmentId);
        const startsAt = new Date(input.startsAt);
        const endsAt = new Date(input.endsAt);
        if (endsAt <= startsAt)
          throw new ConflictException(
            "O fim da indisponibilidade precisa acontecer depois do início.",
          );
        await transaction.insert(equipmentUnavailability).values({
          tenantId,
          equipmentId,
          idempotencyKey: input.idempotencyKey,
          startsAt,
          endsAt,
          reason: input.reason,
        });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EQUIPMENT_UNAVAILABILITY_REGISTERED",
          correlationId: input.idempotencyKey,
          payload: {
            equipmentId,
            equipmentName: asset.name,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            reason: input.reason,
          },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "Essa indisponibilidade já estava na agenda."
        : "Indisponibilidade registrada na agenda da cozinha.",
      workspace: await this.getForTenant(tenantId),
      repeated,
    };
  }

  async updateStatus(
    tenantId: string,
    equipmentId: string,
    status: EquipmentStatus,
  ): Promise<EquipmentMutationResult> {
    this.assertConfigured();
    const repeated = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const asset = await this.findAsset(transaction, equipmentId);
        if (asset.status === status) return true;
        const correlationId = randomUUID();
        await transaction
          .update(equipmentAssets)
          .set({ status, updatedAt: new Date() })
          .where(eq(equipmentAssets.id, equipmentId));
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "EQUIPMENT_STATUS_CHANGED",
          correlationId,
          payload: { equipmentId, from: asset.status, to: status },
        });
        return false;
      },
    );
    return {
      message: repeated
        ? "O equipamento já estava nesse estado."
        : status === "maintenance"
          ? "Equipamento separado para manutenção."
          : status === "retired"
            ? "Equipamento retirado da rotina."
            : "Equipamento disponível novamente.",
      workspace: await this.getForTenant(tenantId),
      repeated,
    };
  }

  private async findAsset(transaction: AppTransaction, equipmentId: string) {
    const [asset] = await transaction
      .select()
      .from(equipmentAssets)
      .where(and(eq(equipmentAssets.id, equipmentId)));
    if (!asset) throw new NotFoundException("Equipamento não encontrado.");
    return asset;
  }

  private async loadWorkspace(
    transaction: AppTransaction,
    tenantId: string,
  ): Promise<EquipmentWorkspace> {
    const [assets, maintenance, usages, unavailable, storedOrders, items] =
      await Promise.all([
        transaction
          .select()
          .from(equipmentAssets)
          .orderBy(asc(equipmentAssets.name)),
        transaction
          .select()
          .from(equipmentMaintenanceEvents)
          .orderBy(desc(equipmentMaintenanceEvents.performedAt)),
        transaction
          .select()
          .from(equipmentUsages)
          .orderBy(desc(equipmentUsages.usedAt)),
        transaction
          .select()
          .from(equipmentUnavailability)
          .orderBy(asc(equipmentUnavailability.startsAt)),
        transaction.select().from(orders).orderBy(desc(orders.deliveryAt)),
        transaction.select().from(orderItems),
      ]);
    const orderMap = new Map(storedOrders.map((order) => [order.id, order]));
    const itemMap = new Map(
      items.map((item) => [item.orderId, item.recipeNameSnapshot]),
    );
    const orderLabel = (orderId: string) => {
      const order = orderMap.get(orderId);
      return order
        ? `#${order.orderNumber} · ${itemMap.get(order.id) ?? "Encomenda"} · ${order.customerNameSnapshot}`
        : null;
    };
    const equipment = assets.map((asset) => {
      const assetMaintenance = maintenance.filter(
        (event) => event.equipmentId === asset.id,
      );
      const assetUsages = usages.filter(
        (usage) => usage.equipmentId === asset.id,
      );
      const supportedOrderIds = [
        ...new Set(
          assetUsages.flatMap((usage) =>
            usage.orderId ? [usage.orderId] : [],
          ),
        ),
      ];
      const latestNextDue =
        assetMaintenance.find((event) => event.nextDueDate)?.nextDueDate ??
        null;
      return {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        brand: asset.brand,
        model: asset.model,
        purchaseDate: isoDate(asset.purchaseDate),
        purchaseValue: money(asset.purchaseValue),
        capacityUnits: asset.capacityUnits,
        status: asset.status,
        notes: asset.notes,
        maintenanceSpend: money(
          assetMaintenance.reduce((sum, event) => sum + event.cost, 0),
        ),
        nextMaintenanceDate: isoDate(latestNextDue),
        usageCount: assetUsages.length,
        supportedOrderCount: supportedOrderIds.length,
        supportedRevenue: money(
          supportedOrderIds.reduce(
            (sum, orderId) => sum + (orderMap.get(orderId)?.price ?? 0),
            0,
          ),
        ),
        maintenance: assetMaintenance.map((event) => ({
          id: event.id,
          performedAt: isoDate(event.performedAt) as string,
          description: event.description,
          cost: money(event.cost),
          provider: event.provider,
          nextDueDate: isoDate(event.nextDueDate),
        })),
        usages: assetUsages.slice(0, 6).map((usage) => ({
          id: usage.id,
          usedAt: isoDate(usage.usedAt) as string,
          durationMinutes: usage.durationMinutes,
          orderId: usage.orderId,
          orderLabel: usage.orderId ? orderLabel(usage.orderId) : null,
          notes: usage.notes,
          source: usage.source,
          productionTaskId: usage.productionTaskId,
        })),
        unavailability: unavailable
          .filter(
            (entry) =>
              entry.equipmentId === asset.id && entry.endsAt >= new Date(),
          )
          .map((entry) => ({
            id: entry.id,
            startsAt: entry.startsAt.toISOString(),
            endsAt: entry.endsAt.toISOString(),
            reason: entry.reason,
          })),
      };
    });
    const distinctSupportedOrderIds = [
      ...new Set(
        usages.flatMap((usage) => (usage.orderId ? [usage.orderId] : [])),
      ),
    ];
    const today = new Date(
      new Date().toISOString().slice(0, 10) + "T12:00:00Z",
    );
    return {
      tenantName:
        tenantId === demoTenantId
          ? "Stefanie Dellavolpe Doces"
          : "Confeitaria Vizinha",
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
      summary: {
        activeCount: equipment.filter((asset) => asset.status === "active")
          .length,
        attentionCount: equipment.filter(
          (asset) =>
            asset.status === "maintenance" ||
            (asset.nextMaintenanceDate &&
              exactDate(asset.nextMaintenanceDate) <= today),
        ).length,
        acquisitionValue: money(
          equipment.reduce((sum, asset) => sum + asset.purchaseValue, 0),
        ),
        maintenanceSpend: money(
          equipment.reduce((sum, asset) => sum + asset.maintenanceSpend, 0),
        ),
        supportedRevenue: money(
          distinctSupportedOrderIds.reduce(
            (sum, orderId) => sum + (orderMap.get(orderId)?.price ?? 0),
            0,
          ),
        ),
      },
      equipment,
      ordersForUsage: storedOrders
        .filter((order) => order.status !== "cancelled")
        .map((order) => ({
          id: order.id,
          label: orderLabel(order.id) as string,
        })),
    };
  }

  private emptyWorkspace(tenantId: string): EquipmentWorkspace {
    return {
      tenantName:
        tenantId === demoTenantId
          ? "Stefanie Dellavolpe Doces"
          : "Confeitaria Vizinha",
      ownerName: tenantId === demoTenantId ? "Stefanie" : "Proprietária",
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
  }

  private assertConfigured() {
    if (!this.database.isConfigured)
      throw new ConflictException(
        "Conecte o banco para cuidar dos equipamentos.",
      );
  }
}
