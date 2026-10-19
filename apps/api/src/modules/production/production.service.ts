import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  commercialItems,
  equipmentAssets,
  equipmentUnavailability,
  equipmentUsages,
  inventoryReservations,
  orderRequirements,
  orders,
  preparationInstances,
  productionMoments,
  productionNotes,
  productionPlans,
  productionConsumptionCorrectionLines,
  productionConsumptionCorrections,
  productionTaskConsumptions,
  productionTaskDependencies,
  productionTasks,
  purchaseLots,
  recipeLines,
  stockMovements,
} from "../../database/schema";
import type {
  ProductionBoard,
  ProductionConsumptionCorrectionInput,
  ProductionConsumptionInput,
  ProductionTaskActionInput,
} from "./production.contract";
import {
  calculateConsumptionVariance,
  summarizeConsumptionVariance,
} from "./production.variance";

type TaskStatus = typeof productionTasks.$inferSelect.status;
type StockMovementRow = typeof stockMovements.$inferSelect;

const allowedActions: Record<
  ProductionTaskActionInput["action"],
  TaskStatus[]
> = {
  start: ["available"],
  wait: ["in_progress"],
  resume: ["waiting"],
  complete: ["in_progress", "waiting"],
};

const kindLabels: Record<typeof productionTasks.$inferSelect.kind, string> = {
  active: "Preparo ativo",
  heating: "Aquecimento",
  oven: "Forno",
  rest: "Descanso",
  cooling: "Resfriamento",
  cold: "Geladeira",
  assembly: "Montagem",
};

const equipmentKindLabels: Record<
  NonNullable<typeof productionTasks.$inferSelect.requiredEquipmentKind>,
  string
> = {
  oven: "Forno",
  mixer: "Batedeira",
  refrigeration: "Geladeira ou freezer",
  stove: "Fogão",
  utensil: "Ferramenta específica",
  other: "Outro equipamento",
};

function scheduleOverlaps(
  left: typeof productionTasks.$inferSelect,
  right: typeof productionTasks.$inferSelect,
) {
  return (
    left.plannedStartAt < right.plannedEndAt &&
    right.plannedStartAt < left.plannedEndAt
  );
}

function movementFactor(type: StockMovementRow["type"]) {
  if (["PURCHASE_IN", "ADJUSTMENT_IN", "RETURN_IN", "RELEASE"].includes(type))
    return 1;
  if (
    ["ADJUSTMENT_OUT", "CONSUME", "LOSS", "RETURN_OUT", "RESERVE"].includes(
      type,
    )
  )
    return -1;
  return 0;
}

function clock(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(value)
    .replace(":", "h");
}

function deliveryLabel(value: Date) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(value)
    .replace(" de ", " ");
  return `${date} às ${clock(value)}`;
}

function attentionLabel(
  task: typeof productionTasks.$inferSelect,
  now = new Date(),
) {
  if (task.status === "in_progress") return "Em andamento na bancada";
  if (task.status === "waiting") {
    if (!task.nextAttentionAt || task.nextAttentionAt <= now)
      return "Pede atenção agora";
    const minutes = Math.max(
      1,
      Math.ceil((task.nextAttentionAt.getTime() - now.getTime()) / 60_000),
    );
    return `Próxima atenção em ${minutes} min`;
  }
  return task.plannedStartAt > now
    ? `Planejado para ${clock(task.plannedStartAt)}`
    : "Pode começar agora";
}

