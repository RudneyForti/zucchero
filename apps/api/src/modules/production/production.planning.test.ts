import { describe, expect, it } from "vitest";
import {
  allocateEquipmentForTasks,
  buildProductionSchedule,
  buildRemainingProductionSchedule,
} from "./production.planning";

describe("buildProductionSchedule", () => {
  it("planeja os momentos em sequência, de trás para frente a partir da entrega", () => {
    const deliveryAt = new Date("2026-08-26T20:30:00.000Z");
    const schedule = buildProductionSchedule(deliveryAt, [
      {
        id: "massa",
        name: "Massa",
        preparationRole: "intermediate",
        position: 0,
        steps: [
          {
            id: "assar",
            name: "Assar",
            instructions: "Asse.",
            kind: "oven",
            requiredEquipmentKind: "oven",
            durationMinutes: 55,
            parallelizable: false,
            attentionRequiredAtEnd: true,
            position: 0,
          },
        ],
      },
      {
        id: "montagem",
        name: "Montagem",
        preparationRole: "final",
        position: 1,
        steps: [
          {
            id: "montar",
            name: "Montar",
            instructions: "Monte.",
            kind: "assembly",
            requiredEquipmentKind: null,
            durationMinutes: 40,
            parallelizable: false,
            attentionRequiredAtEnd: true,
            position: 0,
          },
        ],
      },
    ]);

    expect(schedule.plannedFinishAt.toISOString()).toBe(
      "2026-08-26T19:30:00.000Z",
    );
    expect(schedule.recommendedStartAt.toISOString()).toBe(
      "2026-08-26T17:55:00.000Z",
    );
    expect(schedule.moments[0]?.status).toBe("available");
    expect(schedule.moments[0]?.tasks[0]?.status).toBe("available");
    expect(schedule.moments[1]?.status).toBe("pending");
    expect(schedule.moments[1]?.plannedStartAt.toISOString()).toBe(
      "2026-08-26T18:50:00.000Z",
    );
  });

  it("abre ramos independentes em paralelo e respeita a convergência", () => {
    const deliveryAt = new Date("2026-08-26T20:30:00.000Z");
    const common = {
      instructions: "Prepare.",
      kind: "active" as const,
      requiredEquipmentKind: null,
      parallelizable: true,
      attentionRequiredAtEnd: true,
    };
    const schedule = buildProductionSchedule(deliveryAt, [
      {
        id: "preparo",
        name: "Preparo",
        preparationRole: "final",
        position: 0,
        steps: [
          {
            ...common,
            id: "massa",
            name: "Massa",
            durationMinutes: 30,
            position: 0,
          },
          {
            ...common,
            id: "ganache",
            name: "Ganache",
            durationMinutes: 45,
            position: 1,
          },
          {
            ...common,
            id: "montagem",
            name: "Montagem",
            durationMinutes: 20,
            position: 2,
            predecessorStepIds: ["massa", "ganache"],
          },
        ],
      },
    ]);

    expect(schedule.recommendedStartAt.toISOString()).toBe(
      "2026-08-26T18:25:00.000Z",
    );
    expect(schedule.moments[0]?.tasks.map((task) => task.status)).toEqual([
      "available",
      "available",
      "planned",
    ]);
    expect(schedule.moments[0]?.tasks[2]?.plannedStartAt.toISOString()).toBe(
      "2026-08-26T19:10:00.000Z",
    );
  });

  it("recusa precedências cíclicas", () => {
    expect(() =>
      buildProductionSchedule(new Date("2026-08-26T20:30:00.000Z"), [
        {
          id: "preparo",
          name: "Preparo",
          preparationRole: "final",
          position: 0,
          steps: [
            {
              id: "a",
              name: "A",
              instructions: "A.",
              kind: "active",
              requiredEquipmentKind: null,
              durationMinutes: 10,
              parallelizable: false,
              attentionRequiredAtEnd: true,
              position: 0,
              predecessorStepIds: ["b"],
            },
            {
              id: "b",
              name: "B",
              instructions: "B.",
              kind: "active",
              requiredEquipmentKind: null,
              durationMinutes: 10,
              parallelizable: false,
              attentionRequiredAtEnd: true,
              position: 1,
              predecessorStepIds: ["a"],
            },
          ],
        },
      ]),
    ).toThrow("ciclo");
  });
});

