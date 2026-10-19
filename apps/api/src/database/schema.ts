import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", ["owner", "employee"]);
export const ingredientBaseDimension = pgEnum("ingredient_base_dimension", [
  "mass",
  "unit",
]);
export const ingredientCategoryKind = pgEnum("ingredient_category_kind", [
  "ingredient",
  "packaging",
  "operational",
]);
export const purchaseLotStatus = pgEnum("purchase_lot_status", [
  "available",
  "depleted",
]);
export const stockMovementType = pgEnum("stock_movement_type", [
  "PURCHASE_IN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "RESERVE",
  "RELEASE",
  "CONSUME",
  "LOSS",
  "RETURN_IN",
  "RETURN_OUT",
  "REVERSAL",
]);
export const fiscalDocumentStatus = pgEnum("fiscal_document_status", [
  "requires_review",
  "confirmed",
  "cancelled",
  "failed",
]);
export const fiscalLineMatchStatus = pgEnum("fiscal_line_match_status", [
  "unmatched",
  "suggested",
  "confirmed",
]);
export const recipeVersionStatus = pgEnum("recipe_version_status", [
  "draft",
  "published",
]);
export const recipeSelectionPolicy = pgEnum("recipe_selection_policy", [
  "generic",
  "preferred",
  "required",
]);
export const recipeMeasurementUnit = pgEnum("recipe_measurement_unit", [
  "g",
  "kg",
  "mg",
  "ml",
  "unit",
]);
export const recipeConversionConfidence = pgEnum(
  "recipe_conversion_confidence",
  ["provided", "imported", "inferred"],
);
export const recipeStepKind = pgEnum("recipe_step_kind", [
  "active",
  "heating",
  "oven",
  "rest",
  "cooling",
  "cold",
  "assembly",
]);
export const recipePreparationRole = pgEnum("recipe_preparation_role", [
  "intermediate",
  "final",
]);
export const preparationInstanceKind = pgEnum("preparation_instance_kind", [
  "intermediate",
  "final",
]);
export const orderStatus = pgEnum("order_status", [
  "confirmed",
  "in_production",
  "ready",
  "cancelled",
  "completed",
]);
export const deliveryMode = pgEnum("delivery_mode", ["delivery", "pickup"]);
export const orderRequirementStatus = pgEnum("order_requirement_status", [
  "available",
  "substitution",
  "partial",
  "unavailable",
]);
export const shoppingNeedStatus = pgEnum("shopping_need_status", [
  "open",
  "purchased",
  "cancelled",
]);
export const productionPlanStatus = pgEnum("production_plan_status", [
  "planned",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
]);
export const productionMomentStatus = pgEnum("production_moment_status", [
  "pending",
  "available",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
]);
export const productionTaskStatus = pgEnum("production_task_status", [
  "planned",
  "available",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
]);
export const orderReceiptEntryKind = pgEnum("order_receipt_entry_kind", [
  "receipt",
  "reversal",
]);
export const orderDirectExpenseEntryKind = pgEnum(
  "order_direct_expense_entry_kind",
  ["expense", "reversal"],
);
export const expensePaymentEntryKind = pgEnum("expense_payment_entry_kind", [
  "payment",
  "reversal",
]);
export const equipmentKind = pgEnum("equipment_kind", [
  "oven",
  "mixer",
  "refrigeration",
  "stove",
  "utensil",
  "other",
]);
export const equipmentStatus = pgEnum("equipment_status", [
  "active",
  "maintenance",
  "retired",
]);
export const equipmentUsageSource = pgEnum("equipment_usage_source", [
  "manual",
  "production",
]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    phone: text("phone"),
    email: text("email"),
    taxDocument: text("tax_document"),
    addressLine: text("address_line"),
    addressNumber: text("address_number"),
    addressComplement: text("address_complement"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    isCommercialPoint: boolean("is_commercial_point").default(false).notNull(),
    logoDataUrl: text("logo_data_url"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("tenants_slug_uidx").on(table.slug)],
);

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalSubject: text("external_subject").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarDataUrl: text("avatar_data_url"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("app_users_external_subject_uidx").on(table.externalSubject),
    uniqueIndex("app_users_email_uidx").on(table.email),
  ],
);

export const localAuthCredentials = pgTable(
  "local_auth_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("local_auth_credentials_email_uidx").on(table.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id),
    role: membershipRole("role").default("owner").notNull(),
    operationalAccess: boolean("operational_access").default(true).notNull(),
    financialAccess: boolean("financial_access").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    index("memberships_user_idx").on(table.userId, table.tenantId),
  ],
);

export const tenantInvitations = pgTable(
  "tenant_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    operationalAccess: boolean("operational_access").default(false).notNull(),
    financialAccess: boolean("financial_access").default(false).notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => appUsers.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("tenant_invitations_token_hash_uidx").on(table.tokenHash),
    index("tenant_invitations_tenant_status_idx").on(
      table.tenantId,
      table.acceptedAt,
      table.revokedAt,
      table.expiresAt,
    ),
  ],
);

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  timezone: text("timezone").default("America/Sao_Paulo").notNull(),
  defaultMarginBasisPoints: integer("default_margin_basis_points")
    .default(3_500)
    .notNull(),
  defaultDepositBasisPoints: integer("default_deposit_basis_points")
    .default(5_000)
    .notNull(),
  defaultPaymentMethod: text("default_payment_method").default("pix").notNull(),
  defaultDeliveryMode: text("default_delivery_mode")
    .default("delivery")
    .notNull(),
  deliveryCostPerKm: numeric("delivery_cost_per_km", {
    precision: 10,
    scale: 2,
    mode: "number",
  })
    .default(0)
    .notNull(),
  businessHours: jsonb("business_hours")
    .$type<
      Array<{
        day:
          | "monday"
          | "tuesday"
          | "wednesday"
          | "thursday"
          | "friday"
          | "saturday"
          | "sunday";
        enabled: boolean;
        start: string;
        end: string;
      }>
    >()
    .default([
      { day: "monday", enabled: true, start: "08:00", end: "18:00" },
      { day: "tuesday", enabled: true, start: "08:00", end: "18:00" },
      { day: "wednesday", enabled: true, start: "08:00", end: "18:00" },
      { day: "thursday", enabled: true, start: "08:00", end: "18:00" },
      { day: "friday", enabled: true, start: "08:00", end: "18:00" },
      { day: "saturday", enabled: true, start: "08:00", end: "14:00" },
      { day: "sunday", enabled: false, start: "08:00", end: "14:00" },
    ])
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id),
    eventType: text("event_type").notNull(),
    correlationId: text("correlation_id").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_tenant_occurred_idx").on(
      table.tenantId,
      table.occurredAt,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    status: text("status")
      .$type<"pending" | "queued" | "processed" | "failed">()
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("outbox_events_dispatch_idx").on(
      table.status,
      table.availableAt,
      table.createdAt,
    ),
    index("outbox_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

export const ingredientCategories = pgTable(
  "ingredient_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    kind: ingredientCategoryKind("kind").default("ingredient").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ingredient_categories_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    uniqueIndex("ingredient_categories_tenant_name_active_uidx")
      .on(table.tenantId, table.normalizedName)
      .where(sql`${table.active}`),
  ],
);

