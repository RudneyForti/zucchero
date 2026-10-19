import { asc, eq } from "drizzle-orm";
import type { AppTransaction } from "../../database/database.service";
import {
  equipmentAssets,
  equipmentUnavailability,
  preparationInstances,
  productionMoments,
  productionPlans,
  productionTaskDependencies,
  productionTasks,
  recipeMoments,
  recipes,
  recipeStepDependencies,
  recipeSteps,
  recipeSubrecipeLines,
  recipeVersions,
} from "../../database/schema";

export type ProductionSourceMoment = {
  id: string;
  name: string;
  preparationRole: typeof recipeMoments.$inferSelect.preparationRole;
  position: number;
  steps: Array<{
    id: string;
    name: string;
    instructions: string;
    kind: typeof recipeSteps.$inferSelect.kind;
    requiredEquipmentKind: typeof recipeSteps.$inferSelect.requiredEquipmentKind;
    durationMinutes: number;
    parallelizable: boolean;
    attentionRequiredAtEnd: boolean;
    position: number;
    predecessorStepIds?: string[];
    sourceStepId?: string;
    preparationKey?: string;
    preparationName?: string;
    preparationVersionId?: string;
    preparationExpectedOutputG?: number;
    preparationParentKey?: string;
  }>;
};

type ComposedPreparation = {
  key: string;
  parentKey: string;
  sourceRecipeVersionId: string;
  name: string;
  expectedOutputG: number;
};

type EquipmentAllocationCandidate = {
  id: string;
  kind: typeof equipmentAssets.$inferSelect.kind;
  status: typeof equipmentAssets.$inferSelect.status;
  capacityUnits: number;
};

type EquipmentUnavailablePeriod = {
  equipmentId: string;
  startsAt: Date;
  endsAt: Date;
};

type EquipmentReservation = {
  taskId: string;
  equipmentId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  status: typeof productionTasks.$inferSelect.status;
};

