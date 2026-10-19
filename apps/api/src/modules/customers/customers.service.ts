import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { appendOutboxEvent } from "../async/outbox";
import {
  DatabaseService,
  type AppTransaction,
} from "../../database/database.service";
import {
  auditEvents,
  customerAddresses,
  customers,
  orderItems,
  orderReceipts,
  orders,
} from "../../database/schema";
import type {
  AnonymizeCustomerInput,
  CustomerAddress,
  CustomerPrivacyExport,
  CustomerProfile,
  CustomerWorkspace,
  SaveCustomerInput,
  SaveCustomerResult,
} from "./customers.contract";

type CustomerRow = typeof customers.$inferSelect;
type AddressRow = typeof customerAddresses.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

type MemoryCustomer = CustomerProfile & {
  normalizedName: string;
  normalizedPhone: string;
};

const demoTenantId = "11111111-1111-4111-8111-111111111111";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value: string) {
  return value.replace(/\D+/g, "");
}

function normalizedAddresses(input: SaveCustomerInput) {
  const requestedDefault = input.addresses.findIndex(
    (address) => address.isDefault,
  );
  const defaultIndex = requestedDefault >= 0 ? requestedDefault : 0;
  return input.addresses.map((address, index) => ({
    ...address,
    isDefault: index === defaultIndex,
  }));
}

function publicMemoryCustomer(customer: MemoryCustomer): CustomerProfile {
  return {
    id: customer.id,
    name: customer.name,
    primaryPhone: customer.primaryPhone,
    email: customer.email,
    notes: customer.notes,
    preferredDeliveryMode: customer.preferredDeliveryMode,
    preferredPaymentMethod: customer.preferredPaymentMethod,
    addresses: customer.addresses.map((address) => ({ ...address })),
    orderCount: customer.orderCount,
    lastOrderAt: customer.lastOrderAt,
  };
}

function demoCustomers(): MemoryCustomer[] {
  return [
    {
      id: "91111111-1111-4111-8111-111111111111",
      name: "Ana Paula",
      normalizedName: "ana paula",
      primaryPhone: "(11) 98888-1234",
      normalizedPhone: "11988881234",
      email: "ana@example.invalid",
      notes: "Prefere confirmações objetivas pelo WhatsApp.",
      preferredDeliveryMode: "delivery",
      preferredPaymentMethod: "pix",
      addresses: [
        {
          id: "94111111-1111-4111-8111-111111111111",
          label: "Casa",
          recipient: "Ana Paula",
          formattedAddress: "Rua das Acácias, 128 · Centro",
          postalCode: null,
          street: "Rua das Acácias",
          addressNumber: "128",
          addressComplement: null,
          neighborhood: "Centro",
          city: null,
          state: null,
          deliveryInstructions:
            "Interfone 12; deixar na portaria somente com autorização.",
          isDefault: true,
        },
      ],
      orderCount: 0,
      lastOrderAt: null,
    },
    {
      id: "92222222-2222-4222-8222-222222222222",
      name: "Marina Lopes",
      normalizedName: "marina lopes",
      primaryPhone: "(11) 97777-4455",
      normalizedPhone: "11977774455",
      email: null,
      notes: null,
      preferredDeliveryMode: "pickup",
      preferredPaymentMethod: "pix",
      addresses: [],
      orderCount: 0,
      lastOrderAt: null,
    },
    {
      id: "93333333-3333-4333-8333-333333333333",
      name: "Beatriz Nunes",
      normalizedName: "beatriz nunes",
      primaryPhone: "(11) 96666-7788",
      normalizedPhone: "11966667788",
      email: "beatriz@example.invalid",
      notes: "Entregas em horário comercial.",
      preferredDeliveryMode: "delivery",
      preferredPaymentMethod: "card",
      addresses: [
        {
          id: "94333333-3333-4333-8333-333333333333",
          label: "Trabalho",
          recipient: "Beatriz Nunes",
          formattedAddress: "Av. das Flores, 440 · Jardim América",
          postalCode: null,
          street: "Av. das Flores",
          addressNumber: "440",
          addressComplement: null,
          neighborhood: "Jardim América",
          city: null,
          state: null,
          deliveryInstructions: "Recepção no térreo.",
          isDefault: true,
        },
      ],
      orderCount: 0,
      lastOrderAt: null,
    },
  ];
}

