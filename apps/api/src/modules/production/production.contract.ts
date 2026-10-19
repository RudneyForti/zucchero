import { z } from "zod";
import type { ConsumptionVariance } from "./production.variance";

export const productionTaskActionSchema = z.object({
  action: z.enum(["start", "wait", "resume", "complete"]),
});

export const productionNoteSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});

export const productionConsumptionSchema = z
  .object({
    lines: z
      .array(
        z.object({
          requirementId: z.string().uuid(),
          actualUsedG: z.number().min(0).max(1_000_000),
          lossG: z.number().min(0).max(1_000_000),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, context) => {
    const ids = value.lines.map((line) => line.requirementId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Cada ingrediente deve aparecer uma única vez.",
      });
    }
  });

export type ProductionTaskActionInput = z.infer<
  typeof productionTaskActionSchema
>;
export type ProductionConsumptionInput = z.infer<
  typeof productionConsumptionSchema
>;

export const productionConsumptionCorrectionSchema = z
  .object({
    reason: z.string().trim().min(5).max(500),
    lines: z
      .array(
        z.object({
          requirementId: z.string().uuid(),
          actualUsedG: z.number().min(0).max(1_000_000),
          lossG: z.number().min(0).max(1_000_000),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, context) => {
    const ids = value.lines.map((line) => line.requirementId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Cada ingrediente deve aparecer uma única vez.",
      });
    }
  });

export type ProductionConsumptionCorrectionInput = z.infer<
  typeof productionConsumptionCorrectionSchema
>;

export type ProductionBoard = {
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
    metadata: string[];
    equipment: null | {
      kind: "oven" | "mixer" | "refrigeration" | "stove" | "utensil" | "other";
      label: string;
      state: "ready" | "warning" | "missing" | "busy" | "maintenance";
      assetName: string | null;
      blocking: boolean;
      message: string;
    };
    preparation: {
      id: string;
      name: string;
      kind: "intermediate" | "final";
      dedicatedToOrder: boolean;
      parentName: string | null;
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
    steps: Array<{
      id: string;
      label: string;
      state: "done" | "current" | "pending";
    }>;
  };
  otherOrders: Array<{
    id: string;
    time: string;
    title: string;
    detail: string;
  }>;
};