function overlaps(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function allocateEquipmentForTasks(
  tasks: Array<{
    id: string;
    requiredEquipmentKind: typeof recipeSteps.$inferSelect.requiredEquipmentKind;
    plannedStartAt: Date;
    plannedEndAt: Date;
  }>,
  assets: EquipmentAllocationCandidate[],
  existingReservations: EquipmentReservation[],
  unavailablePeriods: EquipmentUnavailablePeriod[] = [],
) {
  const reservations = existingReservations.filter(
    (reservation) =>
      reservation.status !== "completed" && reservation.status !== "cancelled",
  );

  return [...tasks]
    .sort(
      (left, right) =>
        left.plannedStartAt.getTime() - right.plannedStartAt.getTime(),
    )
    .map((task) => {
      if (!task.requiredEquipmentKind) {
        return { taskId: task.id, equipmentId: null };
      }

      const equipment = assets
        .filter(
          (asset) =>
            asset.status === "active" &&
            asset.kind === task.requiredEquipmentKind,
        )
        .find((asset) => {
          const unavailable = unavailablePeriods.some(
            (period) =>
              period.equipmentId === asset.id &&
              overlaps(
                task.plannedStartAt,
                task.plannedEndAt,
                period.startsAt,
                period.endsAt,
              ),
          );
          if (unavailable) return false;
          const concurrent = reservations.filter(
            (reservation) =>
              reservation.equipmentId === asset.id &&
              overlaps(
                task.plannedStartAt,
                task.plannedEndAt,
                reservation.plannedStartAt,
                reservation.plannedEndAt,
              ),
          ).length;
          return concurrent < asset.capacityUnits;
        });

      if (!equipment) return { taskId: task.id, equipmentId: null };

      reservations.push({
        taskId: task.id,
        equipmentId: equipment.id,
        plannedStartAt: task.plannedStartAt,
        plannedEndAt: task.plannedEndAt,
        status: "planned",
      });
      return { taskId: task.id, equipmentId: equipment.id };
    });
}

export type ReplannableProductionTask = {
  id: string;
  productionMomentId: string;
  durationMinutes: number;
  status:
    | "planned"
    | "available"
    | "in_progress"
    | "waiting"
    | "completed"
    | "cancelled";
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartedAt: Date | null;
  actualCompletedAt: Date | null;
  nextAttentionAt: Date | null;
};

export function buildRemainingProductionSchedule(
  deliveryAt: Date,
  tasks: ReplannableProductionTask[],
  bufferMinutes: number,
  earliestStartAt = new Date(),
) {
  const movableTasks = tasks.filter(
    (task) => task.status === "planned" || task.status === "available",
  );
  const plannedFinishAt = new Date(
    deliveryAt.getTime() - bufferMinutes * 60_000,
  );
  const remainingDurationMinutes = movableTasks.reduce(
    (total, task) => total + task.durationMinutes,
    0,
  );
  const recommendedStartAt = new Date(
    plannedFinishAt.getTime() - remainingDurationMinutes * 60_000,
  );
  const fixedBoundaryAt = tasks
    .filter(
      (task) =>
        task.status !== "planned" &&
        task.status !== "available" &&
        task.status !== "cancelled",
    )
    .reduce((latest, task) => {
      const boundary =
        task.actualCompletedAt ??
        task.nextAttentionAt ??
        task.plannedEndAt ??
        task.actualStartedAt;
      return boundary && boundary > latest ? boundary : latest;
    }, earliestStartAt);

  if (movableTasks.length === 0) {
    return {
      feasible: false as const,
      reason: "NO_REMAINING_TASKS" as const,
      plannedFinishAt,
      recommendedStartAt,
      fixedBoundaryAt,
      tasks: [],
    };
  }

  if (recommendedStartAt < fixedBoundaryAt) {
    return {
      feasible: false as const,
      reason: "INSUFFICIENT_TIME" as const,
      plannedFinishAt,
      recommendedStartAt,
      fixedBoundaryAt,
      tasks: [],
    };
  }

  let cursor = new Date(recommendedStartAt);
  return {
    feasible: true as const,
    plannedFinishAt,
    recommendedStartAt,
    fixedBoundaryAt,
    tasks: movableTasks.map((task) => {
      const plannedStartAt = new Date(cursor);
      cursor = new Date(cursor.getTime() + task.durationMinutes * 60_000);
      return {
        id: task.id,
        plannedStartAt,
        plannedEndAt: new Date(cursor),
      };
    }),
  };
}

export function buildProductionSchedule(
  deliveryAt: Date,
  moments: ProductionSourceMoment[],
  bufferMinutes = 60,
) {
  const orderedMoments = [...moments].sort(
    (left, right) => left.position - right.position,
  );
  const orderedSteps = orderedMoments.flatMap((moment) =>
    [...moment.steps]
      .sort((left, right) => left.position - right.position)
      .map((step) => ({ ...step, momentId: moment.id })),
  );
  const hasExplicitDependencies = orderedSteps.some(
    (step) => (step.predecessorStepIds?.length ?? 0) > 0,
  );
  const predecessors = new Map<string, string[]>();
  orderedSteps.forEach((step, index) => {
    predecessors.set(
      step.id,
      hasExplicitDependencies
        ? (step.predecessorStepIds ?? [])
        : index > 0
          ? [orderedSteps[index - 1]!.id]
          : [],
    );
  });
  const pending = new Set(orderedSteps.map((step) => step.id));
  const orderedByDependency: typeof orderedSteps = [];
  while (pending.size > 0) {
    const ready = orderedSteps.filter(
      (step) =>
        pending.has(step.id) &&
        (predecessors.get(step.id) ?? []).every(
          (predecessorId) => !pending.has(predecessorId),
        ),
    );
    if (ready.length === 0) {
      throw new Error("As etapas da receita formam um ciclo.");
    }
    ready.forEach((step) => {
      pending.delete(step.id);
      orderedByDependency.push(step);
    });
  }
  const relativeSchedule = new Map<
    string,
    { startMinutes: number; endMinutes: number }
  >();
  orderedByDependency.forEach((step) => {
    const startMinutes = Math.max(
      0,
      ...(predecessors.get(step.id) ?? []).map(
        (predecessorId) => relativeSchedule.get(predecessorId)?.endMinutes ?? 0,
      ),
    );
    relativeSchedule.set(step.id, {
      startMinutes,
      endMinutes: startMinutes + step.durationMinutes,
    });
  });
  const totalDurationMinutes = Math.max(
    0,
    ...[...relativeSchedule.values()].map((entry) => entry.endMinutes),
  );
  const plannedFinishAt = new Date(
    deliveryAt.getTime() - bufferMinutes * 60_000,
  );
  const recommendedStartAt = new Date(
    plannedFinishAt.getTime() - totalDurationMinutes * 60_000,
  );

  return {
    bufferMinutes,
    plannedFinishAt,
    recommendedStartAt,
    moments: orderedMoments.map((moment, momentIndex) => {
      const tasks = [...moment.steps]
        .sort((left, right) => left.position - right.position)
        .map((step) => {
          const relative = relativeSchedule.get(step.id) ?? {
            startMinutes: 0,
            endMinutes: step.durationMinutes,
          };
          const predecessorStepIds = predecessors.get(step.id) ?? [];
          return {
            ...step,
            predecessorStepIds,
            plannedStartAt: new Date(
              recommendedStartAt.getTime() + relative.startMinutes * 60_000,
            ),
            plannedEndAt: new Date(
              recommendedStartAt.getTime() + relative.endMinutes * 60_000,
            ),
            status:
              predecessorStepIds.length === 0
                ? ("available" as const)
                : ("planned" as const),
          };
        });
      const plannedStartAt = new Date(
        Math.min(...tasks.map((task) => task.plannedStartAt.getTime())),
      );
      const plannedEndAt = new Date(
        Math.max(...tasks.map((task) => task.plannedEndAt.getTime())),
      );
      return {
        ...moment,
        plannedStartAt,
        plannedEndAt,
        status: tasks.some((task) => task.status === "available")
          ? ("available" as const)
          : momentIndex === 0
            ? ("available" as const)
            : ("pending" as const),
        tasks,
      };
    }),
  };
}

export async function instantiateProductionPlan(
  transaction: AppTransaction,
  input: {
    tenantId: string;
    orderId: string;
    orderItemId: string;
    recipeVersionId: string;
    productName: string;
    scaleFactor: number;
    productionMassG: number;
    deliveryAt: Date;
  },
) {
  const [
    sourceMoments,
    sourceSteps,
    sourceDependencies,
    allMoments,
    allSteps,
    allDependencies,
    allSubrecipes,
    allVersions,
    allRecipes,
    assets,
    unavailablePeriods,
    existingTasks,
  ] = await Promise.all([
    transaction
      .select()
      .from(recipeMoments)
      .where(eq(recipeMoments.recipeVersionId, input.recipeVersionId))
      .orderBy(asc(recipeMoments.position)),
    transaction
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeVersionId, input.recipeVersionId))
      .orderBy(asc(recipeSteps.position)),
    transaction
      .select()
      .from(recipeStepDependencies)
      .where(eq(recipeStepDependencies.recipeVersionId, input.recipeVersionId)),
    transaction.select().from(recipeMoments),
    transaction.select().from(recipeSteps),
    transaction.select().from(recipeStepDependencies),
    transaction.select().from(recipeSubrecipeLines),
    transaction.select().from(recipeVersions),
    transaction.select().from(recipes),
    transaction.select().from(equipmentAssets),
    transaction.select().from(equipmentUnavailability),
    transaction.select().from(productionTasks),
  ]);

  const composedPreparations: ComposedPreparation[] = [];
  const composedTasksByRootMoment = new Map<
    string,
    ProductionSourceMoment["steps"]
  >();
  const composedDependencies: Array<{
    predecessorStepId: string;
    successorStepId: string;
  }> = [];

  const dependenciesForVersion = (versionId: string) => {
    const versionSteps = allSteps
      .filter((step) => step.recipeVersionId === versionId)
      .sort((left, right) => {
        const leftMoment = allMoments.find(
          (moment) => moment.id === left.recipeMomentId,
        );
        const rightMoment = allMoments.find(
          (moment) => moment.id === right.recipeMomentId,
        );
        return (
          (leftMoment?.position ?? 0) - (rightMoment?.position ?? 0) ||
          left.position - right.position
        );
      });
    const explicit = allDependencies.filter(
      (dependency) => dependency.recipeVersionId === versionId,
    );
    if (explicit.length > 0) return explicit;
    return versionSteps.slice(1).map((step, index) => ({
      predecessorStepId: versionSteps[index]!.id,
      successorStepId: step.id,
    }));
  };

  const expandComponent = (
    line: typeof recipeSubrecipeLines.$inferSelect,
    hostRootMomentId: string,
    path: string,
    parentPreparationKey: string,
    parentScaleFactor: number,
    activeVersionIds: Set<string>,
  ): { entryIds: string[]; terminalIds: string[] } => {
    if (activeVersionIds.has(line.referencedRecipeVersionId)) {
      throw new Error("As receitas componentes formam um ciclo.");
    }
    const version = allVersions.find(
      (entry) => entry.id === line.referencedRecipeVersionId,
    );
    if (!version || version.status !== "published") {
      throw new Error("Uma receita componente publicada não foi encontrada.");
    }
    const recipe = allRecipes.find((entry) => entry.id === version.recipeId);
    if (!recipe) throw new Error("A receita componente não foi encontrada.");

    const componentScaleFactor =
      (line.requiredYieldG * parentScaleFactor) / version.yieldMassG;
    const preparationKey = `component:${path}`;
    composedPreparations.push({
      key: preparationKey,
      parentKey: parentPreparationKey,
      sourceRecipeVersionId: version.id,
      name: recipe.name,
      expectedOutputG: line.requiredYieldG * parentScaleFactor,
    });

    const versionMoments = allMoments
      .filter((moment) => moment.recipeVersionId === version.id)
      .sort((left, right) => left.position - right.position);
    const versionSteps = versionMoments.flatMap((moment) =>
      allSteps
        .filter((step) => step.recipeMomentId === moment.id)
        .sort((left, right) => left.position - right.position),
    );
    const instanceIdBySourceStep = new Map(
      versionSteps.map((step) => [step.id, `${preparationKey}:${step.id}`]),
    );
    const localDependencies = dependenciesForVersion(version.id).flatMap(
      (dependency) => {
        const predecessorStepId = instanceIdBySourceStep.get(
          dependency.predecessorStepId,
        );
        const successorStepId = instanceIdBySourceStep.get(
          dependency.successorStepId,
        );
        return predecessorStepId && successorStepId
          ? [{ predecessorStepId, successorStepId }]
          : [];
      },
    );
    composedDependencies.push(...localDependencies);

    const target = composedTasksByRootMoment.get(hostRootMomentId) ?? [];
    target.push(
      ...versionSteps.map((step) => ({
        id: instanceIdBySourceStep.get(step.id)!,
        sourceStepId: step.id,
        name: step.name,
        instructions: step.instructions,
        kind: step.kind,
        requiredEquipmentKind: step.requiredEquipmentKind,
        durationMinutes: step.durationMinutes,
        parallelizable: step.parallelizable,
        attentionRequiredAtEnd: step.attentionRequiredAtEnd,
        position: target.length + step.position,
        preparationKey,
        preparationName: recipe.name,
        preparationVersionId: version.id,
        preparationExpectedOutputG: line.requiredYieldG * parentScaleFactor,
        preparationParentKey: parentPreparationKey,
      })),
    );
    composedTasksByRootMoment.set(hostRootMomentId, target);

    const nextActive = new Set(activeVersionIds).add(version.id);
    for (const childLine of allSubrecipes
      .filter((entry) => entry.recipeVersionId === version.id)
      .sort((left, right) => left.position - right.position)) {
      const child = expandComponent(
        childLine,
        hostRootMomentId,
        `${path}/${childLine.id}`,
        preparationKey,
        componentScaleFactor,
        nextActive,
      );
      const targetMomentStepIds = new Set(
        versionSteps
          .filter((step) => step.recipeMomentId === childLine.recipeMomentId)
          .map((step) => instanceIdBySourceStep.get(step.id)!),
      );
      const localPredecessorIds = new Set(
        localDependencies
          .filter(
            (dependency) =>
              targetMomentStepIds.has(dependency.predecessorStepId) &&
              targetMomentStepIds.has(dependency.successorStepId),
          )
          .map((dependency) => dependency.successorStepId),
      );
      const targetEntries = [...targetMomentStepIds].filter(
        (stepId) => !localPredecessorIds.has(stepId),
      );
      for (const predecessorStepId of child.terminalIds) {
        for (const successorStepId of targetEntries) {
          composedDependencies.push({ predecessorStepId, successorStepId });
        }
      }
    }

    const instanceIds = new Set(instanceIdBySourceStep.values());
    const predecessorIds = new Set(
      composedDependencies
        .filter((dependency) => instanceIds.has(dependency.successorStepId))
        .map((dependency) => dependency.successorStepId),
    );
    const successorIds = new Set(
      composedDependencies
        .filter((dependency) => instanceIds.has(dependency.predecessorStepId))
        .map((dependency) => dependency.predecessorStepId),
    );
    return {
      entryIds: [...instanceIds].filter((id) => !predecessorIds.has(id)),
      terminalIds: [...instanceIds].filter((id) => !successorIds.has(id)),
    };
  };

  const rootIdBySourceStep = new Map(
    sourceSteps.map((step) => [step.id, `root:${step.id}`]),
  );
  const rootDependencies = (
    sourceDependencies.length > 0
      ? sourceDependencies
      : dependenciesForVersion(input.recipeVersionId)
  ).flatMap((dependency) => {
    const predecessorStepId = rootIdBySourceStep.get(
      dependency.predecessorStepId,
    );
    const successorStepId = rootIdBySourceStep.get(dependency.successorStepId);
    return predecessorStepId && successorStepId
      ? [{ predecessorStepId, successorStepId }]
      : [];
  });
  composedDependencies.push(...rootDependencies);

  for (const line of allSubrecipes
    .filter((entry) => entry.recipeVersionId === input.recipeVersionId)
    .sort((left, right) => left.position - right.position)) {
    const component = expandComponent(
      line,
      line.recipeMomentId,
      line.id,
      "root",
      input.scaleFactor,
      new Set([input.recipeVersionId]),
    );
    const targetMomentStepIds = new Set(
      sourceSteps
        .filter((step) => step.recipeMomentId === line.recipeMomentId)
        .map((step) => rootIdBySourceStep.get(step.id)!),
    );
    const targetEntries = [...targetMomentStepIds].filter((stepId) =>
      rootDependencies.every(
        (dependency) =>
          dependency.successorStepId !== stepId ||
          !targetMomentStepIds.has(dependency.predecessorStepId),
      ),
    );
    for (const predecessorStepId of component.terminalIds) {
      for (const successorStepId of targetEntries) {
        composedDependencies.push({ predecessorStepId, successorStepId });
      }
    }
  }

  const schedule = buildProductionSchedule(
    input.deliveryAt,
    sourceMoments.map((moment) => ({
      id: moment.id,
      name: moment.name,
      preparationRole: moment.preparationRole,
      position: moment.position,
      steps: [
        ...(composedTasksByRootMoment.get(moment.id) ?? []),
        ...sourceSteps
          .filter((step) => step.recipeMomentId === moment.id)
          .map((step) => ({
            id: rootIdBySourceStep.get(step.id)!,
            sourceStepId: step.id,
            name: step.name,
            instructions: step.instructions,
            kind: step.kind,
            requiredEquipmentKind: step.requiredEquipmentKind,
            durationMinutes: step.durationMinutes,
            parallelizable: step.parallelizable,
            attentionRequiredAtEnd: step.attentionRequiredAtEnd,
            position: step.position,
            preparationKey:
              moment.preparationRole === "intermediate"
                ? `root-moment:${moment.id}`
                : "root",
            predecessorStepIds: composedDependencies
              .filter(
                (dependency) =>
                  dependency.successorStepId ===
                  rootIdBySourceStep.get(step.id),
              )
              .map((dependency) => dependency.predecessorStepId),
          })),
      ].map((step, position) => ({
        ...step,
        position,
        predecessorStepIds: composedDependencies
          .filter((dependency) => dependency.successorStepId === step.id)
          .map((dependency) => dependency.predecessorStepId),
      })),
    })),
  );
  const allocations = allocateEquipmentForTasks(
    schedule.moments.flatMap((moment) =>
      moment.tasks.map((task) => ({
        id: task.id,
        requiredEquipmentKind: task.requiredEquipmentKind,
        plannedStartAt: task.plannedStartAt,
        plannedEndAt: task.plannedEndAt,
      })),
    ),
    assets,
    existingTasks.flatMap((task) =>
      task.equipmentId
        ? [
            {
              taskId: task.id,
              equipmentId: task.equipmentId,
              plannedStartAt: task.plannedStartAt,
              plannedEndAt: task.plannedEndAt,
              status: task.status,
            },
          ]
        : [],
    ),
    unavailablePeriods,
  );
  const equipmentBySourceStep = new Map(
    allocations.map((allocation) => [
      allocation.taskId,
      allocation.equipmentId,
    ]),
  );

  const [plan] = await transaction
    .insert(productionPlans)
    .values({
      tenantId: input.tenantId,
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      recipeVersionId: input.recipeVersionId,
      productNameSnapshot: input.productName,
      scaleFactor: input.scaleFactor,
      productionMassG: input.productionMassG,
      deliveryAt: input.deliveryAt,
      recommendedStartAt: schedule.recommendedStartAt,
      plannedFinishAt: schedule.plannedFinishAt,
      bufferMinutes: schedule.bufferMinutes,
    })
    .returning();
  if (!plan) throw new Error("Não foi possível criar o plano de produção.");

  const [rootPreparation] = await transaction
    .insert(preparationInstances)
    .values({
      tenantId: input.tenantId,
      productionPlanId: plan.id,
      sourceRecipeVersionId: input.recipeVersionId,
      nameSnapshot: input.productName,
      kind: "final",
      dedicatedToOrder: true,
      expectedOutputBase: input.productionMassG,
    })
    .returning();
  if (!rootPreparation)
    throw new Error("Não foi possível identificar o produto final do plano.");

  const preparationIdByKey = new Map<string, string>([
    ["root", rootPreparation.id],
  ]);
  for (const component of composedPreparations) {
    const parentPreparationInstanceId = preparationIdByKey.get(
      component.parentKey,
    );
    if (!parentPreparationInstanceId) {
      throw new Error(
        "A preparação superior do componente não foi encontrada.",
      );
    }
    const [storedPreparation] = await transaction
      .insert(preparationInstances)
      .values({
        tenantId: input.tenantId,
        productionPlanId: plan.id,
        parentPreparationInstanceId,
        sourceRecipeVersionId: component.sourceRecipeVersionId,
        nameSnapshot: component.name,
        kind: "intermediate",
        dedicatedToOrder: true,
        expectedOutputBase: component.expectedOutputG,
      })
      .returning();
    if (!storedPreparation) {
      throw new Error("Não foi possível criar a preparação componente.");
    }
    preparationIdByKey.set(component.key, storedPreparation.id);
  }

  const taskIdBySourceStep = new Map<string, string>();
  for (const moment of schedule.moments) {
    const [storedMoment] = await transaction
      .insert(productionMoments)
      .values({
        tenantId: input.tenantId,
        productionPlanId: plan.id,
        sourceRecipeMomentId: moment.id,
        nameSnapshot: moment.name,
        position: moment.position,
        plannedStartAt: moment.plannedStartAt,
        plannedEndAt: moment.plannedEndAt,
        status: moment.status,
      })
      .returning();
    if (!storedMoment) continue;
    const momentPreparation =
      moment.preparationRole === "intermediate"
        ? (
            await transaction
              .insert(preparationInstances)
              .values({
                tenantId: input.tenantId,
                productionPlanId: plan.id,
                productionMomentId: storedMoment.id,
                parentPreparationInstanceId: rootPreparation.id,
                sourceRecipeVersionId: input.recipeVersionId,
                sourceRecipeMomentId: moment.id,
                nameSnapshot: moment.name,
                kind: "intermediate",
                dedicatedToOrder: true,
              })
              .returning()
          )[0]
        : rootPreparation;
    if (!momentPreparation)
      throw new Error("Não foi possível criar a preparação deste momento.");
    preparationIdByKey.set(
      moment.preparationRole === "intermediate"
        ? `root-moment:${moment.id}`
        : "root",
      momentPreparation.id,
    );
    if (moment.tasks.length > 0) {
      const storedTasks = await transaction
        .insert(productionTasks)
        .values(
          moment.tasks.map((task) => ({
            tenantId: input.tenantId,
            productionPlanId: plan.id,
            productionMomentId: storedMoment.id,
            preparationInstanceId:
              preparationIdByKey.get(task.preparationKey ?? "root") ??
              momentPreparation.id,
            sourceRecipeStepId: task.sourceStepId ?? task.id,
            nameSnapshot: task.name,
            instructionsSnapshot: task.instructions,
            kind: task.kind,
            requiredEquipmentKind: task.requiredEquipmentKind,
            equipmentId: equipmentBySourceStep.get(task.id) ?? null,
            durationMinutes: task.durationMinutes,
            parallelizable: task.parallelizable,
            attentionRequiredAtEnd: task.attentionRequiredAtEnd,
            position: task.position,
            plannedStartAt: task.plannedStartAt,
            plannedEndAt: task.plannedEndAt,
            status: task.status,
          })),
        )
        .returning({
          id: productionTasks.id,
          sourceRecipeStepId: productionTasks.sourceRecipeStepId,
        });
      storedTasks.forEach((task, index) => {
        const sourceTask = moment.tasks[index];
        if (sourceTask) taskIdBySourceStep.set(sourceTask.id, task.id);
      });
    }
  }
  const scheduledDependencies = schedule.moments.flatMap((moment) =>
    moment.tasks.flatMap((task) =>
      task.predecessorStepIds.map((predecessorStepId) => ({
        predecessorStepId,
        successorStepId: task.id,
      })),
    ),
  );
  const taskDependencies = scheduledDependencies.flatMap((dependency) => {
    const predecessorTaskId = taskIdBySourceStep.get(
      dependency.predecessorStepId,
    );
    const successorTaskId = taskIdBySourceStep.get(dependency.successorStepId);
    return predecessorTaskId && successorTaskId
      ? [
          {
            tenantId: input.tenantId,
            productionPlanId: plan.id,
            predecessorTaskId,
            successorTaskId,
          },
        ]
      : [];
  });
  if (taskDependencies.length > 0) {
    await transaction
      .insert(productionTaskDependencies)
      .values(taskDependencies);
  }
  return plan;
}
