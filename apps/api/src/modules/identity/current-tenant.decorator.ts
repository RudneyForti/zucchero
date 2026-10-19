import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { TenantContext } from "./tenant-context";
import type { TenantRequest } from "./tenant-request";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.raw.tenantContext) {
      throw new Error("TenantContextMiddleware não foi executado.");
    }
    return request.raw.tenantContext;
  },
);