@Injectable()
export class CustomersService {
  private readonly memory = new Map<string, MemoryCustomer[]>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getForTenant(tenantId: string): Promise<CustomerWorkspace> {
    if (!this.database.isConfigured) {
      return this.workspaceFrom(
        this.memoryFor(tenantId).map(publicMemoryCustomer),
      );
    }
    return this.database.withTenant(tenantId, (transaction) =>
      this.loadWorkspace(transaction),
    );
  }

  async create(
    tenantId: string,
    input: SaveCustomerInput,
  ): Promise<SaveCustomerResult> {
    const normalizedPhone = this.checkedPhone(input.primaryPhone);
    if (!this.database.isConfigured) {
      return this.createInMemory(tenantId, input, normalizedPhone);
    }

    return this.database.withTenant(tenantId, async (transaction) => {
      await this.assertPhoneAvailable(transaction, normalizedPhone);
      const [storedCustomer] = await transaction
        .insert(customers)
        .values({
          tenantId,
          name: input.name,
          normalizedName: normalizeName(input.name),
          primaryPhone: input.primaryPhone,
          normalizedPhone,
          email: input.email || null,
          notes: input.notes,
          preferredDeliveryMode: input.preferredDeliveryMode ?? null,
          preferredPaymentMethod: input.preferredPaymentMethod ?? null,
        })
        .returning();
      if (!storedCustomer)
        throw new ConflictException("Não foi possível criar a cliente.");

      await this.saveAddresses(
        transaction,
        tenantId,
        storedCustomer.id,
        input,
        [],
      );
      await transaction.insert(auditEvents).values({
        tenantId,
        eventType: "CUSTOMER_CREATED",
        correlationId: randomUUID(),
        payload: { customerId: storedCustomer.id },
      });

      return this.resultFrom(
        transaction,
        storedCustomer.id,
        `${storedCustomer.name} agora faz parte do caderno de clientes.`,
      );
    });
  }