export const ingredientGroups = pgTable(
  "ingredient_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    categoryId: uuid("category_id").notNull(),
    category: text("category").notNull(),
    baseDimension: ingredientBaseDimension("base_dimension").notNull(),
    baseUnit: text("base_unit").notNull(),
    perishable: boolean("perishable").default(false).notNull(),
    defaultDensityGml: numeric("default_density_g_ml", {
      precision: 12,
      scale: 6,
      mode: "number",
    }),
    minimumStock: numeric("minimum_stock", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .default(0)
      .notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ingredient_groups_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "ingredient_groups_category_tenant_fk",
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [ingredientCategories.tenantId, ingredientCategories.id],
    }),
    uniqueIndex("ingredient_groups_tenant_normalized_active_uidx")
      .on(table.tenantId, table.normalizedName)
      .where(sql`${table.active}`),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("brands_tenant_id_id_unique").on(table.tenantId, table.id),
    uniqueIndex("brands_tenant_normalized_uidx").on(
      table.tenantId,
      table.normalizedName,
    ),
  ],
);

export const commercialItems = pgTable(
  "commercial_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ingredientGroupId: uuid("ingredient_group_id").notNull(),
    brandId: uuid("brand_id"),
    manufacturerName: text("manufacturer_name"),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    gtin: text("gtin"),
    packageQuantity: numeric("package_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .default(1)
      .notNull(),
    packageUnit: text("package_unit").notNull(),
    netContentBase: numeric("net_content_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    conversionConfidence: text("conversion_confidence")
      .default("provided")
      .notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("commercial_items_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("commercial_items_tenant_id_group_id_unique").on(
      table.tenantId,
      table.id,
      table.ingredientGroupId,
    ),
    foreignKey({
      name: "commercial_items_group_tenant_fk",
      columns: [table.tenantId, table.ingredientGroupId],
      foreignColumns: [ingredientGroups.tenantId, ingredientGroups.id],
    }),
    foreignKey({
      name: "commercial_items_brand_tenant_fk",
      columns: [table.tenantId, table.brandId],
      foreignColumns: [brands.tenantId, brands.id],
    }),
    index("commercial_items_tenant_name_idx").on(
      table.tenantId,
      table.normalizedName,
    ),
    uniqueIndex("commercial_items_tenant_gtin_uidx")
      .on(table.tenantId, table.gtin)
      .where(sql`${table.gtin} is not null and ${table.active}`),
  ],
);

export const fiscalDocuments = pgTable(
  "fiscal_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentKey: text("document_key").notNull(),
    sourceHash: text("source_hash").notNull(),
    captureMethod: text("capture_method").default("qr_code").notNull(),
    issuerName: text("issuer_name"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    totalAmount: numeric("total_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    status: fiscalDocumentStatus("status").default("requires_review").notNull(),
    adapterName: text("adapter_name").default("assisted_text").notNull(),
    adapterVersion: text("adapter_version").default("1").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    unique("fiscal_documents_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("fiscal_documents_tenant_key_unique").on(
      table.tenantId,
      table.documentKey,
    ),
    index("fiscal_documents_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.capturedAt,
    ),
  ],
);

export const fiscalDocumentLines = pgTable(
  "fiscal_document_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fiscalDocumentId: uuid("fiscal_document_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    originalDescription: text("original_description").notNull(),
    gtin: text("gtin"),
    commercialItemId: uuid("commercial_item_id"),
    quantity: numeric("quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    unit: text("unit").notNull(),
    totalAmount: numeric("total_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    extractionConfidence: numeric("extraction_confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .default(0.7)
      .notNull(),
    matchStatus: fiscalLineMatchStatus("match_status")
      .default("unmatched")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("fiscal_document_lines_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("fiscal_document_lines_document_number_unique").on(
      table.tenantId,
      table.fiscalDocumentId,
      table.lineNumber,
    ),
    foreignKey({
      name: "fiscal_document_lines_document_tenant_fk",
      columns: [table.tenantId, table.fiscalDocumentId],
      foreignColumns: [fiscalDocuments.tenantId, fiscalDocuments.id],
    }),
    foreignKey({
      name: "fiscal_document_lines_item_tenant_fk",
      columns: [table.tenantId, table.commercialItemId],
      foreignColumns: [commercialItems.tenantId, commercialItems.id],
    }),
  ],
);

export const purchaseLots = pgTable(
  "purchase_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    commercialItemId: uuid("commercial_item_id").notNull(),
    supplierName: text("supplier_name"),
    sourceDocumentId: uuid("source_document_id"),
    entryDate: date("entry_date").notNull(),
    expiryDate: date("expiry_date"),
    quantityInitialBase: numeric("quantity_initial_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    totalCost: numeric("total_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    unitCostBase: numeric("unit_cost_base", {
      precision: 18,
      scale: 8,
      mode: "number",
    }).notNull(),
    lotCode: text("lot_code"),
    source: text("source").default("manual").notNull(),
    status: purchaseLotStatus("status").default("available").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("purchase_lots_tenant_id_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "purchase_lots_item_tenant_fk",
      columns: [table.tenantId, table.commercialItemId],
      foreignColumns: [commercialItems.tenantId, commercialItems.id],
    }),
    foreignKey({
      name: "purchase_lots_source_document_tenant_fk",
      columns: [table.tenantId, table.sourceDocumentId],
      foreignColumns: [fiscalDocuments.tenantId, fiscalDocuments.id],
    }),
    index("purchase_lots_tenant_expiry_idx").on(
      table.tenantId,
      table.expiryDate,
    ),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lotId: uuid("lot_id").notNull(),
    type: stockMovementType("type").notNull(),
    quantityBase: numeric("quantity_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id"),
    reasonCode: text("reason_code"),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id),
    reversesMovementId: uuid("reverses_movement_id"),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    foreignKey({
      name: "stock_movements_lot_tenant_fk",
      columns: [table.tenantId, table.lotId],
      foreignColumns: [purchaseLots.tenantId, purchaseLots.id],
    }),
    index("stock_movements_tenant_lot_occurred_idx").on(
      table.tenantId,
      table.lotId,
      table.occurredAt,
    ),
    uniqueIndex("stock_movements_tenant_idempotency_uidx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("recipes_tenant_id_id_unique").on(table.tenantId, table.id),
    uniqueIndex("recipes_tenant_normalized_active_uidx")
      .on(table.tenantId, table.normalizedName)
      .where(sql`${table.active}`),
  ],
);

export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeId: uuid("recipe_id").notNull(),
    versionNumber: integer("version_number").default(1).notNull(),
    status: recipeVersionStatus("status").default("draft").notNull(),
    yieldMassG: numeric("yield_mass_g", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    yieldUnits: integer("yield_units"),
    expectedLossPercentage: numeric("expected_loss_percentage", {
      precision: 6,
      scale: 3,
      mode: "number",
    })
      .default(0)
      .notNull(),
    minimumBatchFactor: numeric("minimum_batch_factor", {
      precision: 8,
      scale: 4,
      mode: "number",
    })
      .default(0.25)
      .notNull(),
    roundingRule: text("rounding_rule").default("proportional").notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    sourceAuthor: text("source_author"),
    sourceAccessedAt: timestamp("source_accessed_at", { withTimezone: true }),
    importMethod: text("import_method").$type<"structured_data" | "llm">(),
    importWarnings: jsonb("import_warnings")
      .$type<string[]>()
      .default([])
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("recipe_versions_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("recipe_versions_recipe_number_unique").on(
      table.tenantId,
      table.recipeId,
      table.versionNumber,
    ),
    uniqueIndex("recipe_versions_one_open_edit_uidx")
      .on(table.tenantId, table.recipeId)
      .where(sql`${table.status} = 'draft'`),
    foreignKey({
      name: "recipe_versions_recipe_tenant_fk",
      columns: [table.tenantId, table.recipeId],
      foreignColumns: [recipes.tenantId, recipes.id],
    }),
  ],
);

export const recipeLines = pgTable(
  "recipe_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    recipeStepId: uuid("recipe_step_id"),
    ingredientGroupId: uuid("ingredient_group_id").notNull(),
    quantityG: numeric("quantity_g", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    inputQuantity: numeric("input_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    inputUnit: recipeMeasurementUnit("input_unit").default("g").notNull(),
    conversionFactorToG: numeric("conversion_factor_to_g", {
      precision: 14,
      scale: 6,
      mode: "number",
    })
      .default(1)
      .notNull(),
    conversionSource: text("conversion_source"),
    conversionConfidence: recipeConversionConfidence("conversion_confidence")
      .default("provided")
      .notNull(),
    notes: text("notes"),
    selectionPolicy: recipeSelectionPolicy("selection_policy")
      .default("generic")
      .notNull(),
    preferredCommercialItemId: uuid("preferred_commercial_item_id"),
    wastePercentage: numeric("waste_percentage", {
      precision: 6,
      scale: 3,
      mode: "number",
    })
      .default(0)
      .notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    unique("recipe_lines_tenant_id_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "recipe_lines_version_tenant_fk",
      columns: [table.tenantId, table.recipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
    foreignKey({
      name: "recipe_lines_group_tenant_fk",
      columns: [table.tenantId, table.ingredientGroupId],
      foreignColumns: [ingredientGroups.tenantId, ingredientGroups.id],
    }),
    foreignKey({
      name: "recipe_lines_preferred_item_tenant_fk",
      columns: [
        table.tenantId,
        table.preferredCommercialItemId,
        table.ingredientGroupId,
      ],
      foreignColumns: [
        commercialItems.tenantId,
        commercialItems.id,
        commercialItems.ingredientGroupId,
      ],
    }),
    index("recipe_lines_version_position_idx").on(
      table.tenantId,
      table.recipeVersionId,
      table.position,
    ),
    index("recipe_lines_step_idx").on(table.tenantId, table.recipeStepId),
  ],
);

export const recipeMoments = pgTable(
  "recipe_moments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    preparationRole: recipePreparationRole("preparation_role")
      .default("final")
      .notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    unique("recipe_moments_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("recipe_moments_tenant_id_version_id_unique").on(
      table.tenantId,
      table.id,
      table.recipeVersionId,
    ),
    unique("recipe_moments_version_name_unique").on(
      table.tenantId,
      table.recipeVersionId,
      table.name,
    ),
    foreignKey({
      name: "recipe_moments_version_tenant_fk",
      columns: [table.tenantId, table.recipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
  ],
);

export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    recipeMomentId: uuid("recipe_moment_id").notNull(),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    kind: recipeStepKind("kind").default("active").notNull(),
    requiredEquipmentKind: equipmentKind("required_equipment_kind"),
    parallelizable: boolean("parallelizable").default(false).notNull(),
    attentionRequiredAtEnd: boolean("attention_required_at_end")
      .default(true)
      .notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    unique("recipe_steps_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("recipe_steps_tenant_id_version_id_unique").on(
      table.tenantId,
      table.id,
      table.recipeVersionId,
    ),
    foreignKey({
      name: "recipe_steps_version_tenant_fk",
      columns: [table.tenantId, table.recipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
    foreignKey({
      name: "recipe_steps_moment_tenant_fk",
      columns: [table.tenantId, table.recipeMomentId, table.recipeVersionId],
      foreignColumns: [
        recipeMoments.tenantId,
        recipeMoments.id,
        recipeMoments.recipeVersionId,
      ],
    }),
    index("recipe_steps_moment_position_idx").on(
      table.tenantId,
      table.recipeMomentId,
      table.position,
    ),
  ],
);

export const recipeStepDependencies = pgTable(
  "recipe_step_dependencies",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    predecessorStepId: uuid("predecessor_step_id").notNull(),
    successorStepId: uuid("successor_step_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.predecessorStepId, table.successorStepId],
    }),
    foreignKey({
      name: "recipe_step_dependencies_predecessor_tenant_fk",
      columns: [table.tenantId, table.predecessorStepId, table.recipeVersionId],
      foreignColumns: [
        recipeSteps.tenantId,
        recipeSteps.id,
        recipeSteps.recipeVersionId,
      ],
    }),
    foreignKey({
      name: "recipe_step_dependencies_successor_tenant_fk",
      columns: [table.tenantId, table.successorStepId, table.recipeVersionId],
      foreignColumns: [
        recipeSteps.tenantId,
        recipeSteps.id,
        recipeSteps.recipeVersionId,
      ],
    }),
    index("recipe_step_dependencies_successor_idx").on(
      table.tenantId,
      table.successorStepId,
    ),
  ],
);

export const recipeSubrecipeLines = pgTable(
  "recipe_subrecipe_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    recipeMomentId: uuid("recipe_moment_id").notNull(),
    referencedRecipeVersionId: uuid("referenced_recipe_version_id").notNull(),
    requiredYieldG: numeric("required_yield_g", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    notes: text("notes"),
    position: integer("position").notNull(),
  },
  (table) => [
    unique("recipe_subrecipe_lines_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "recipe_subrecipe_lines_version_tenant_fk",
      columns: [table.tenantId, table.recipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
    foreignKey({
      name: "recipe_subrecipe_lines_moment_tenant_fk",
      columns: [table.tenantId, table.recipeMomentId, table.recipeVersionId],
      foreignColumns: [
        recipeMoments.tenantId,
        recipeMoments.id,
        recipeMoments.recipeVersionId,
      ],
    }),
    foreignKey({
      name: "recipe_subrecipe_lines_referenced_version_tenant_fk",
      columns: [table.tenantId, table.referencedRecipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
    index("recipe_subrecipe_lines_version_position_idx").on(
      table.tenantId,
      table.recipeVersionId,
      table.position,
    ),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    primaryPhone: text("primary_phone").notNull(),
    normalizedPhone: text("normalized_phone").notNull(),
    email: text("email"),
    notes: text("notes"),
    preferredDeliveryMode: deliveryMode("preferred_delivery_mode"),
    preferredPaymentMethod: text("preferred_payment_method"),
    active: boolean("active").default(true).notNull(),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("customers_tenant_id_id_unique").on(table.tenantId, table.id),
    index("customers_tenant_name_idx").on(table.tenantId, table.normalizedName),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    customerId: uuid("customer_id").notNull(),
    label: text("label").notNull(),
    recipient: text("recipient").notNull(),
    formattedAddress: text("formatted_address").notNull(),
    postalCode: text("postal_code"),
    street: text("street"),
    addressNumber: text("address_number"),
    addressComplement: text("address_complement"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    state: text("state"),
    deliveryInstructions: text("delivery_instructions"),
    isDefault: boolean("is_default").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("customer_addresses_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "customer_addresses_customer_tenant_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
  ],
);

export const tenantOrderSequences = pgTable("tenant_order_sequences", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  nextNumber: integer("next_number").default(1).notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderNumber: integer("order_number").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    status: orderStatus("status").default("confirmed").notNull(),
    customerId: uuid("customer_id").notNull(),
    customerNameSnapshot: text("customer_name_snapshot").notNull(),
    customerPhoneSnapshot: text("customer_phone_snapshot").notNull(),
    deliveryMode: deliveryMode("delivery_mode").notNull(),
    deliveryArrangement: text("delivery_arrangement").$type<
      "own" | "customer_arranged" | "integrated_partner"
    >(),
    deliveryProvider: text("delivery_provider"),
    addressSnapshot: jsonb("address_snapshot"),
    deliveryAt: timestamp("delivery_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    ingredientCost: numeric("ingredient_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    additionalCost: numeric("additional_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    deliveryCost: numeric("delivery_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    totalCost: numeric("total_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    targetMarginBasisPoints: integer("target_margin_basis_points").notNull(),
    price: numeric("price", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    depositBasisPoints: integer("deposit_basis_points").default(0).notNull(),
    paymentMethod: text("payment_method").notNull(),
    availability: orderRequirementStatus("availability").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("orders_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("orders_tenant_number_unique").on(table.tenantId, table.orderNumber),
    unique("orders_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "orders_customer_tenant_fk",
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    index("orders_tenant_delivery_idx").on(table.tenantId, table.deliveryAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    recipeId: uuid("recipe_id").notNull(),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    recipeNameSnapshot: text("recipe_name_snapshot").notNull(),
    recipeVersionNumber: integer("recipe_version_number").notNull(),
    requestedMassG: numeric("requested_mass_g", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    productionMassG: numeric("production_mass_g", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    scaleFactor: numeric("scale_factor", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    ingredientCost: numeric("ingredient_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    price: numeric("price", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("order_items_tenant_id_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "order_items_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    foreignKey({
      name: "order_items_recipe_tenant_fk",
      columns: [table.tenantId, table.recipeId],
      foreignColumns: [recipes.tenantId, recipes.id],
    }),
    foreignKey({
      name: "order_items_version_tenant_fk",
      columns: [table.tenantId, table.recipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
  ],
);

export const orderReceipts = pgTable(
  "order_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    kind: orderReceiptEntryKind("kind").default("receipt").notNull(),
    amount: numeric("amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    feeAmount: numeric("fee_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    paymentMethod: text("payment_method").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    note: text("note"),
    reversesReceiptId: uuid("reverses_receipt_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("order_receipts_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("order_receipts_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "order_receipts_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    index("order_receipts_order_received_idx").on(
      table.tenantId,
      table.orderId,
      table.receivedAt,
    ),
    uniqueIndex("order_receipts_single_reversal_uidx")
      .on(table.tenantId, table.reversesReceiptId)
      .where(sql`${table.kind} = 'reversal'`),
  ],
);

export const orderDirectExpenses = pgTable(
  "order_direct_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    kind: orderDirectExpenseEntryKind("kind").default("expense").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    actualAmount: numeric("actual_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    estimatedAmount: numeric("estimated_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    incurredAt: date("incurred_at", { mode: "date" }).notNull(),
    note: text("note"),
    reversesExpenseId: uuid("reverses_expense_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("order_direct_expenses_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("order_direct_expenses_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "order_direct_expenses_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    index("order_direct_expenses_order_date_idx").on(
      table.tenantId,
      table.orderId,
      table.incurredAt,
    ),
    uniqueIndex("order_direct_expenses_single_reversal_uidx")
      .on(table.tenantId, table.reversesExpenseId)
      .where(sql`${table.kind} = 'reversal'`),
  ],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("expense_categories_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("expense_categories_tenant_name_unique").on(
      table.tenantId,
      table.normalizedName,
    ),
  ],
);

export const expenseRecurrences = pgTable(
  "expense_recurrences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid("category_id").notNull(),
    description: text("description").notNull(),
    supplier: text("supplier"),
    expectedAmount: numeric("expected_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    startMonth: date("start_month", { mode: "date" }).notNull(),
    endMonth: date("end_month", { mode: "date" }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("expense_recurrences_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "expense_recurrences_category_tenant_fk",
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [expenseCategories.tenantId, expenseCategories.id],
    }),
  ],
);

export const operatingExpenses = pgTable(
  "operating_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid("category_id").notNull(),
    recurrenceId: uuid("recurrence_id"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    description: text("description").notNull(),
    supplier: text("supplier"),
    competence: date("competence", { mode: "date" }).notNull(),
    dueDate: date("due_date", { mode: "date" }).notNull(),
    expectedAmount: numeric("expected_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("operating_expenses_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("operating_expenses_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "operating_expenses_category_tenant_fk",
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [expenseCategories.tenantId, expenseCategories.id],
    }),
    foreignKey({
      name: "operating_expenses_recurrence_tenant_fk",
      columns: [table.tenantId, table.recurrenceId],
      foreignColumns: [expenseRecurrences.tenantId, expenseRecurrences.id],
    }),
    uniqueIndex("operating_expenses_recurrence_month_uidx")
      .on(table.tenantId, table.recurrenceId, table.competence)
      .where(sql`${table.recurrenceId} is not null`),
    index("operating_expenses_month_due_idx").on(
      table.tenantId,
      table.competence,
      table.dueDate,
    ),
  ],
);

export const expensePayments = pgTable(
  "expense_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    expenseId: uuid("expense_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    kind: expensePaymentEntryKind("kind").default("payment").notNull(),
    amount: numeric("amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    paidAt: date("paid_at", { mode: "date" }).notNull(),
    note: text("note"),
    reversesPaymentId: uuid("reverses_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("expense_payments_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("expense_payments_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "expense_payments_expense_tenant_fk",
      columns: [table.tenantId, table.expenseId],
      foreignColumns: [operatingExpenses.tenantId, operatingExpenses.id],
    }),
    index("expense_payments_date_idx").on(table.tenantId, table.paidAt),
    uniqueIndex("expense_payments_single_reversal_uidx")
      .on(table.tenantId, table.reversesPaymentId)
      .where(sql`${table.kind} = 'reversal'`),
  ],
);

export const equipmentAssets = pgTable(
  "equipment_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    idempotencyKey: uuid("idempotency_key").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    kind: equipmentKind("kind").notNull(),
    brand: text("brand"),
    model: text("model"),
    purchaseDate: date("purchase_date", { mode: "date" }),
    purchaseValue: numeric("purchase_value", {
      precision: 14,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    capacityUnits: integer("capacity_units").default(1).notNull(),
    status: equipmentStatus("status").default("active").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("equipment_assets_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("equipment_assets_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    unique("equipment_assets_tenant_name_unique").on(
      table.tenantId,
      table.normalizedName,
    ),
  ],
);

export const equipmentUnavailability = pgTable(
  "equipment_unavailability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    equipmentId: uuid("equipment_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("equipment_unavailability_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("equipment_unavailability_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "equipment_unavailability_asset_tenant_fk",
      columns: [table.tenantId, table.equipmentId],
      foreignColumns: [equipmentAssets.tenantId, equipmentAssets.id],
    }),
    index("equipment_unavailability_schedule_idx").on(
      table.tenantId,
      table.equipmentId,
      table.startsAt,
      table.endsAt,
    ),
  ],
);

export const equipmentMaintenanceEvents = pgTable(
  "equipment_maintenance_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    equipmentId: uuid("equipment_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    performedAt: date("performed_at", { mode: "date" }).notNull(),
    description: text("description").notNull(),
    cost: numeric("cost", { precision: 14, scale: 2, mode: "number" })
      .default(0)
      .notNull(),
    provider: text("provider"),
    nextDueDate: date("next_due_date", { mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("equipment_maintenance_tenant_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("equipment_maintenance_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "equipment_maintenance_asset_tenant_fk",
      columns: [table.tenantId, table.equipmentId],
      foreignColumns: [equipmentAssets.tenantId, equipmentAssets.id],
    }),
    index("equipment_maintenance_asset_date_idx").on(
      table.tenantId,
      table.equipmentId,
      table.performedAt,
    ),
  ],
);

export const equipmentUsages = pgTable(
  "equipment_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    equipmentId: uuid("equipment_id").notNull(),
    orderId: uuid("order_id"),
    productionTaskId: uuid("production_task_id"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    source: equipmentUsageSource("source").default("manual").notNull(),
    usedAt: date("used_at", { mode: "date" }).notNull(),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("equipment_usages_tenant_id_unique").on(table.tenantId, table.id),
    unique("equipment_usages_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: "equipment_usages_asset_tenant_fk",
      columns: [table.tenantId, table.equipmentId],
      foreignColumns: [equipmentAssets.tenantId, equipmentAssets.id],
    }),
    foreignKey({
      name: "equipment_usages_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    index("equipment_usages_asset_date_idx").on(
      table.tenantId,
      table.equipmentId,
      table.usedAt,
    ),
    uniqueIndex("equipment_usages_task_unique_idx")
      .on(table.tenantId, table.productionTaskId)
      .where(sql`${table.productionTaskId} is not null`),
  ],
);

export const productionPlans = pgTable(
  "production_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    orderItemId: uuid("order_item_id").notNull(),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    scaleFactor: numeric("scale_factor", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    productionMassG: numeric("production_mass_g", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    deliveryAt: timestamp("delivery_at", { withTimezone: true }).notNull(),
    recommendedStartAt: timestamp("recommended_start_at", {
      withTimezone: true,
    }).notNull(),
    plannedFinishAt: timestamp("planned_finish_at", {
      withTimezone: true,
    }).notNull(),
    bufferMinutes: integer("buffer_minutes").default(60).notNull(),
    status: productionPlanStatus("status").default("planned").notNull(),
    planningVersion: integer("planning_version").default(1).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_plans_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("production_plans_tenant_item_unique").on(
      table.tenantId,
      table.orderItemId,
    ),
    foreignKey({
      name: "production_plans_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    foreignKey({
      name: "production_plans_item_tenant_fk",
      columns: [table.tenantId, table.orderItemId],
      foreignColumns: [orderItems.tenantId, orderItems.id],
    }),
    foreignKey({
      name: "production_plans_version_tenant_fk",
      columns: [table.tenantId, table.recipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
    index("production_plans_tenant_schedule_idx").on(
      table.tenantId,
      table.status,
      table.recommendedStartAt,
      table.deliveryAt,
    ),
  ],
);

export const productionMoments = pgTable(
  "production_moments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionPlanId: uuid("production_plan_id").notNull(),
    sourceRecipeMomentId: uuid("source_recipe_moment_id").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    position: integer("position").notNull(),
    plannedStartAt: timestamp("planned_start_at", {
      withTimezone: true,
    }).notNull(),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }).notNull(),
    actualStartedAt: timestamp("actual_started_at", { withTimezone: true }),
    actualCompletedAt: timestamp("actual_completed_at", {
      withTimezone: true,
    }),
    status: productionMomentStatus("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_moments_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("production_moments_tenant_plan_position_unique").on(
      table.tenantId,
      table.productionPlanId,
      table.position,
    ),
    unique("production_moments_tenant_id_plan_unique").on(
      table.tenantId,
      table.id,
      table.productionPlanId,
    ),
    foreignKey({
      name: "production_moments_plan_tenant_fk",
      columns: [table.tenantId, table.productionPlanId],
      foreignColumns: [productionPlans.tenantId, productionPlans.id],
    }),
    foreignKey({
      name: "production_moments_source_tenant_fk",
      columns: [table.tenantId, table.sourceRecipeMomentId],
      foreignColumns: [recipeMoments.tenantId, recipeMoments.id],
    }),
  ],
);

export const preparationInstances = pgTable(
  "preparation_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionPlanId: uuid("production_plan_id").notNull(),
    productionMomentId: uuid("production_moment_id"),
    parentPreparationInstanceId: uuid("parent_preparation_instance_id"),
    sourceRecipeVersionId: uuid("source_recipe_version_id").notNull(),
    sourceRecipeMomentId: uuid("source_recipe_moment_id"),
    nameSnapshot: text("name_snapshot").notNull(),
    kind: preparationInstanceKind("kind").notNull(),
    dedicatedToOrder: boolean("dedicated_to_order").default(true).notNull(),
    expectedOutputBase: numeric("expected_output_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("preparation_instances_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("preparation_instances_tenant_plan_moment_unique").on(
      table.tenantId,
      table.productionPlanId,
      table.productionMomentId,
    ),
    unique("preparation_instances_tenant_id_plan_unique").on(
      table.tenantId,
      table.id,
      table.productionPlanId,
    ),
    foreignKey({
      name: "preparation_instances_plan_tenant_fk",
      columns: [table.tenantId, table.productionPlanId],
      foreignColumns: [productionPlans.tenantId, productionPlans.id],
    }),
    foreignKey({
      name: "preparation_instances_moment_tenant_fk",
      columns: [
        table.tenantId,
        table.productionMomentId,
        table.productionPlanId,
      ],
      foreignColumns: [
        productionMoments.tenantId,
        productionMoments.id,
        productionMoments.productionPlanId,
      ],
    }),
    foreignKey({
      name: "preparation_instances_version_tenant_fk",
      columns: [table.tenantId, table.sourceRecipeVersionId],
      foreignColumns: [recipeVersions.tenantId, recipeVersions.id],
    }),
    foreignKey({
      name: "preparation_instances_source_moment_tenant_fk",
      columns: [table.tenantId, table.sourceRecipeMomentId],
      foreignColumns: [recipeMoments.tenantId, recipeMoments.id],
    }),
    index("preparation_instances_plan_idx").on(
      table.tenantId,
      table.productionPlanId,
      table.kind,
    ),
  ],
);

export const productionTasks = pgTable(
  "production_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionPlanId: uuid("production_plan_id").notNull(),
    productionMomentId: uuid("production_moment_id").notNull(),
    preparationInstanceId: uuid("preparation_instance_id").notNull(),
    sourceRecipeStepId: uuid("source_recipe_step_id").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    instructionsSnapshot: text("instructions_snapshot").notNull(),
    kind: recipeStepKind("kind").notNull(),
    requiredEquipmentKind: equipmentKind("required_equipment_kind"),
    equipmentId: uuid("equipment_id"),
    durationMinutes: integer("duration_minutes").notNull(),
    parallelizable: boolean("parallelizable").default(false).notNull(),
    attentionRequiredAtEnd: boolean("attention_required_at_end")
      .default(true)
      .notNull(),
    position: integer("position").notNull(),
    plannedStartAt: timestamp("planned_start_at", {
      withTimezone: true,
    }).notNull(),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }).notNull(),
    actualStartedAt: timestamp("actual_started_at", { withTimezone: true }),
    actualCompletedAt: timestamp("actual_completed_at", {
      withTimezone: true,
    }),
    nextAttentionAt: timestamp("next_attention_at", { withTimezone: true }),
    status: productionTaskStatus("status").default("planned").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_tasks_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("production_tasks_tenant_moment_position_unique").on(
      table.tenantId,
      table.productionMomentId,
      table.position,
    ),
    foreignKey({
      name: "production_tasks_plan_tenant_fk",
      columns: [table.tenantId, table.productionPlanId],
      foreignColumns: [productionPlans.tenantId, productionPlans.id],
    }),
    foreignKey({
      name: "production_tasks_moment_tenant_fk",
      columns: [table.tenantId, table.productionMomentId],
      foreignColumns: [productionMoments.tenantId, productionMoments.id],
    }),
    foreignKey({
      name: "production_tasks_preparation_tenant_fk",
      columns: [
        table.tenantId,
        table.preparationInstanceId,
        table.productionPlanId,
      ],
      foreignColumns: [
        preparationInstances.tenantId,
        preparationInstances.id,
        preparationInstances.productionPlanId,
      ],
    }),
    foreignKey({
      name: "production_tasks_source_tenant_fk",
      columns: [table.tenantId, table.sourceRecipeStepId],
      foreignColumns: [recipeSteps.tenantId, recipeSteps.id],
    }),
    foreignKey({
      name: "production_tasks_equipment_tenant_fk",
      columns: [table.tenantId, table.equipmentId],
      foreignColumns: [equipmentAssets.tenantId, equipmentAssets.id],
    }),
    index("production_tasks_equipment_schedule_idx").on(
      table.tenantId,
      table.equipmentId,
      table.plannedStartAt,
      table.plannedEndAt,
    ),
    index("production_tasks_tenant_attention_idx").on(
      table.tenantId,
      table.status,
      table.nextAttentionAt,
      table.plannedStartAt,
    ),
  ],
);

export const productionTaskDependencies = pgTable(
  "production_task_dependencies",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionPlanId: uuid("production_plan_id").notNull(),
    predecessorTaskId: uuid("predecessor_task_id").notNull(),
    successorTaskId: uuid("successor_task_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.predecessorTaskId, table.successorTaskId],
    }),
    foreignKey({
      name: "production_task_dependencies_plan_tenant_fk",
      columns: [table.tenantId, table.productionPlanId],
      foreignColumns: [productionPlans.tenantId, productionPlans.id],
    }),
    foreignKey({
      name: "production_task_dependencies_predecessor_tenant_fk",
      columns: [table.tenantId, table.predecessorTaskId],
      foreignColumns: [productionTasks.tenantId, productionTasks.id],
    }),
    foreignKey({
      name: "production_task_dependencies_successor_tenant_fk",
      columns: [table.tenantId, table.successorTaskId],
      foreignColumns: [productionTasks.tenantId, productionTasks.id],
    }),
    index("production_task_dependencies_successor_idx").on(
      table.tenantId,
      table.successorTaskId,
    ),
  ],
);

export const productionNotes = pgTable(
  "production_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionTaskId: uuid("production_task_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_notes_tenant_id_id_unique").on(table.tenantId, table.id),
    unique("production_notes_tenant_task_unique").on(
      table.tenantId,
      table.productionTaskId,
    ),
    foreignKey({
      name: "production_notes_task_tenant_fk",
      columns: [table.tenantId, table.productionTaskId],
      foreignColumns: [productionTasks.tenantId, productionTasks.id],
    }),
    index("production_notes_tenant_updated_idx").on(
      table.tenantId,
      table.updatedAt,
    ),
  ],
);

export const productionTaskConsumptions = pgTable(
  "production_task_consumptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionTaskId: uuid("production_task_id").notNull(),
    orderRequirementId: uuid("order_requirement_id").notNull(),
    plannedQuantityBase: numeric("planned_quantity_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    reservedQuantityBase: numeric("reserved_quantity_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    actualUsedBase: numeric("actual_used_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    lossBase: numeric("loss_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_task_consumptions_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique("production_task_consumptions_task_requirement_unique").on(
      table.tenantId,
      table.productionTaskId,
      table.orderRequirementId,
    ),
    foreignKey({
      name: "production_task_consumptions_task_tenant_fk",
      columns: [table.tenantId, table.productionTaskId],
      foreignColumns: [productionTasks.tenantId, productionTasks.id],
    }),
    index("production_task_consumptions_task_idx").on(
      table.tenantId,
      table.productionTaskId,
      table.confirmedAt,
    ),
  ],
);

export const productionConsumptionCorrections = pgTable(
  "production_consumption_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productionTaskId: uuid("production_task_id").notNull(),
    reason: text("reason").notNull(),
    correctedAt: timestamp("corrected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_consumption_corrections_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "production_consumption_corrections_task_tenant_fk",
      columns: [table.tenantId, table.productionTaskId],
      foreignColumns: [productionTasks.tenantId, productionTasks.id],
    }),
    index("production_consumption_corrections_task_idx").on(
      table.tenantId,
      table.productionTaskId,
      table.correctedAt,
    ),
  ],
);

export const productionConsumptionCorrectionLines = pgTable(
  "production_consumption_correction_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    correctionId: uuid("correction_id").notNull(),
    consumptionId: uuid("consumption_id").notNull(),
    previousActualUsedBase: numeric("previous_actual_used_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    previousLossBase: numeric("previous_loss_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    correctedActualUsedBase: numeric("corrected_actual_used_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    correctedLossBase: numeric("corrected_loss_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    actualUsedDeltaBase: numeric("actual_used_delta_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    lossDeltaBase: numeric("loss_delta_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("production_consumption_correction_lines_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    unique(
      "production_consumption_correction_lines_batch_consumption_unique",
    ).on(table.tenantId, table.correctionId, table.consumptionId),
    foreignKey({
      name: "production_consumption_correction_lines_correction_tenant_fk",
      columns: [table.tenantId, table.correctionId],
      foreignColumns: [
        productionConsumptionCorrections.tenantId,
        productionConsumptionCorrections.id,
      ],
    }),
    foreignKey({
      name: "production_consumption_correction_lines_consumption_tenant_fk",
      columns: [table.tenantId, table.consumptionId],
      foreignColumns: [
        productionTaskConsumptions.tenantId,
        productionTaskConsumptions.id,
      ],
    }),
    index("production_consumption_correction_lines_consumption_idx").on(
      table.tenantId,
      table.consumptionId,
      table.createdAt,
    ),
  ],
);

export const orderRequirements = pgTable(
  "order_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    orderItemId: uuid("order_item_id").notNull(),
    sourceRecipeLineId: uuid("source_recipe_line_id"),
    ingredientGroupId: uuid("ingredient_group_id").notNull(),
    ingredientNameSnapshot: text("ingredient_name_snapshot").notNull(),
    preferredCommercialItemId: uuid("preferred_commercial_item_id"),
    selectionPolicy: recipeSelectionPolicy("selection_policy").notNull(),
    requiredBase: numeric("required_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    availableAtConfirmationBase: numeric("available_at_confirmation_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    shortageBase: numeric("shortage_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    status: orderRequirementStatus("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("order_requirements_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "order_requirements_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    foreignKey({
      name: "order_requirements_item_tenant_fk",
      columns: [table.tenantId, table.orderItemId],
      foreignColumns: [orderItems.tenantId, orderItems.id],
    }),
    foreignKey({
      name: "order_requirements_source_line_tenant_fk",
      columns: [table.tenantId, table.sourceRecipeLineId],
      foreignColumns: [recipeLines.tenantId, recipeLines.id],
    }),
    foreignKey({
      name: "order_requirements_group_tenant_fk",
      columns: [table.tenantId, table.ingredientGroupId],
      foreignColumns: [ingredientGroups.tenantId, ingredientGroups.id],
    }),
    foreignKey({
      name: "order_requirements_preferred_tenant_fk",
      columns: [
        table.tenantId,
        table.preferredCommercialItemId,
        table.ingredientGroupId,
      ],
      foreignColumns: [
        commercialItems.tenantId,
        commercialItems.id,
        commercialItems.ingredientGroupId,
      ],
    }),
    index("order_requirements_source_line_idx").on(
      table.tenantId,
      table.sourceRecipeLineId,
    ),
  ],
);

export const shoppingNeeds = pgTable(
  "shopping_needs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
    commercialItemId: uuid("commercial_item_id"),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    shortageBase: numeric("shortage_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    packageContentBase: numeric("package_content_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    packagesToBuy: integer("packages_to_buy").notNull(),
    purchaseQuantityBase: numeric("purchase_quantity_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    neededBy: timestamp("needed_by", { withTimezone: true }).notNull(),
    status: shoppingNeedStatus("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("shopping_needs_tenant_id_id_unique").on(table.tenantId, table.id),
    foreignKey({
      name: "shopping_needs_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    foreignKey({
      name: "shopping_needs_requirement_tenant_fk",
      columns: [table.tenantId, table.requirementId],
      foreignColumns: [orderRequirements.tenantId, orderRequirements.id],
    }),
    foreignKey({
      name: "shopping_needs_item_tenant_fk",
      columns: [table.tenantId, table.commercialItemId],
      foreignColumns: [commercialItems.tenantId, commercialItems.id],
    }),
  ],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").notNull(),
    requirementId: uuid("requirement_id").notNull(),
    lotId: uuid("lot_id").notNull(),
    quantityBase: numeric("quantity_base", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("inventory_reservations_tenant_id_id_unique").on(
      table.tenantId,
      table.id,
    ),
    foreignKey({
      name: "inventory_reservations_order_tenant_fk",
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    foreignKey({
      name: "inventory_reservations_requirement_tenant_fk",
      columns: [table.tenantId, table.requirementId],
      foreignColumns: [orderRequirements.tenantId, orderRequirements.id],
    }),
    foreignKey({
      name: "inventory_reservations_lot_tenant_fk",
      columns: [table.tenantId, table.lotId],
      foreignColumns: [purchaseLots.tenantId, purchaseLots.id],
    }),
  ],
);