@Injectable()
export class ProductionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getBoardForTenant(tenantId: string): Promise<ProductionBoard> {
    if (!this.database.isConfigured) {
      return { activeOrderCount: 0, currentTask: null, otherOrders: [] };
    }
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadBoard(transaction),
    );
  }

  async loadBoard(transaction: AppTransaction): Promise<ProductionBoard> {
    const [
      plans,
      moments,
      tasks,
      storedOrders,
      requirements,
      reservations,
      items,
      notes,
      lines,
      consumptions,
      consumptionCorrections,
      consumptionCorrectionLines,
      preparations,
      assets,
      unavailablePeriods,
    ] = await Promise.all([
      transaction.select().from(productionPlans),
      transaction
        .select()
        .from(productionMoments)
        .orderBy(asc(productionMoments.position)),
      transaction
        .select()
        .from(productionTasks)
        .orderBy(asc(productionTasks.plannedStartAt)),
      transaction.select().from(orders),
      transaction.select().from(orderRequirements),
      transaction.select().from(inventoryReservations),
      transaction.select().from(commercialItems),
      transaction.select().from(productionNotes),
      transaction.select().from(recipeLines),
      transaction.select().from(productionTaskConsumptions),
      transaction.select().from(productionConsumptionCorrections),
      transaction.select().from(productionConsumptionCorrectionLines),
      transaction.select().from(preparationInstances),
      transaction.select().from(equipmentAssets),
      transaction.select().from(equipmentUnavailability),
    ]);
    const activePlans = plans
      .filter(
        (plan) => plan.status === "planned" || plan.status === "in_progress",
      )
      .sort(
        (left, right) =>
          left.recommendedStartAt.getTime() -
          right.recommendedStartAt.getTime(),
      );
    const actionable = tasks
      .filter(
        (task) =>
          activePlans.some((plan) => plan.id === task.productionPlanId) &&
          ["available", "in_progress", "waiting"].includes(task.status),
      )
      .sort((left, right) => {
        const priority = { in_progress: 0, waiting: 1, available: 2 } as const;
        const byPriority =
          priority[left.status as keyof typeof priority] -
          priority[right.status as keyof typeof priority];
        if (byPriority !== 0) return byPriority;
        const leftTime = left.nextAttentionAt ?? left.plannedStartAt;
        const rightTime = right.nextAttentionAt ?? right.plannedStartAt;
        return leftTime.getTime() - rightTime.getTime();
      });
    const focus = actionable[0] ?? null;
    const focusPlan = focus
      ? (activePlans.find((plan) => plan.id === focus.productionPlanId) ?? null)
      : null;
    const focusOrder = focusPlan
      ? (storedOrders.find((order) => order.id === focusPlan.orderId) ?? null)
      : null;
    const planRequirements = focusPlan
      ? requirements.filter(
          (requirement) => requirement.orderId === focusPlan.orderId,
        )
      : [];
    const completeIngredientMapping =
      Boolean(focusPlan) &&
      planRequirements.length > 0 &&
      planRequirements.every((requirement) => {
        const line = lines.find(
          (entry) => entry.id === requirement.sourceRecipeLineId,
        );
        return Boolean(line?.recipeStepId);
      });
    const focusLineIds = new Set(
      focus
        ? lines
            .filter((line) => line.recipeStepId === focus.sourceRecipeStepId)
            .map((line) => line.id)
        : [],
    );
    const focusIngredients = focusPlan
      ? planRequirements
          .filter(
            (requirement) =>
              !completeIngredientMapping ||
              (requirement.sourceRecipeLineId !== null &&
                focusLineIds.has(requirement.sourceRecipeLineId)),
          )
          .map((requirement) => ({
            consumption: consumptions.find(
              (entry) =>
                entry.productionTaskId === focus?.id &&
                entry.orderRequirementId === requirement.id,
            ),
            requirement,
          }))
          .map(({ requirement, consumption }) => {
            const corrections = consumption
              ? consumptionCorrectionLines
                  .filter((line) => line.consumptionId === consumption.id)
                  .sort(
                    (left, right) =>
                      left.createdAt.getTime() - right.createdAt.getTime(),
                  )
              : [];
            const latest = corrections.at(-1);
            const latestHeader = latest
              ? consumptionCorrections.find(
                  (entry) => entry.id === latest.correctionId,
                )
              : null;
            return {
              id: requirement.id,
              name: requirement.ingredientNameSnapshot,
              requiredG: requirement.requiredBase,
              reservedG:
                consumption?.reservedQuantityBase ??
                reservations
                  .filter(
                    (reservation) =>
                      reservation.requirementId === requirement.id &&
                      reservation.releasedAt === null,
                  )
                  .reduce(
                    (total, reservation) => total + reservation.quantityBase,
                    0,
                  ),
              shortageG: requirement.shortageBase,
              status: requirement.status,
              preferredItemName:
                items.find(
                  (item) => item.id === requirement.preferredCommercialItemId,
                )?.displayName ?? null,
              consumption: consumption
                ? {
                    originalActualUsedG: consumption.actualUsedBase,
                    originalLossG: consumption.lossBase,
                    actualUsedG:
                      latest?.correctedActualUsedBase ??
                      consumption.actualUsedBase,
                    lossG: latest?.correctedLossBase ?? consumption.lossBase,
                    confirmedAt: consumption.confirmedAt.toISOString(),
                    correctionCount: corrections.length,
                    lastCorrectedAt:
                      latestHeader?.correctedAt.toISOString() ?? null,
                    variance: calculateConsumptionVariance(
                      consumption.plannedQuantityBase,
                      latest?.correctedActualUsedBase ??
                        consumption.actualUsedBase,
                      latest?.correctedLossBase ?? consumption.lossBase,
                    ),
                  }
                : null,
            };
          })
      : [];
    const planMoments = focusPlan
      ? moments.filter((moment) => moment.productionPlanId === focusPlan.id)
      : [];
    const focusPreparation = focus
      ? preparations.find(
          (preparation) => preparation.id === focus.preparationInstanceId,
        )
      : null;
    const parentPreparation = focusPreparation?.parentPreparationInstanceId
      ? preparations.find(
          (preparation) =>
            preparation.id === focusPreparation.parentPreparationInstanceId,
        )
      : null;
    const currentTask =
      focus && focusPlan && focusOrder && focusPreparation
        ? {
            id: focus.id,
            status: focus.status as "available" | "in_progress" | "waiting",
            orderNumber: `#${focusOrder.orderNumber}`,
            finalProduct: `${focusPlan.productNameSnapshot} para ${focusOrder.customerNameSnapshot}`,
            attentionLabel: attentionLabel(focus),
            timeRange: `${clock(focus.plannedStartAt)} — ${clock(focus.plannedEndAt)}`,
            title: focus.nameSnapshot,
            instruction: focus.instructionsSnapshot,
            preparation: {
              id: focusPreparation.id,
              name: focusPreparation.nameSnapshot,
              kind: focusPreparation.kind,
              dedicatedToOrder: focusPreparation.dedicatedToOrder,
              parentName: parentPreparation?.nameSnapshot ?? null,
            },
            metadata: [
              `Momento ${planMoments.find((moment) => moment.id === focus.productionMomentId)?.nameSnapshot ?? "do preparo"}`,
              `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(focusPlan.productionMassG)} g previstos`,
              `${kindLabels[focus.kind]} · ${focus.durationMinutes} min`,
            ],
            equipment: this.equipmentStatusForTask(
              focus,
              tasks,
              assets,
              unavailablePeriods,
            ),
            ingredientScope: completeIngredientMapping
              ? ("task" as const)
              : ("order" as const),
            consumptionRequired:
              completeIngredientMapping && focusIngredients.length > 0,
            consumptionConfirmed:
              completeIngredientMapping &&
              focusIngredients.length > 0 &&
              focusIngredients.every((ingredient) => ingredient.consumption),
            consumptionVariance:
              focusIngredients.length > 0 &&
              focusIngredients.every((ingredient) => ingredient.consumption)
                ? summarizeConsumptionVariance(
                    focusIngredients.map((ingredient) => ({
                      plannedG: ingredient.requiredG,
                      actualUsedG: ingredient.consumption?.actualUsedG ?? 0,
                      lossG: ingredient.consumption?.lossG ?? 0,
                    })),
                  )
                : null,
            ingredients: focusIngredients,
            note:
              notes.find((note) => note.productionTaskId === focus.id)?.body ??
              null,
            steps: planMoments.map((moment) => ({
              id: moment.id,
              label: moment.nameSnapshot,
              state:
                moment.status === "completed"
                  ? ("done" as const)
                  : moment.id === focus.productionMomentId
                    ? ("current" as const)
                    : ("pending" as const),
            })),
          }
        : null;
    const otherOrders = activePlans
      .filter((plan) => plan.id !== focusPlan?.id)
      .map((plan) => {
        const order = storedOrders.find((entry) => entry.id === plan.orderId);
        const nextTask = tasks.find(
          (task) =>
            task.productionPlanId === plan.id &&
            ["available", "in_progress", "waiting", "planned"].includes(
              task.status,
            ),
        );
        return {
          id: plan.orderId,
          time: clock(nextTask?.plannedStartAt ?? plan.recommendedStartAt),
          title: `#${order?.orderNumber ?? "—"} · ${plan.productNameSnapshot} para ${order?.customerNameSnapshot ?? "cliente"}`,
          detail: `${nextTask?.nameSnapshot ?? "Preparo planejado"} · ${order?.deliveryMode === "delivery" ? "entrega" : "retirada"} em ${deliveryLabel(plan.deliveryAt)}`,
        };
      });
    return {
      activeOrderCount: activePlans.length,
      currentTask,
      otherOrders,
    };
  }

  async updateTask(
    tenantId: string,
    taskId: string,
    input: ProductionTaskActionInput,
  ) {
    const message = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [task] = await transaction
          .select()
          .from(productionTasks)
          .where(eq(productionTasks.id, taskId))
          .for("update");
        if (!task)
          throw new NotFoundException("Este preparo não foi encontrado.");
        if (!allowedActions[input.action].includes(task.status)) {
          throw new ConflictException(
            "Essa ação não combina com o momento atual do preparo.",
          );
        }
        if (input.action === "complete") {
          await this.assertConsumptionConfirmed(transaction, task);
        }
        if (input.action === "start" || input.action === "resume") {
          await this.ensureEquipmentReady(transaction, task);
        }
        const occurredAt = new Date();
        if (input.action === "start" || input.action === "resume") {
          await transaction
            .update(productionTasks)
            .set({
              status: "in_progress",
              actualStartedAt: task.actualStartedAt ?? occurredAt,
              nextAttentionAt: task.attentionRequiredAtEnd
                ? new Date(occurredAt.getTime() + task.durationMinutes * 60_000)
                : null,
              updatedAt: occurredAt,
            })
            .where(eq(productionTasks.id, task.id));
          await this.startPlanAndMoment(transaction, task, occurredAt);
        } else if (input.action === "wait") {
          await transaction
            .update(productionTasks)
            .set({
              status: "waiting",
              nextAttentionAt: new Date(
                occurredAt.getTime() + task.durationMinutes * 60_000,
              ),
              updatedAt: occurredAt,
            })
            .where(eq(productionTasks.id, task.id));
          await transaction
            .update(productionMoments)
            .set({ status: "waiting", updatedAt: occurredAt })
            .where(eq(productionMoments.id, task.productionMomentId));
        } else {
          await this.completeTask(transaction, task, occurredAt);
        }
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: `PRODUCTION_TASK_${input.action.toUpperCase()}`,
          correlationId: randomUUID(),
          payload: { taskId: task.id, planId: task.productionPlanId },
        });
        return {
          start: "Preparo iniciado. A bancada já está contando o tempo.",
          wait: "Tempo de espera registrado. A bancada avisa quando pedir atenção.",
          resume: "Preparo retomado.",
          complete: "Etapa concluída. A próxima ação já foi liberada.",
        }[input.action];
      },
    );
    return { message, board: await this.getBoardForTenant(tenantId) };
  }

  async confirmConsumption(
    tenantId: string,
    taskId: string,
    input: ProductionConsumptionInput,
  ) {
    const message = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [task] = await transaction
          .select()
          .from(productionTasks)
          .where(eq(productionTasks.id, taskId))
          .for("update");
        if (!task)
          throw new NotFoundException("Este preparo não foi encontrado.");
        if (task.status !== "in_progress" && task.status !== "waiting") {
          throw new ConflictException(
            "Comece o preparo antes de confirmar o consumo.",
          );
        }

        const mapped = await this.mappedRequirementsForTask(transaction, task);
        if (mapped.scope !== "task") {
          throw new ConflictException(
            "Esta versão ainda não separa ingredientes por etapa.",
          );
        }
        if (mapped.requirements.length === 0) {
          throw new ConflictException(
            "Esta etapa não possui ingredientes para consumir.",
          );
        }

        const expectedIds = new Set(
          mapped.requirements.map((requirement) => requirement.id),
        );
        const receivedIds = new Set(
          input.lines.map((line) => line.requirementId),
        );
        if (
          expectedIds.size !== receivedIds.size ||
          [...expectedIds].some((id) => !receivedIds.has(id))
        ) {
          throw new ConflictException(
            "Os ingredientes desta etapa mudaram. Reabra a ficha e confira novamente.",
          );
        }

        const existing = await transaction
          .select()
          .from(productionTaskConsumptions)
          .where(eq(productionTaskConsumptions.productionTaskId, task.id));
        if (existing.length === mapped.requirements.length) {
          return "O consumo desta etapa já estava confirmado.";
        }
        if (existing.length > 0) {
          throw new ConflictException(
            "O consumo desta etapa está incompleto e precisa de revisão.",
          );
        }

        const [activeReservations, lots, orderMovements] = await Promise.all([
          transaction
            .select()
            .from(inventoryReservations)
            .where(
              and(
                eq(inventoryReservations.orderId, mapped.plan.orderId),
                isNull(inventoryReservations.releasedAt),
              ),
            )
            .for("update"),
          transaction.select().from(purchaseLots),
          transaction
            .select()
            .from(stockMovements)
            .where(eq(stockMovements.referenceId, mapped.plan.orderId)),
        ]);
        const reversedMovementIds = new Set(
          orderMovements
            .map((movement) => movement.reversesMovementId)
            .filter((id): id is string => Boolean(id)),
        );
        const occurredAt = new Date();
        let totalUsed = 0;
        let totalLoss = 0;

        for (const requirement of mapped.requirements) {
          const submitted = input.lines.find(
            (line) => line.requirementId === requirement.id,
          )!;
          const actualUsed = Math.round(submitted.actualUsedG * 1000) / 1000;
          const loss = Math.round(submitted.lossG * 1000) / 1000;
          const requirementReservations = activeReservations
            .filter(
              (reservation) => reservation.requirementId === requirement.id,
            )
            .sort((left, right) => {
              const leftLot = lots.find((lot) => lot.id === left.lotId);
              const rightLot = lots.find((lot) => lot.id === right.lotId);
              const expiry = (
                leftLot?.expiryDate ?? "9999-12-31"
              ).localeCompare(rightLot?.expiryDate ?? "9999-12-31");
              return (
                expiry ||
                (leftLot?.entryDate ?? "9999-12-31").localeCompare(
                  rightLot?.entryDate ?? "9999-12-31",
                )
              );
            });
          const reserved = requirementReservations.reduce(
            (total, reservation) => total + reservation.quantityBase,
            0,
          );
          if (actualUsed + loss <= 0) {
            throw new ConflictException(
              `Informe quanto foi usado ou perdido de ${requirement.ingredientNameSnapshot}.`,
            );
          }
          if (actualUsed + loss > reserved + 0.001) {
            throw new ConflictException(
              `${requirement.ingredientNameSnapshot} possui ${reserved.toLocaleString("pt-BR")} g separados. Revise o usado e a perda.`,
            );
          }

          const [consumption] = await transaction
            .insert(productionTaskConsumptions)
            .values({
              tenantId,
              productionTaskId: task.id,
              orderRequirementId: requirement.id,
              plannedQuantityBase: requirement.requiredBase,
              reservedQuantityBase: reserved,
              actualUsedBase: actualUsed,
              lossBase: loss,
              confirmedAt: occurredAt,
            })
            .returning({ id: productionTaskConsumptions.id });
          if (!consumption)
            throw new ConflictException(
              "Não foi possível registrar o consumo desta etapa.",
            );

          let remainingUsed = actualUsed;
          let remainingLoss = loss;
          for (const reservation of requirementReservations) {
            const reserveMovement = orderMovements.find(
              (movement) =>
                movement.type === "RESERVE" &&
                movement.referenceType === "order" &&
                !reversedMovementIds.has(movement.id) &&
                movement.lotId === reservation.lotId &&
                Math.abs(movement.quantityBase - reservation.quantityBase) <
                  0.001,
            );
            if (reserveMovement) reversedMovementIds.add(reserveMovement.id);
            await transaction.insert(stockMovements).values({
              tenantId,
              lotId: reservation.lotId,
              type: "RELEASE",
              quantityBase: reservation.quantityBase,
              occurredAt,
              referenceType: "production_task_consumption",
              referenceId: consumption.id,
              reasonCode: "TASK_CONSUMPTION",
              note: `Reserva conciliada em ${task.nameSnapshot}`,
              reversesMovementId: reserveMovement?.id,
            });

            const usedFromLot = Math.min(
              remainingUsed,
              reservation.quantityBase,
            );
            if (usedFromLot > 0) {
              await transaction.insert(stockMovements).values({
                tenantId,
                lotId: reservation.lotId,
                type: "CONSUME",
                quantityBase: usedFromLot,
                occurredAt,
                referenceType: "production_task_consumption",
                referenceId: consumption.id,
                reasonCode: "TASK_CONSUMPTION",
                note: `Consumo confirmado em ${task.nameSnapshot}`,
              });
              remainingUsed -= usedFromLot;
            }
            const lossFromLot = Math.min(
              remainingLoss,
              reservation.quantityBase - usedFromLot,
            );
            if (lossFromLot > 0) {
              await transaction.insert(stockMovements).values({
                tenantId,
                lotId: reservation.lotId,
                type: "LOSS",
                quantityBase: lossFromLot,
                occurredAt,
                referenceType: "production_task_consumption",
                referenceId: consumption.id,
                reasonCode: "TASK_LOSS",
                note: `Perda registrada em ${task.nameSnapshot}`,
              });
              remainingLoss -= lossFromLot;
            }
            await transaction
              .update(inventoryReservations)
              .set({ releasedAt: occurredAt })
              .where(eq(inventoryReservations.id, reservation.id));
          }
          totalUsed += actualUsed;
          totalLoss += loss;
        }

        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "PRODUCTION_CONSUMPTION_CONFIRMED",
          correlationId: randomUUID(),
          payload: {
            taskId: task.id,
            planId: task.productionPlanId,
            totalUsed,
            totalLoss,
          },
        });
        return "Consumo confirmado. A sobra reservada voltou para a despensa.";
      },
    );
    return { message, board: await this.getBoardForTenant(tenantId) };
  }

  async correctConsumption(
    tenantId: string,
    taskId: string,
    input: ProductionConsumptionCorrectionInput,
  ) {
    const message = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [task] = await transaction
          .select()
          .from(productionTasks)
          .where(eq(productionTasks.id, taskId))
          .for("update");
        if (!task)
          throw new NotFoundException("Este preparo não foi encontrado.");
        if (task.status === "cancelled") {
          throw new ConflictException(
            "Um preparo cancelado não pode receber correção de consumo.",
          );
        }

        const mapped = await this.mappedRequirementsForTask(transaction, task);
        if (mapped.scope !== "task" || mapped.requirements.length === 0) {
          throw new ConflictException(
            "Esta versão não possui um apontamento por etapa para corrigir.",
          );
        }
        const consumptions = await transaction
          .select()
          .from(productionTaskConsumptions)
          .where(eq(productionTaskConsumptions.productionTaskId, task.id))
          .for("update");
        if (consumptions.length !== mapped.requirements.length) {
          throw new ConflictException(
            "Confirme primeiro o consumo completo desta etapa.",
          );
        }

        const expectedIds = new Set(
          mapped.requirements.map((requirement) => requirement.id),
        );
        const receivedIds = new Set(
          input.lines.map((line) => line.requirementId),
        );
        if (
          expectedIds.size !== receivedIds.size ||
          [...expectedIds].some((id) => !receivedIds.has(id))
        ) {
          throw new ConflictException(
            "Os ingredientes desta etapa mudaram. Reabra a ficha antes de corrigir.",
          );
        }

        const previousLines = await transaction
          .select()
          .from(productionConsumptionCorrectionLines);
        const changes = consumptions.map((consumption) => {
          const submitted = input.lines.find(
            (line) => line.requirementId === consumption.orderRequirementId,
          )!;
          const history = previousLines
            .filter((line) => line.consumptionId === consumption.id)
            .sort(
              (left, right) =>
                left.createdAt.getTime() - right.createdAt.getTime(),
            );
          const latest = history.at(-1);
          const previousUsed =
            latest?.correctedActualUsedBase ?? consumption.actualUsedBase;
          const previousLoss =
            latest?.correctedLossBase ?? consumption.lossBase;
          const correctedUsed = Math.round(submitted.actualUsedG * 1000) / 1000;
          const correctedLoss = Math.round(submitted.lossG * 1000) / 1000;
          return {
            consumption,
            history,
            previousUsed,
            previousLoss,
            correctedUsed,
            correctedLoss,
            usedDelta: Math.round((correctedUsed - previousUsed) * 1000) / 1000,
            lossDelta: Math.round((correctedLoss - previousLoss) * 1000) / 1000,
          };
        });
        const changed = changes.filter(
          (entry) =>
            Math.abs(entry.usedDelta) > 0.0001 ||
            Math.abs(entry.lossDelta) > 0.0001,
        );
        if (changed.length === 0) {
          throw new ConflictException(
            "Altere ao menos uma quantidade antes de registrar a correção.",
          );
        }

        const occurredAt = new Date();
        const [correction] = await transaction
          .insert(productionConsumptionCorrections)
          .values({
            tenantId,
            productionTaskId: task.id,
            reason: input.reason,
            correctedAt: occurredAt,
          })
          .returning();
        if (!correction) {
          throw new ConflictException("Não foi possível iniciar a correção.");
        }

        let totalDelta = 0;
        for (const change of changed) {
          const requirement = mapped.requirements.find(
            (entry) => entry.id === change.consumption.orderRequirementId,
          )!;
          const [correctionLine] = await transaction
            .insert(productionConsumptionCorrectionLines)
            .values({
              tenantId,
              correctionId: correction.id,
              consumptionId: change.consumption.id,
              previousActualUsedBase: change.previousUsed,
              previousLossBase: change.previousLoss,
              correctedActualUsedBase: change.correctedUsed,
              correctedLossBase: change.correctedLoss,
              actualUsedDeltaBase: change.usedDelta,
              lossDeltaBase: change.lossDelta,
            })
            .returning();
          if (!correctionLine) {
            throw new ConflictException(
              "Não foi possível preservar os valores corrigidos.",
            );
          }

          const netDelta =
            change.correctedUsed +
            change.correctedLoss -
            change.previousUsed -
            change.previousLoss;
          totalDelta += netDelta;
          if (Math.abs(netDelta) <= 0.0001) continue;

          const [items, lots] = await Promise.all([
            transaction
              .select()
              .from(commercialItems)
              .where(
                eq(
                  commercialItems.ingredientGroupId,
                  requirement.ingredientGroupId,
                ),
              ),
            transaction.select().from(purchaseLots).for("update"),
          ]);
          const itemIds = new Set(items.map((item) => item.id));
          const eligibleLots = lots
            .filter((lot) => itemIds.has(lot.commercialItemId))
            .sort((left, right) => {
              const expiry = (left.expiryDate ?? "9999-12-31").localeCompare(
                right.expiryDate ?? "9999-12-31",
              );
              return expiry || left.entryDate.localeCompare(right.entryDate);
            });
          const movements = await transaction.select().from(stockMovements);

          if (netDelta > 0) {
            const availableByLot = new Map(
              eligibleLots.map((lot) => [
                lot.id,
                movements
                  .filter((movement) => movement.lotId === lot.id)
                  .reduce(
                    (total, movement) =>
                      total +
                      movementFactor(movement.type) * movement.quantityBase,
                    0,
                  ),
              ]),
            );
            const available = [...availableByLot.values()].reduce(
              (total, quantity) => total + quantity,
              0,
            );
            if (available + 0.001 < netDelta) {
              throw new ConflictException(
                `${requirement.ingredientNameSnapshot} possui ${available.toLocaleString("pt-BR")} g disponíveis para esta correção. Ajuste a despensa antes de continuar.`,
              );
            }
            let remaining = netDelta;
            let remainingUsed = Math.min(
              remaining,
              Math.max(0, change.usedDelta),
            );
            for (const lot of eligibleLots) {
              let lotAvailable = availableByLot.get(lot.id) ?? 0;
              if (lotAvailable <= 0 || remaining <= 0.0001) continue;
              const usedFromLot = Math.min(remainingUsed, lotAvailable);
              if (usedFromLot > 0.0001) {
                await transaction.insert(stockMovements).values({
                  tenantId,
                  lotId: lot.id,
                  type: "CONSUME",
                  quantityBase: usedFromLot,
                  occurredAt,
                  referenceType: "production_consumption_correction",
                  referenceId: correctionLine.id,
                  reasonCode: "TASK_CONSUMPTION_CORRECTION",
                  note: `Complemento de consumo em ${task.nameSnapshot}: ${input.reason}`,
                });
                remainingUsed -= usedFromLot;
                remaining -= usedFromLot;
                lotAvailable -= usedFromLot;
              }
              const lossFromLot = Math.min(remaining, lotAvailable);
              if (lossFromLot > 0.0001) {
                await transaction.insert(stockMovements).values({
                  tenantId,
                  lotId: lot.id,
                  type: "LOSS",
                  quantityBase: lossFromLot,
                  occurredAt,
                  referenceType: "production_consumption_correction",
                  referenceId: correctionLine.id,
                  reasonCode: "TASK_LOSS_CORRECTION",
                  note: `Complemento de perda em ${task.nameSnapshot}: ${input.reason}`,
                });
                remaining -= lossFromLot;
              }
            }
          } else {
            let remainingReturn = Math.abs(netDelta);
            const referenceIds = new Set([
              change.consumption.id,
              ...change.history.map((line) => line.id),
            ]);
            for (const lot of eligibleLots) {
              const related = movements.filter(
                (movement) =>
                  movement.referenceId !== null &&
                  referenceIds.has(movement.referenceId) &&
                  movement.lotId === lot.id,
              );
              const netOut = related.reduce((total, movement) => {
                if (movement.type === "CONSUME" || movement.type === "LOSS")
                  return total + movement.quantityBase;
                if (movement.type === "RETURN_IN")
                  return total - movement.quantityBase;
                return total;
              }, 0);
              const returnedToLot = Math.min(remainingReturn, netOut);
              if (returnedToLot <= 0.0001) continue;
              const reversed = related.find(
                (movement) =>
                  movement.type === "CONSUME" || movement.type === "LOSS",
              );
              await transaction.insert(stockMovements).values({
                tenantId,
                lotId: lot.id,
                type: "RETURN_IN",
                quantityBase: returnedToLot,
                occurredAt,
                referenceType: "production_consumption_correction",
                referenceId: correctionLine.id,
                reasonCode: "TASK_CONSUMPTION_CORRECTION",
                note: `Devolução por correção em ${task.nameSnapshot}: ${input.reason}`,
                reversesMovementId: reversed?.id,
              });
              remainingReturn -= returnedToLot;
              if (remainingReturn <= 0.0001) break;
            }
            if (remainingReturn > 0.001) {
              throw new ConflictException(
                `Não foi possível localizar todo o histórico de ${requirement.ingredientNameSnapshot} para devolver à despensa.`,
              );
            }
          }
        }

        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "PRODUCTION_CONSUMPTION_CORRECTED",
          correlationId: randomUUID(),
          payload: {
            taskId: task.id,
            planId: task.productionPlanId,
            correctionId: correction.id,
            reason: input.reason,
            changedLineCount: changed.length,
            totalDelta: Math.round(totalDelta * 1000) / 1000,
          },
        });
        return totalDelta > 0.0001
          ? "Correção registrada. A diferença adicional saiu da despensa."
          : totalDelta < -0.0001
            ? "Correção registrada. A diferença voltou para a despensa."
            : "Correção registrada sem alterar o saldo físico da despensa.";
      },
    );
    return { message, board: await this.getBoardForTenant(tenantId) };
  }

  async saveNote(tenantId: string, taskId: string, note: string) {
    const message = await this.database.withTenant(
      tenantId,
      async (transaction) => {
        const [task] = await transaction
          .select({ id: productionTasks.id })
          .from(productionTasks)
          .where(eq(productionTasks.id, taskId));
        if (!task)
          throw new NotFoundException("Este preparo não foi encontrado.");
        const occurredAt = new Date();
        await transaction
          .insert(productionNotes)
          .values({
            tenantId,
            productionTaskId: taskId,
            body: note,
            updatedAt: occurredAt,
          })
          .onConflictDoUpdate({
            target: [
              productionNotes.tenantId,
              productionNotes.productionTaskId,
            ],
            set: { body: note, updatedAt: occurredAt },
          });
        await transaction.insert(auditEvents).values({
          tenantId,
          eventType: "PRODUCTION_NOTE_SAVED",
          correlationId: randomUUID(),
          payload: { taskId },
        });
        return "Observação guardada junto deste preparo.";
      },
    );
    return { message, board: await this.getBoardForTenant(tenantId) };
  }

  private equipmentStatusForTask(
    task: typeof productionTasks.$inferSelect,
    tasks: Array<typeof productionTasks.$inferSelect>,
    assets: Array<typeof equipmentAssets.$inferSelect>,
    unavailablePeriods: Array<typeof equipmentUnavailability.$inferSelect>,
  ) {
    if (!task.requiredEquipmentKind) return null;
    const label = equipmentKindLabels[task.requiredEquipmentKind];
    const matchingAssets = assets.filter(
      (asset) => asset.kind === task.requiredEquipmentKind,
    );
    const assigned = matchingAssets.find(
      (asset) => asset.id === task.equipmentId,
    );
    const activeOccupants = tasks.filter(
      (entry) =>
        entry.id !== task.id &&
        entry.equipmentId !== null &&
        (entry.status === "in_progress" || entry.status === "waiting"),
    );
    const plannedConflicts = tasks.filter(
      (entry) =>
        entry.id !== task.id &&
        entry.equipmentId !== null &&
        entry.status !== "completed" &&
        entry.status !== "cancelled" &&
        scheduleOverlaps(task, entry),
    );
    const isUnavailable = (assetId: string) =>
      unavailablePeriods.some(
        (period) =>
          period.equipmentId === assetId &&
          task.plannedStartAt < period.endsAt &&
          period.startsAt < task.plannedEndAt,
      );

    if (assigned && isUnavailable(assigned.id)) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "maintenance" as const,
        assetName: assigned.name,
        blocking: true,
        message: `${assigned.name} está indisponível neste período. Replaneje o pedido ou ajuste a agenda do equipamento.`,
      };
    }

    if (assigned && assigned.status !== "active") {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "maintenance" as const,
        assetName: assigned.name,
        blocking: true,
        message: `${assigned.name} está fora da bancada. Marque-o como disponível ou escolha outro recurso.`,
      };
    }
    if (
      assigned &&
      activeOccupants.filter((entry) => entry.equipmentId === assigned.id)
        .length >= assigned.capacityUnits
    ) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "busy" as const,
        assetName: assigned.name,
        blocking: true,
        message: `${assigned.name} ainda está participando de outro preparo.`,
      };
    }
    if (
      assigned &&
      plannedConflicts.filter((entry) => entry.equipmentId === assigned.id)
        .length >= assigned.capacityUnits
    ) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "warning" as const,
        assetName: assigned.name,
        blocking: false,
        message: `${assigned.name} também aparece em outro preparo neste horário. Confirme a ordem antes de começar.`,
      };
    }
    if (assigned) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "ready" as const,
        assetName: assigned.name,
        blocking: false,
        message: `${assigned.name} está reservado para esta etapa.`,
      };
    }

    if (matchingAssets.length === 0) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "missing" as const,
        assetName: null,
        blocking: true,
        message: `A receita pede ${label.toLocaleLowerCase("pt-BR")}, mas nenhum está cadastrado.`,
      };
    }
    const activeAssets = matchingAssets.filter(
      (asset) => asset.status === "active",
    );
    if (activeAssets.length === 0) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "maintenance" as const,
        assetName: matchingAssets[0]?.name ?? null,
        blocking: true,
        message: `Os equipamentos deste tipo estão em manutenção ou foram baixados.`,
      };
    }
    const freeAsset = activeAssets.find(
      (asset) =>
        !isUnavailable(asset.id) &&
        activeOccupants.filter((entry) => entry.equipmentId === asset.id)
          .length < asset.capacityUnits,
    );
    if (!freeAsset) {
      return {
        kind: task.requiredEquipmentKind,
        label,
        state: "busy" as const,
        assetName: null,
        blocking: true,
        message: `Todos os equipamentos deste tipo estão ocupados agora.`,
      };
    }
    const hasPlannedConflict =
      plannedConflicts.filter((entry) => entry.equipmentId === freeAsset.id)
        .length >= freeAsset.capacityUnits;
    return {
      kind: task.requiredEquipmentKind,
      label,
      state: hasPlannedConflict ? ("warning" as const) : ("ready" as const),
      assetName: freeAsset.name,
      blocking: false,
      message: hasPlannedConflict
        ? `${freeAsset.name} também foi planejado para outro preparo neste horário; ao começar, a bancada confirma quem o utiliza.`
        : `${freeAsset.name} será reservado quando você começar.`,
    };
  }

  private async ensureEquipmentReady(
    transaction: AppTransaction,
    task: typeof productionTasks.$inferSelect,
  ) {
    if (!task.requiredEquipmentKind) return;
    const [assets, tasks, unavailablePeriods] = await Promise.all([
      transaction.select().from(equipmentAssets),
      transaction.select().from(productionTasks),
      transaction.select().from(equipmentUnavailability),
    ]);
    const activeOccupants = tasks.filter(
      (entry) =>
        entry.id !== task.id &&
        (entry.status === "in_progress" || entry.status === "waiting") &&
        entry.equipmentId,
    );
    const now = new Date();
    const canUse = (asset: typeof equipmentAssets.$inferSelect) =>
      asset.status === "active" &&
      activeOccupants.filter((entry) => entry.equipmentId === asset.id).length <
        asset.capacityUnits &&
      unavailablePeriods.every(
        (period) =>
          period.equipmentId !== asset.id ||
          !(period.startsAt <= now && now < period.endsAt),
      );
    const available =
      assets.find(
        (asset) =>
          asset.kind === task.requiredEquipmentKind &&
          canUse(asset) &&
          (asset.id === task.equipmentId || task.equipmentId === null),
      ) ??
      assets.find(
        (asset) => asset.kind === task.requiredEquipmentKind && canUse(asset),
      );
    if (!available) {
      const hasActive = assets.some(
        (asset) =>
          asset.kind === task.requiredEquipmentKind &&
          asset.status === "active",
      );
      throw new ConflictException(
        hasActive
          ? `${equipmentKindLabels[task.requiredEquipmentKind]} ocupado em outro preparo. Aguarde a liberação.`
          : `${equipmentKindLabels[task.requiredEquipmentKind]} indisponível. Ajuste o equipamento antes de começar.`,
      );
    }
    if (task.equipmentId !== available.id) {
      await transaction
        .update(productionTasks)
        .set({ equipmentId: available.id, updatedAt: new Date() })
        .where(eq(productionTasks.id, task.id));
    }
  }

  private async recordEquipmentUsage(
    transaction: AppTransaction,
    task: typeof productionTasks.$inferSelect,
    occurredAt: Date,
  ) {
    if (!task.equipmentId) return;
    const [plan] = await transaction
      .select()
      .from(productionPlans)
      .where(eq(productionPlans.id, task.productionPlanId));
    if (!plan) return;
    await transaction
      .insert(equipmentUsages)
      .values({
        tenantId: task.tenantId,
        equipmentId: task.equipmentId,
        orderId: plan.orderId,
        productionTaskId: task.id,
        idempotencyKey: task.id,
        source: "production",
        usedAt: occurredAt,
        durationMinutes: task.durationMinutes,
        notes: `Uso registrado ao concluir: ${task.nameSnapshot}`,
      })
      .onConflictDoNothing();
  }

  private async mappedRequirementsForTask(
    transaction: AppTransaction,
    task: typeof productionTasks.$inferSelect,
  ) {
    const [plan] = await transaction
      .select()
      .from(productionPlans)
      .where(eq(productionPlans.id, task.productionPlanId));
    if (!plan)
      throw new NotFoundException("O plano deste preparo não foi encontrado.");
    const [requirements, lines] = await Promise.all([
      transaction
        .select()
        .from(orderRequirements)
        .where(eq(orderRequirements.orderId, plan.orderId)),
      transaction.select().from(recipeLines),
    ]);
    const completeMapping =
      requirements.length > 0 &&
      requirements.every((requirement) => {
        const line = lines.find(
          (entry) => entry.id === requirement.sourceRecipeLineId,
        );
        return Boolean(line?.recipeStepId);
      });
    if (!completeMapping) {
      return {
        scope: "order" as const,
        plan,
        requirements: [] as Array<typeof orderRequirements.$inferSelect>,
      };
    }
    const lineIds = new Set(
      lines
        .filter((line) => line.recipeStepId === task.sourceRecipeStepId)
        .map((line) => line.id),
    );
    return {
      scope: "task" as const,
      plan,
      requirements: requirements.filter(
        (requirement) =>
          requirement.sourceRecipeLineId !== null &&
          lineIds.has(requirement.sourceRecipeLineId),
      ),
    };
  }

  private async assertConsumptionConfirmed(
    transaction: AppTransaction,
    task: typeof productionTasks.$inferSelect,
  ) {
    const mapped = await this.mappedRequirementsForTask(transaction, task);
    if (mapped.scope !== "task" || mapped.requirements.length === 0) return;
    const confirmed = await transaction
      .select({ requirementId: productionTaskConsumptions.orderRequirementId })
      .from(productionTaskConsumptions)
      .where(eq(productionTaskConsumptions.productionTaskId, task.id));
    const confirmedIds = new Set(confirmed.map((entry) => entry.requirementId));
    if (
      mapped.requirements.some(
        (requirement) => !confirmedIds.has(requirement.id),
      )
    ) {
      throw new ConflictException(
        "Confirme o consumo dos ingredientes antes de concluir a tarefa.",
      );
    }
  }

  private async startPlanAndMoment(
    transaction: AppTransaction,
    task: typeof productionTasks.$inferSelect,
    occurredAt: Date,
  ) {
    const [plan] = await transaction
      .select()
      .from(productionPlans)
      .where(eq(productionPlans.id, task.productionPlanId));
    if (!plan) return;
    const [moment] = await transaction
      .select()
      .from(productionMoments)
      .where(eq(productionMoments.id, task.productionMomentId));
    await transaction
      .update(productionPlans)
      .set({
        status: "in_progress",
        startedAt: plan.startedAt ?? occurredAt,
        updatedAt: occurredAt,
      })
      .where(eq(productionPlans.id, plan.id));
    await transaction
      .update(productionMoments)
      .set({
        status: "in_progress",
        actualStartedAt: moment?.actualStartedAt ?? occurredAt,
        updatedAt: occurredAt,
      })
      .where(eq(productionMoments.id, task.productionMomentId));
    await transaction
      .update(orders)
      .set({ status: "in_production", startedAt: occurredAt })
      .where(and(eq(orders.id, plan.orderId), eq(orders.status, "confirmed")));
  }

  private async completeTask(
    transaction: AppTransaction,
    task: typeof productionTasks.$inferSelect,
    occurredAt: Date,
  ) {
    await transaction
      .update(productionTasks)
      .set({
        status: "completed",
        actualCompletedAt: occurredAt,
        nextAttentionAt: null,
        updatedAt: occurredAt,
      })
      .where(eq(productionTasks.id, task.id));
    await this.recordEquipmentUsage(transaction, task, occurredAt);
    const [planTasks, dependencies, planMoments] = await Promise.all([
      transaction
        .select()
        .from(productionTasks)
        .where(eq(productionTasks.productionPlanId, task.productionPlanId))
        .orderBy(asc(productionTasks.position)),
      transaction
        .select()
        .from(productionTaskDependencies)
        .where(
          eq(
            productionTaskDependencies.productionPlanId,
            task.productionPlanId,
          ),
        ),
      transaction
        .select()
        .from(productionMoments)
        .where(eq(productionMoments.productionPlanId, task.productionPlanId))
        .orderBy(asc(productionMoments.position)),
    ]);
    const completedIds = new Set(
      planTasks
        .filter(
          (entry) =>
            entry.id === task.id ||
            entry.status === "completed" ||
            entry.status === "cancelled",
        )
        .map((entry) => entry.id),
    );
    const unlocked = planTasks.filter(
      (entry) =>
        entry.status === "planned" &&
        dependencies
          .filter((dependency) => dependency.successorTaskId === entry.id)
          .every((dependency) =>
            completedIds.has(dependency.predecessorTaskId),
          ),
    );
    for (const unlockedTask of unlocked) {
      await transaction
        .update(productionTasks)
        .set({ status: "available", updatedAt: occurredAt })
        .where(eq(productionTasks.id, unlockedTask.id));
      await transaction
        .update(productionMoments)
        .set({ status: "available", updatedAt: occurredAt })
        .where(eq(productionMoments.id, unlockedTask.productionMomentId));
    }

    const momentTasks = planTasks.filter(
      (entry) => entry.productionMomentId === task.productionMomentId,
    );
    if (
      momentTasks.every(
        (entry) =>
          entry.id === task.id ||
          entry.status === "completed" ||
          entry.status === "cancelled",
      )
    ) {
      await transaction
        .update(productionMoments)
        .set({
          status: "completed",
          actualCompletedAt: occurredAt,
          updatedAt: occurredAt,
        })
        .where(eq(productionMoments.id, task.productionMomentId));
    }

    const allTasksCompleted = planTasks.every(
      (entry) =>
        entry.id === task.id ||
        entry.status === "completed" ||
        entry.status === "cancelled",
    );
    if (!allTasksCompleted) return;

    await Promise.all(
      planMoments.map((moment) =>
        transaction
          .update(productionMoments)
          .set({
            status: "completed",
            actualCompletedAt: moment.actualCompletedAt ?? occurredAt,
            updatedAt: occurredAt,
          })
          .where(eq(productionMoments.id, moment.id)),
      ),
    );
    const [plan] = await transaction
      .select()
      .from(productionPlans)
      .where(eq(productionPlans.id, task.productionPlanId));
    if (!plan) return;
    await transaction
      .update(productionPlans)
      .set({ status: "ready", readyAt: occurredAt, updatedAt: occurredAt })
      .where(eq(productionPlans.id, plan.id));
    await transaction
      .update(orders)
      .set({ status: "ready", readyAt: occurredAt })
      .where(eq(orders.id, plan.orderId));
  }
}
