import type { AppTransaction } from "../../database/database.service";
import { outboxEvents } from "../../database/schema";

export type OutboxEventInput = {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  payload?: Record<string, unknown>;
};

export async function appendOutboxEvent(
  transaction: AppTransaction,
  input: OutboxEventInput,
) {
  const [event] = await transaction
    .insert(outboxEvents)
    .values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
      payload: input.payload ?? {},
    })
    .returning({ id: outboxEvents.id });
  return event?.id;
}
