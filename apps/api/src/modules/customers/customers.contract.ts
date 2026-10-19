import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .optional()
    .transform((value) => value || null);

const optionalPostalCode = z
  .string()
  .trim()
  .max(9)
  .nullable()
  .optional()
  .refine(
    (value) => !value || value.replace(/\D/g, "").length === 8,
    "Informe um CEP com oito dígitos.",
  )
  .transform((value) => value || null);

export const customerAddressSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(80),
  recipient: z.string().trim().min(2).max(160),
  formattedAddress: z.string().trim().min(8).max(500),
  postalCode: optionalPostalCode,
  street: optionalText(240),
  addressNumber: optionalText(40),
  addressComplement: optionalText(160),
  neighborhood: optionalText(160),
  city: optionalText(160),
  state: optionalText(2),
  deliveryInstructions: optionalText(500),
  isDefault: z.boolean().default(false),
});

export const saveCustomerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  primaryPhone: z.string().trim().min(8).max(40),
  email: z.string().trim().email().max(254).nullable().optional(),
  notes: optionalText(1_000),
  preferredDeliveryMode: z.enum(["delivery", "pickup"]).nullable().optional(),
  preferredPaymentMethod: z.enum(["pix", "card", "cash"]).nullable().optional(),
  addresses: z.array(customerAddressSchema).max(5).default([]),
});

export type SaveCustomerInput = z.infer<typeof saveCustomerSchema>;

export type CustomerAddress = {
  id: string;
  label: string;
  recipient: string;
  formattedAddress: string;
  postalCode: string | null;
  street: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  deliveryInstructions: string | null;
  isDefault: boolean;
};

export type CustomerProfile = {
  id: string;
  name: string;
  primaryPhone: string;
  email: string | null;
  notes: string | null;
  preferredDeliveryMode: "delivery" | "pickup" | null;
  preferredPaymentMethod: "pix" | "card" | "cash" | null;
  addresses: CustomerAddress[];
  orderCount: number;
  lastOrderAt: string | null;
};

export type CustomerWorkspace = {
  summary: {
    customerCount: number;
    deliveryReadyCount: number;
    returningCount: number;
  };
  customers: CustomerProfile[];
};

export type SaveCustomerResult = {
  message: string;
  customer: CustomerProfile;
  workspace: CustomerWorkspace;
};

export const anonymizeCustomerSchema = z.object({
  confirmation: z.literal("ANONIMIZAR"),
  reason: z.string().trim().min(5).max(500),
});

export type AnonymizeCustomerInput = z.infer<typeof anonymizeCustomerSchema>;

export type CustomerPrivacyExport = {
  generatedAt: string;
  customer: CustomerProfile;
  orders: Array<{
    number: number;
    status: string;
    confirmedAt: string;
    deliveryAt: string;
    deliveryMode: string;
    address: unknown;
    items: Array<{
      recipeName: string;
      recipeVersionNumber: number;
      requestedMassG: number;
      price: number;
    }>;
    receipts: Array<{
      kind: string;
      amount: number;
      feeAmount: number;
      paymentMethod: string;
      receivedAt: string;
    }>;
  }>;
};
