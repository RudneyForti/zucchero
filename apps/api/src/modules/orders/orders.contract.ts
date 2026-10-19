import { z } from "zod";
import type {
  ConsumptionVariance,
  ConsumptionVarianceStatus,
} from "../production/production.variance";
import type { OrderCostResult } from "./orders.cost-result";
import type { OrderDirectExpenseResult } from "./orders.direct-expense-result";
import type { OrderPaymentResult } from "./orders.payment-result";

export const deliveryArrangementValues = [
  "own",
  "customer_arranged",
  "integrated_partner",
] as const;

export type DeliveryArrangement = (typeof deliveryArrangementValues)[number];

export const confirmOrderSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    customerId: z.string().uuid(),
    customerName: z.string().trim().min(2).max(160),
    customerPhone: z.string().trim().min(8).max(40),
    deliveryMode: z.enum(["delivery", "pickup"]),
    deliveryArrangement: z.enum(deliveryArrangementValues).optional(),
    deliveryProvider: z.string().trim().min(2).max(80).optional(),
    addressLabel: z.string().trim().max(80).optional(),
    address: z.string().trim().max(500).optional(),
    customerAddressId: z.string().uuid().optional(),
    deliveryQuoteToken: z.string().min(20).max(4_000).optional(),
    deliveryAt: z.string().datetime({ offset: true }),
    notes: z.string().trim().max(1_000).optional(),
    recipeId: z.string().uuid(),
    recipeVersionNumber: z.number().int().positive(),
    requestedMassG: z.number().positive().max(1_000_000),
    productionIncrementG: z.number().int().positive().max(10_000).default(50),
    additionalCost: z.number().min(0).max(1_000_000).default(0),
    targetMarginPercentage: z.number().min(0).max(90),
    depositPercentage: z.number().min(0).max(100).default(0),
    paymentMethod: z.enum(["pix", "card", "cash"]),
  })
  .superRefine((value, context) => {
    if (
      value.deliveryMode === "delivery" &&
      !value.address &&
      !value.customerAddressId
    ) {
      context.addIssue({
        code: "custom",
        path: ["address"],
        message: "Informe o endereço combinado para a entrega.",
      });
    }
    if (value.deliveryMode === "pickup" && value.deliveryArrangement) {
      context.addIssue({
        code: "custom",
        path: ["deliveryArrangement"],
        message: "Retirada não precisa de responsável pela entrega.",
      });
    }
    if (
      value.deliveryMode === "delivery" &&
      value.deliveryArrangement === "integrated_partner" &&
      !value.deliveryProvider
    ) {
      context.addIssue({
        code: "custom",
        path: ["deliveryProvider"],
        message: "Informe a plataforma conectada para esta entrega.",
      });
    }
  });

export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;

export const deliveryQuoteRequestSchema = z.object({
  customerId: z.string().uuid(),
  customerAddressId: z.string().uuid(),
});

export type DeliveryQuoteRequest = z.infer<typeof deliveryQuoteRequestSchema>;

export type DeliveryQuote = {
  distanceKm: number;
  durationMinutes: number;
  costPerKm: number;
  deliveryCost: number;
  quoteToken: string;
  provider: "google_maps";
  attribution: "Google Maps";
  mapImageDataUrl?: string;
};

export const orderLifecycleStatuses = [
  "confirmed",
  "in_production",
  "ready",
  "completed",
  "cancelled",
] as const;

export type OrderLifecycleStatus = (typeof orderLifecycleStatuses)[number];

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(["in_production", "ready", "completed", "cancelled"]),
    cancellationReason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.status === "cancelled" &&
      (!value.cancellationReason || value.cancellationReason.length < 3)
    ) {
      context.addIssue({
        code: "custom",
        path: ["cancellationReason"],
        message: "Conte brevemente por que o pedido foi cancelado.",
      });
    }
  });

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const replanOrderSchema = z.object({
  deliveryAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(300).optional(),
});

export type ReplanOrderInput = z.infer<typeof replanOrderSchema>;

export const registerReceiptSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    amount: z.number().positive().max(1_000_000),
    feeAmount: z.number().min(0).max(1_000_000).default(0),
    paymentMethod: z.enum(["pix", "card", "cash"]),
    receivedAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((value, context) => {
    if (value.feeAmount > value.amount) {
      context.addIssue({
        code: "custom",
        path: ["feeAmount"],
        message: "A taxa não pode superar o valor recebido.",
      });
    }
  });

export type RegisterReceiptInput = z.infer<typeof registerReceiptSchema>;

export const reverseReceiptSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export type ReverseReceiptInput = z.infer<typeof reverseReceiptSchema>;

export const orderDirectExpenseCategories = [
  "packaging",
  "delivery",
  "decoration",
  "outsourced_service",
  "other",
] as const;

export const registerDirectExpenseSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    category: z.enum(orderDirectExpenseCategories),
    description: z.string().trim().min(2).max(160),
    actualAmount: z.number().positive().max(1_000_000),
    estimatedAmount: z.number().min(0).max(1_000_000).default(0),
    incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((value, context) => {
    const [year, month, day] = value.incurredAt.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== (month ?? 1) - 1 ||
      date.getUTCDate() !== day
    ) {
      context.addIssue({
        code: "custom",
        path: ["incurredAt"],
        message: "Informe uma data válida.",
      });
    }
  });

export type RegisterDirectExpenseInput = z.infer<
  typeof registerDirectExpenseSchema
>;

export const reverseDirectExpenseSchema = reverseReceiptSchema;
export type ReverseDirectExpenseInput = z.infer<
  typeof reverseDirectExpenseSchema
>;

export type OrderAvailability =
  "available" | "substitution" | "partial" | "unavailable";

export type OrderSummary = {
  id: string;
  orderNumber: number;
  status: OrderLifecycleStatus;
  customerName: string;
  recipeName: string;
  recipeVersionNumber: number;
  requestedMassG: number;
  deliveryMode: "delivery" | "pickup";
  deliveryArrangement: DeliveryArrangement | null;
  deliveryProvider: string | null;
  paymentMethod: "pix" | "card" | "cash";
  deliveryAt: string;
  price: number;
  availability: OrderAvailability;
  purchaseNeedCount: number;
  confirmedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  deliveryCost: number;
  costResult: OrderCostResult;
  paymentResult: OrderPaymentResult;
  directExpenseResult: OrderDirectExpenseResult;
  productionVariance:
    | (ConsumptionVariance & {
        status: ConsumptionVarianceStatus;
        confirmedLineCount: number;
        totalLineCount: number;
        complete: boolean;
      })
    | null;
};

export type OrderWorkspace = {
  summary: {
    activeCount: number;
    inProductionCount: number;
    readyCount: number;
    purchasePendingCount: number;
  };
  orders: OrderSummary[];
};

export type ConfirmOrderResult = {
  message: string;
  order: OrderSummary;
  workspace: OrderWorkspace;
  repeated: boolean;
};

export type UpdateOrderStatusResult = {
  message: string;
  order: OrderSummary;
  workspace: OrderWorkspace;
  repeated: boolean;
};

export type ReplanOrderResult = UpdateOrderStatusResult;
export type MutateReceiptResult = UpdateOrderStatusResult;
export type MutateDirectExpenseResult = UpdateOrderStatusResult;
