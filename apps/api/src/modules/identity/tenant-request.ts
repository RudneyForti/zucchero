import type { IncomingMessage } from "node:http";
import type { FastifyRequest } from "fastify";
import type { TenantContext } from "./tenant-context";

export type TenantRawRequest = IncomingMessage & {
  tenantContext?: TenantContext;
};

export type TenantRequest = FastifyRequest & {
  raw: TenantRawRequest;
};