describe("allocateEquipmentForTasks", () => {
  const oven = {
    id: "forno-1",
    kind: "oven" as const,
    status: "active" as const,
    capacityUnits: 1,
  };
  const period = {
    plannedStartAt: new Date("2026-08-27T13:00:00.000Z"),
    plannedEndAt: new Date("2026-08-27T14:00:00.000Z"),
  };

  it("reserva um equipamento ativo do tipo pedido", () => {
    expect(
      allocateEquipmentForTasks(
        [{ id: "assar", requiredEquipmentKind: "oven", ...period }],
        [oven],
        [],
      ),
    ).toEqual([{ taskId: "assar", equipmentId: "forno-1" }]);
  });

  it("deixa a necessidade explícita quando o único equipamento está ocupado", () => {
    expect(
      allocateEquipmentForTasks(
        [{ id: "assar-2", requiredEquipmentKind: "oven", ...period }],
        [oven],
        [
          {
            taskId: "assar-1",
            equipmentId: "forno-1",
            ...period,
            status: "planned",
          },
        ],
      ),
    ).toEqual([{ taskId: "assar-2", equipmentId: null }]);
  });

  it("ignora reservas concluídas ao montar um novo plano", () => {
    expect(
      allocateEquipmentForTasks(
        [{ id: "assar-2", requiredEquipmentKind: "oven", ...period }],
        [oven],
        [
          {
            taskId: "assar-1",
            equipmentId: "forno-1",
            ...period,
            status: "completed",
          },
        ],
      ),
    ).toEqual([{ taskId: "assar-2", equipmentId: "forno-1" }]);
  });

  it("respeita capacidade simultânea e indisponibilidade programada", () => {
    const first = {
      taskId: "assar-1",
      equipmentId: "forno-1",
      ...period,
      status: "planned" as const,
    };
    expect(
      allocateEquipmentForTasks(
        [{ id: "assar-2", requiredEquipmentKind: "oven", ...period }],
        [{ ...oven, capacityUnits: 2 }],
        [first],
      ),
    ).toEqual([{ taskId: "assar-2", equipmentId: "forno-1" }]);
    expect(
      allocateEquipmentForTasks(
        [{ id: "assar-3", requiredEquipmentKind: "oven", ...period }],
        [{ ...oven, capacityUnits: 2 }],
        [first],
        [
          {
            equipmentId: "forno-1",
            startsAt: period.plannedStartAt,
            endsAt: period.plannedEndAt,
          },
        ],
      ),
    ).toEqual([{ taskId: "assar-3", equipmentId: null }]);
  });
});

describe("buildRemainingProductionSchedule", () => {
  const baseTask = {
    productionMomentId: "massa",
    actualStartedAt: null,
    actualCompletedAt: null,
    nextAttentionAt: null,
  };

  it("move somente o trabalho ainda não iniciado", () => {
    const completedEnd = new Date("2026-08-26T14:00:00.000Z");
    const schedule = buildRemainingProductionSchedule(
      new Date("2026-08-27T20:00:00.000Z"),
      [
        {
          ...baseTask,
          id: "concluida",
          durationMinutes: 30,
          status: "completed",
          plannedStartAt: new Date("2026-08-26T13:30:00.000Z"),
          plannedEndAt: completedEnd,
          actualStartedAt: new Date("2026-08-26T13:25:00.000Z"),
          actualCompletedAt: completedEnd,
        },
        {
          ...baseTask,
          id: "ganache",
          durationMinutes: 45,
          status: "available",
          plannedStartAt: new Date("2026-08-26T14:00:00.000Z"),
          plannedEndAt: new Date("2026-08-26T14:45:00.000Z"),
        },
        {
          ...baseTask,
          id: "montagem",
          durationMinutes: 60,
          status: "planned",
          plannedStartAt: new Date("2026-08-26T14:45:00.000Z"),
          plannedEndAt: new Date("2026-08-26T15:45:00.000Z"),
        },
      ],
      60,
      new Date("2026-08-26T12:00:00.000Z"),
    );

    expect(schedule.feasible).toBe(true);
    if (!schedule.feasible) return;
    expect(schedule.tasks.map((task) => task.id)).toEqual([
      "ganache",
      "montagem",
    ]);
    expect(schedule.recommendedStartAt.toISOString()).toBe(
      "2026-08-27T17:15:00.000Z",
    );
    expect(schedule.tasks[1]?.plannedEndAt.toISOString()).toBe(
      "2026-08-27T19:00:00.000Z",
    );
  });

  it("recusa um prazo que colide com o trabalho já iniciado", () => {
    const schedule = buildRemainingProductionSchedule(
      new Date("2026-08-26T15:00:00.000Z"),
      [
        {
          ...baseTask,
          id: "forno",
          durationMinutes: 60,
          status: "waiting",
          plannedStartAt: new Date("2026-08-26T13:00:00.000Z"),
          plannedEndAt: new Date("2026-08-26T14:00:00.000Z"),
          actualStartedAt: new Date("2026-08-26T13:10:00.000Z"),
          nextAttentionAt: new Date("2026-08-26T14:30:00.000Z"),
        },
        {
          ...baseTask,
          id: "montagem",
          durationMinutes: 45,
          status: "planned",
          plannedStartAt: new Date("2026-08-26T14:00:00.000Z"),
          plannedEndAt: new Date("2026-08-26T14:45:00.000Z"),
        },
      ],
      30,
      new Date("2026-08-26T12:00:00.000Z"),
    );

    expect(schedule.feasible).toBe(false);
    if (schedule.feasible) return;
    expect(schedule.reason).toBe("INSUFFICIENT_TIME");
  });
});
