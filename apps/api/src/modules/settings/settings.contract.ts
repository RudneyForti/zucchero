import { z } from "zod";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional();

export const businessDaySchema = z.object({
  day: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: optionalText(40),
  email: z.string().trim().email().max(160).optional(),
  taxDocument: optionalText(24),
  addressLine: optionalText(200),
  addressNumber: optionalText(24),
  addressComplement: optionalText(120),
  neighborhood: optionalText(100),
  city: optionalText(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  postalCode: optionalText(12),
  isCommercialPoint: z.boolean().optional(),
  logoDataUrl: z
    .string()
    .max(700_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
    .nullable()
    .optional(),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  avatarDataUrl: z
    .string()
    .max(700_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
    .nullable()
    .optional(),
});

export const confirmMfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const disableMfaSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().regex(/^\d{6}$/),
});

export const updateSalesPresetsSchema = z.object({
  defaultMarginPercentage: z.number().min(0).max(90),
  defaultDepositPercentage: z.number().min(0).max(100),
  defaultPaymentMethod: z.enum(["pix", "card", "cash"]),
  defaultDeliveryMode: z.enum(["delivery", "pickup"]),
  deliveryCostPerKm: z.number().min(0).max(10_000),
});

export const updateBusinessHoursSchema = z
  .object({ days: z.array(businessDaySchema).length(7) })
  .superRefine(({ days }, context) => {
    if (new Set(days.map((entry) => entry.day)).size !== 7) {
      context.addIssue({
        code: "custom",
        message: "Cada dia da semana deve aparecer uma única vez.",
        path: ["days"],
      });
    }
    days.forEach((entry, index) => {
      if (entry.enabled && entry.start >= entry.end) {
        context.addIssue({
          code: "custom",
          message: "O encerramento precisa acontecer depois da abertura.",
          path: ["days", index, "end"],
        });
      }
    });
  });

export const inviteMemberSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    operationalAccess: z.boolean(),
    financialAccess: z.boolean(),
  })
  .refine((value) => value.operationalAccess || value.financialAccess, {
    message: "Escolha ao menos um grupo de acesso.",
  });

export const updateMemberAccessSchema = z
  .object({
    operationalAccess: z.boolean(),
    financialAccess: z.boolean(),
  })
  .refine((value) => value.operationalAccess || value.financialAccess, {
    message: "Escolha ao menos um grupo de acesso.",
  });

export const deleteOwnAccountSchema = z.object({
  password: z.string().min(1).max(256),
  tenantName: z.string().trim().min(2).max(160),
  irreversibleConfirmation: z.literal(true),
});

export type BusinessDay = z.infer<typeof businessDaySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSalesPresetsInput = z.infer<typeof updateSalesPresetsSchema>;
export type UpdateBusinessHoursInput = z.infer<
  typeof updateBusinessHoursSchema
>;

export type SettingsWorkspace = {
  tenantName: string;
  ownerName: string;
  account: {
    userId: string | null;
    email: string | null;
    role: "owner" | "employee";
    operationalAccess: boolean;
    financialAccess: boolean;
    canManageTeam: boolean;
    avatarDataUrl: string | null;
    mfaAvailable: boolean;
    mfaEnabled: boolean;
  };
  timezone: string;
  company: {
    name: string;
    phone: string | null;
    email: string | null;
    taxDocument: string | null;
    addressLine: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    isCommercialPoint: boolean;
    logoDataUrl: string | null;
  };
  sales: {
    defaultMarginPercentage: number;
    defaultDepositPercentage: number;
    defaultPaymentMethod: "pix" | "card" | "cash";
    defaultDeliveryMode: "delivery" | "pickup";
    deliveryCostPerKm: number;
  };
  integrations: {
    googleMapsRoutesEnabled: boolean;
  };
  businessHours: BusinessDay[];
  people: {
    members: Array<{
      userId: string;
      displayName: string;
      email: string;
      role: "owner" | "employee";
      operationalAccess: boolean;
      financialAccess: boolean;
      current: boolean;
      joinedAt: string;
    }>;
    invitations: Array<{
      id: string;
      email: string;
      operationalAccess: boolean;
      financialAccess: boolean;
      expiresAt: string;
      createdAt: string;
    }>;
  };
  accountNotifications: Array<{
    id: string;
    kind: string;
    message: string;
    createdAt: string;
  }>;
  updatedAt: string;
};

export type SettingsMutationResult = {
  message: string;
  workspace: SettingsWorkspace;
};
