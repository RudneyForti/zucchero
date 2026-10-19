import "reflect-metadata";
import { createServer } from "node:http";
import { Logger } from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import postgres from "postgres";

type OutboxRow = {
  id: string;
  tenant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  correlation_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
};

type DomainEventJob = {
  outboxId: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

const queueName = "confeitaria-domain-events";
const logger = new Logger("OutboxWorker");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const databaseUrl =
  process.env.DATABASE_WORKER_URL ?? process.env.DATABASE_ADMIN_URL;

if (!databaseUrl) {
  throw new Error("Informe DATABASE_WORKER_URL para iniciar o worker.");
}

const sql = postgres(databaseUrl, { max: 3, prepare: false });
const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue<DomainEventJob>(queueName, {
  connection: queueConnection,
});

async function claimBatch() {
  return sql.begin(async (transaction) => {
    const rows = await transaction<OutboxRow[]>`
      select
        id,
        tenant_id,
        event_type,
        aggregate_type,
        aggregate_id,
        correlation_id,
        payload,
        created_at
      from outbox_events
      where available_at <= now()
        and (
          status = 'pending'
          or (status = 'queued' and queued_at < now() - interval '5 minutes')
        )
      order by created_at
      for update skip locked
      limit 25
    `;
    if (rows.length > 0) {
      const ids = rows.map((row) => row.id);
      await transaction`
        update outbox_events
        set status = 'queued', queued_at = now(), attempts = attempts + 1,
            last_error = null
        where id in ${sql(ids)}
      `;
    }
    return rows;
  });
}

async function dispatch() {
  for (const row of await claimBatch()) {
    try {
      await queue.add(
        "domain-event",
        {
          outboxId: row.id,
          tenantId: row.tenant_id,
          eventType: row.event_type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          correlationId: row.correlation_id,
          payload: row.payload,
          occurredAt: row.created_at.toISOString(),
        },
        {
          jobId: row.id,
          attempts: 5,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: { age: 24 * 60 * 60, count: 2_000 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 2_000 },
        },
      );
    } catch (error) {
      await sql`
        update outbox_events
        set status = 'pending', last_error = ${
          error instanceof Error ? error.message : String(error)
        }
        where id = ${row.id}
      `;
    }
  }
}

const worker = new Worker<DomainEventJob>(
  queueName,
  async (job: Job<DomainEventJob>) => {
    logger.log(
      JSON.stringify({
        event: job.data.eventType,
        tenantId: job.data.tenantId,
        aggregate: `${job.data.aggregateType}:${job.data.aggregateId}`,
        correlationId: job.data.correlationId,
      }),
    );
    await sql`
      update outbox_events
      set status = 'processed', processed_at = now(), last_error = null
      where id = ${job.data.outboxId}
    `;
  },
  { connection: workerConnection, concurrency: 5 },
);

const healthServer = createServer(async (request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }
  try {
    await Promise.all([sql`select 1`, queue.waitUntilReady()]);
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ status: "ok", worker: "outbox" }));
  } catch {
    response
      .writeHead(503, { "content-type": "application/json" })
      .end(JSON.stringify({ status: "unavailable", worker: "outbox" }));
  }
});
healthServer.listen(3002, "0.0.0.0");

worker.on("failed", (job, error) => {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  void sql`
    update outbox_events
    set status = 'failed', last_error = ${error.message}
    where id = ${job.data.outboxId}
  `;
});

const timer = setInterval(() => void dispatch(), 1_000);
timer.unref();
void dispatch();
logger.log("Worker de eventos iniciado.");

async function shutdown() {
  clearInterval(timer);
  await new Promise<void>((resolve, reject) =>
    healthServer.close((error) => (error ? reject(error) : resolve())),
  );
  await worker.close();
  await queue.close();
  await queueConnection.quit();
  await workerConnection.quit();
  await sql.end({ timeout: 5 });
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