  async update(
    tenantId: string,
    customerId: string,
    input: SaveCustomerInput,
  ): Promise<SaveCustomerResult> {
    const normalizedPhone = this.checkedPhone(input.primaryPhone);
    if (!this.database.isConfigured) {
      return this.updateInMemory(tenantId, customerId, input, normalizedPhone);
    }

    return this.database.withTenant(tenantId, async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.active, true)));
      if (!existing)
        throw new NotFoundException("A cliente não foi encontrada.");
      await this.assertPhoneAvailable(transaction, normalizedPhone, customerId);

      await transaction
        .update(customers)
        .set({
          name: input.name,
          normalizedName: normalizeName(input.name),
          primaryPhone: input.primaryPhone,
          normalizedPhone,
          email: input.email || null,
          notes: input.notes,
          preferredDeliveryMode: input.preferredDeliveryMode ?? null,
          preferredPaymentMethod: input.preferredPaymentMethod ?? null,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId));

      const existingAddresses = await transaction
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, customerId));
      await this.saveAddresses(
        transaction,
        tenantId,
        customerId,
        input,
        existingAddresses,
      );
      await transaction.insert(auditEvents).values({
        tenantId,
        eventType: "CUSTOMER_UPDATED",
        correlationId: randomUUID(),
        payload: { customerId },
      });

      return this.resultFrom(
        transaction,
        customerId,
        `O cadastro de ${input.name} foi atualizado.`,
      );
    });
  }

  async exportPrivacyData(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerPrivacyExport> {
    if (!this.database.isConfigured) {
      const customer = this.memoryFor(tenantId).find(
        (entry) => entry.id === customerId,
      );
      if (!customer)
        throw new NotFoundException("A cliente não foi encontrada.");
      return {
        generatedAt: new Date().toISOString(),
        customer: publicMemoryCustomer(customer),
        orders: [],
      };
    }

    return this.database.withTenant(tenantId, async (transaction) => {
      const [customer] = await transaction
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.active, true)));
      if (!customer)
        throw new NotFoundException("A cliente não foi encontrada.");

      const [addresses, customerOrders, items, receipts] = await Promise.all([
        transaction
          .select()
          .from(customerAddresses)
          .where(
            and(
              eq(customerAddresses.customerId, customerId),
              eq(customerAddresses.active, true),
            ),
          ),
        transaction
          .select()
          .from(orders)
          .where(eq(orders.customerId, customerId))
          .orderBy(asc(orders.confirmedAt)),
        transaction.select().from(orderItems),
        transaction.select().from(orderReceipts),
      ]);
      const profile = this.project([customer], addresses, customerOrders)
        .customers[0];
      if (!profile) throw new NotFoundException("A cliente não foi projetada.");

      await transaction.insert(auditEvents).values({
        tenantId,
        eventType: "CUSTOMER_PRIVACY_DATA_EXPORTED",
        correlationId: randomUUID(),
        payload: { customerId, orderCount: customerOrders.length },
      });
      return {
        generatedAt: new Date().toISOString(),
        customer: profile,
        orders: customerOrders.map((order) => ({
          number: order.orderNumber,
          status: order.status,
          confirmedAt: order.confirmedAt.toISOString(),
          deliveryAt: order.deliveryAt.toISOString(),
          deliveryMode: order.deliveryMode,
          address: order.addressSnapshot,
          items: items
            .filter((item) => item.orderId === order.id)
            .map((item) => ({
              recipeName: item.recipeNameSnapshot,
              recipeVersionNumber: item.recipeVersionNumber,
              requestedMassG: item.requestedMassG,
              price: item.price,
            })),
          receipts: receipts
            .filter((receipt) => receipt.orderId === order.id)
            .map((receipt) => ({
              kind: receipt.kind,
              amount: receipt.amount,
              feeAmount: receipt.feeAmount,
              paymentMethod: receipt.paymentMethod,
              receivedAt: receipt.receivedAt.toISOString(),
            })),
        })),
      };
    });
  }

  async anonymize(
    tenantId: string,
    customerId: string,
    input: AnonymizeCustomerInput,
  ): Promise<{ message: string; workspace: CustomerWorkspace }> {
    if (!this.database.isConfigured) {
      const stored = this.memoryFor(tenantId);
      const index = stored.findIndex((entry) => entry.id === customerId);
      if (index < 0)
        throw new NotFoundException("A cliente não foi encontrada.");
      stored.splice(index, 1);
      return {
        message: "Os dados pessoais foram anonimizados.",
        workspace: this.workspaceFrom(stored.map(publicMemoryCustomer)),
      };
    }

    return this.database.withTenant(tenantId, async (transaction) => {
      const [customer] = await transaction
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.active, true)));
      if (!customer)
        throw new NotFoundException("A cliente não foi encontrada.");

      const anonymizedAt = new Date();
      const anonymizedName = "Cliente anonimizada";
      await transaction
        .update(customerAddresses)
        .set({
          label: "Removido",
          recipient: anonymizedName,
          formattedAddress: "Dados removidos por solicitação de privacidade",
          postalCode: null,
          street: null,
          addressNumber: null,
          addressComplement: null,
          neighborhood: null,
          city: null,
          state: null,
          deliveryInstructions: null,
          isDefault: false,
          active: false,
          updatedAt: anonymizedAt,
        })
        .where(eq(customerAddresses.customerId, customerId));
      const anonymizedOrders = await transaction
        .update(orders)
        .set({
          customerNameSnapshot: anonymizedName,
          customerPhoneSnapshot: "Removido",
          addressSnapshot: null,
          notes: null,
        })
        .where(eq(orders.customerId, customerId))
        .returning({ id: orders.id });
      await transaction
        .update(customers)
        .set({
          name: anonymizedName,
          normalizedName: `anonimizada ${customerId}`,
          primaryPhone: "Removido",
          normalizedPhone: `anon-${customerId}`,
          email: null,
          notes: null,
          preferredDeliveryMode: null,
          preferredPaymentMethod: null,
          active: false,
          anonymizedAt,
          updatedAt: anonymizedAt,
        })
        .where(eq(customers.id, customerId));
      const correlationId = randomUUID();
      await transaction.insert(auditEvents).values({
        tenantId,
        eventType: "CUSTOMER_ANONYMIZED",
        correlationId,
        payload: {
          customerId,
          orderCount: anonymizedOrders.length,
          reason: input.reason,
          confirmation: input.confirmation,
        },
      });
      await appendOutboxEvent(transaction, {
        tenantId,
        eventType: "customer.anonymized",
        aggregateType: "customer",
        aggregateId: customerId,
        correlationId,
        payload: { orderCount: anonymizedOrders.length },
      });
      return {
        message:
          "Os dados pessoais foram anonimizados. Pedidos e valores continuam preservados sem identificar a cliente.",
        workspace: await this.loadWorkspace(transaction),
      };
    });
  }

  private checkedPhone(value: string) {
    const normalized = normalizePhone(value);
    if (normalized.length < 8 || normalized.length > 15) {
      throw new BadRequestException(
        "Informe um telefone com DDD para identificar a cliente.",
      );
    }
    return normalized;
  }

  private async assertPhoneAvailable(
    transaction: AppTransaction,
    normalizedPhone: string,
    currentCustomerId?: string,
  ) {
    const condition = currentCustomerId
      ? and(
          eq(customers.normalizedPhone, normalizedPhone),
          eq(customers.active, true),
          ne(customers.id, currentCustomerId),
        )
      : and(
          eq(customers.normalizedPhone, normalizedPhone),
          eq(customers.active, true),
        );
    const [duplicate] = await transaction
      .select()
      .from(customers)
      .where(condition);
    if (!duplicate) return;

    throw new ConflictException({
      code: "CUSTOMER_PHONE_IN_USE",
      message: `Este telefone já está no cadastro de ${duplicate.name}.`,
      candidate: {
        id: duplicate.id,
        name: duplicate.name,
        primaryPhone: duplicate.primaryPhone,
      },
    });
  }

  private async saveAddresses(
    transaction: AppTransaction,
    tenantId: string,
    customerId: string,
    input: SaveCustomerInput,
    existing: AddressRow[],
  ) {
    const addresses = normalizedAddresses(input);
    const submittedIds = new Set(
      addresses.flatMap((address) => (address.id ? [address.id] : [])),
    );

    await transaction
      .update(customerAddresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(customerAddresses.customerId, customerId));

    for (const address of existing) {
      if (!submittedIds.has(address.id)) {
        await transaction
          .update(customerAddresses)
          .set({ active: false, isDefault: false, updatedAt: new Date() })
          .where(eq(customerAddresses.id, address.id));
      }
    }

    for (const address of addresses) {
      const values = {
        label: address.label,
        recipient: address.recipient,
        formattedAddress: address.formattedAddress,
        postalCode: address.postalCode,
        street: address.street,
        addressNumber: address.addressNumber,
        addressComplement: address.addressComplement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state?.toUpperCase() ?? null,
        deliveryInstructions: address.deliveryInstructions,
        isDefault: address.isDefault,
        active: true,
        updatedAt: new Date(),
      };
      if (address.id) {
        const owned = existing.some((entry) => entry.id === address.id);
        if (!owned)
          throw new BadRequestException(
            "Um dos endereços não pertence a esta cliente.",
          );
        await transaction
          .update(customerAddresses)
          .set(values)
          .where(eq(customerAddresses.id, address.id));
      } else {
        await transaction.insert(customerAddresses).values({
          tenantId,
          customerId,
          ...values,
        });
      }
    }
  }

  private async resultFrom(
    transaction: AppTransaction,
    customerId: string,
    message: string,
  ) {
    const workspace = await this.loadWorkspace(transaction);
    const customer = workspace.customers.find(
      (entry) => entry.id === customerId,
    );
    if (!customer) throw new NotFoundException("A cliente não foi projetada.");
    return { message, customer, workspace };
  }

  private async loadWorkspace(
    transaction: AppTransaction,
  ): Promise<CustomerWorkspace> {
    const [customerRows, addressRows, orderRows] = await Promise.all([
      transaction
        .select()
        .from(customers)
        .where(eq(customers.active, true))
        .orderBy(asc(customers.name)),
      transaction
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.active, true))
        .orderBy(asc(customerAddresses.createdAt)),
      transaction.select().from(orders),
    ]);
    return this.project(customerRows, addressRows, orderRows);
  }

  private project(
    customerRows: CustomerRow[],
    addressRows: AddressRow[],
    orderRows: OrderRow[],
  ) {
    const profiles = customerRows.map((customer): CustomerProfile => {
      const customerOrders = orderRows.filter(
        (order) => order.customerId === customer.id,
      );
      const lastOrder = customerOrders.toSorted(
        (left, right) =>
          right.confirmedAt.getTime() - left.confirmedAt.getTime(),
      )[0];
      return {
        id: customer.id,
        name: customer.name,
        primaryPhone: customer.primaryPhone,
        email: customer.email,
        notes: customer.notes,
        preferredDeliveryMode: customer.preferredDeliveryMode,
        preferredPaymentMethod: customer.preferredPaymentMethod as
          "pix" | "card" | "cash" | null,
        addresses: addressRows
          .filter((address) => address.customerId === customer.id)
          .map((address): CustomerAddress => ({
            id: address.id,
            label: address.label,
            recipient: address.recipient,
            formattedAddress: address.formattedAddress,
            postalCode: address.postalCode,
            street: address.street,
            addressNumber: address.addressNumber,
            addressComplement: address.addressComplement,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            deliveryInstructions: address.deliveryInstructions,
            isDefault: address.isDefault,
          }))
          .toSorted(
            (left, right) => Number(right.isDefault) - Number(left.isDefault),
          ),
        orderCount: customerOrders.length,
        lastOrderAt: lastOrder?.confirmedAt.toISOString() ?? null,
      };
    });
    return this.workspaceFrom(profiles);
  }

  private workspaceFrom(profiles: CustomerProfile[]): CustomerWorkspace {
    return {
      summary: {
        customerCount: profiles.length,
        deliveryReadyCount: profiles.filter(
          (customer) => customer.addresses.length > 0,
        ).length,
        returningCount: profiles.filter((customer) => customer.orderCount > 1)
          .length,
      },
      customers: profiles,
    };
  }

  private memoryFor(tenantId: string) {
    if (!this.memory.has(tenantId)) {
      this.memory.set(
        tenantId,
        tenantId === demoTenantId ? demoCustomers() : [],
      );
    }
    return this.memory.get(tenantId)!;
  }

  private createInMemory(
    tenantId: string,
    input: SaveCustomerInput,
    normalizedPhone: string,
  ): SaveCustomerResult {
    const stored = this.memoryFor(tenantId);
    this.assertMemoryPhone(stored, normalizedPhone);
    const customer = this.memoryCustomer(input, normalizedPhone);
    stored.push(customer);
    stored.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    return {
      message: `${customer.name} agora faz parte do caderno de clientes.`,
      customer: publicMemoryCustomer(customer),
      workspace: this.workspaceFrom(stored.map(publicMemoryCustomer)),
    };
  }

  private updateInMemory(
    tenantId: string,
    customerId: string,
    input: SaveCustomerInput,
    normalizedPhone: string,
  ): SaveCustomerResult {
    const stored = this.memoryFor(tenantId);
    const index = stored.findIndex((customer) => customer.id === customerId);
    if (index < 0) throw new NotFoundException("A cliente não foi encontrada.");
    this.assertMemoryPhone(stored, normalizedPhone, customerId);
    const previous = stored[index]!;
    const updated = this.memoryCustomer(
      input,
      normalizedPhone,
      customerId,
      previous,
    );
    stored[index] = updated;
    stored.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    return {
      message: `O cadastro de ${updated.name} foi atualizado.`,
      customer: publicMemoryCustomer(updated),
      workspace: this.workspaceFrom(stored.map(publicMemoryCustomer)),
    };
  }

  private assertMemoryPhone(
    stored: MemoryCustomer[],
    normalizedPhone: string,
    currentCustomerId?: string,
  ) {
    const duplicate = stored.find(
      (customer) =>
        customer.normalizedPhone === normalizedPhone &&
        customer.id !== currentCustomerId,
    );
    if (!duplicate) return;
    throw new ConflictException({
      code: "CUSTOMER_PHONE_IN_USE",
      message: `Este telefone já está no cadastro de ${duplicate.name}.`,
      candidate: {
        id: duplicate.id,
        name: duplicate.name,
        primaryPhone: duplicate.primaryPhone,
      },
    });
  }

  private memoryCustomer(
    input: SaveCustomerInput,
    normalizedPhone: string,
    id: string = randomUUID(),
    previous?: MemoryCustomer,
  ): MemoryCustomer {
    return {
      id,
      name: input.name,
      normalizedName: normalizeName(input.name),
      primaryPhone: input.primaryPhone,
      normalizedPhone,
      email: input.email || null,
      notes: input.notes,
      preferredDeliveryMode: input.preferredDeliveryMode ?? null,
      preferredPaymentMethod: input.preferredPaymentMethod ?? null,
      addresses: normalizedAddresses(input).map((address) => ({
        id: address.id ?? randomUUID(),
        label: address.label,
        recipient: address.recipient,
        formattedAddress: address.formattedAddress,
        postalCode: address.postalCode,
        street: address.street,
        addressNumber: address.addressNumber,
        addressComplement: address.addressComplement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        deliveryInstructions: address.deliveryInstructions,
        isDefault: address.isDefault,
      })),
      orderCount: previous?.orderCount ?? 0,
      lastOrderAt: previous?.lastOrderAt ?? null,
    };
  }
}
