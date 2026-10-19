import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import helmet from "@fastify/helmet";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const adapter = new FastifyAdapter({
    genReqId: (request: IncomingMessage) =>
      request.headers["x-correlation-id"]?.toString() ?? randomUUID(),
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      bufferLogs: true,
    },
  );

  app.useLogger(new Logger("ConfeitariaApi"));
  app.setGlobalPrefix("v1");
  app.enableCors({
    credentials: true,
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
  });
  await app.register(helmet, { contentSecurityPolicy: false });

  const openApiConfig = new DocumentBuilder()
    .setTitle("Confeitaria API")
    .setDescription("Contrato inicial do monolito modular da confeitaria.")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("v1/docs", app, document);

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}

void bootstrap();
