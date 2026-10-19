import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);

export const equipmentKinds = [
  "oven",
  "mixer",
  "refrigeration",
  "stove",
  "utensil",
  "other",
] as const;
export const equipmentStatuses = ["active", "maintenance", "retired"] as const;

export const createEquipmentSchema = z.object({
  idempotencyKey: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(equipmentKinds),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(100).optional(),
  purchaseDate: dateSchema.optional(),
  purchaseValue: z.number().min(0).max(10_000_000).default(0),
  capacityUnits: z.number().int().min(1).max(50).default(1),
  notes: z.string().trim().max(500).optional(),
});

export const registerEquipmentUnavailabilitySchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    path: ["endsAt"],
    message: "O fim precisa acontecer depois do início.",
  });

export const registerMaintenanceSchema = z.object({
  idempotencyKey: z.string().uuid(),
  performedAt: dateSchema,
  description: z.string().trim().min(2).max(180),
  cost: z.number().min(0).max(1_000_000).default(0),
  provider: z.string().trim().max(120).optional(),
  nextDueDate: dateSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const registerEquipmentUsageSchema = z.object({
  idempotencyKey: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  usedAt: dateSchema,
  durationMinutes: z.number().int().positive().max(100_000).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const updateEquipmentStatusSchema = z.object({
  status: z.enum(equipmentStatuses),
});

export type EquipmentKind = (typeof equipmentKinds)[number];
export type EquipmentStatus = (typeof equipmentStatuses)[number];
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type RegisterMaintenanceInput = z.infer<
  typeof registerMaintenanceSchema
>;
export type RegisterEquipmentUsageInput = z.infer<
  typeof registerEquipmentUsageSchema
>;
export type RegisterEquipmentUnavailabilityInput = z.infer<
  typeof registerEquipmentUnavailabilitySchema
>;

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
  equipment: Array<{
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
  }>;
  ordersForUsage: Array<{ id: string; label: string }>;
};

export type EquipmentMutationResult = {
  message: string;
  workspace: EquipmentWorkspace;
  repeated: boolean;
};
