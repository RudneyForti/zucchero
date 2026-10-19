import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { TenantRequest } from "./tenant-request";

export type AccessRequirement =
  "owner" | "operational" | "financial" | "orders-read";

export const ACCESS_REQUIREMENT = "zucchero:access-requirement";
export const RequireAccess = (requirement: AccessRequirement) =>
  SetMetadata(ACCESS_REQUIREMENT, requirement);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<AccessRequirement>(
      ACCESS_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenant = request.raw.tenantContext;
    if (!tenant) return true;
    const allowed =
      tenant.role === "owner" ||
      (requirement === "operational" && tenant.operationalAccess) ||
      (requirement === "financial" && tenant.financialAccess) ||
      (requirement === "orders-read" &&
        (tenant.operationalAccess || tenant.financialAccess));

    if (!allowed) {
      throw new ForbiddenException(
        requirement === "financial"
          ? "Seu acesso não inclui o Financeiro."
          : requirement === "owner"
            ? "Somente a proprietária pode cuidar de pessoas e configurações."
            : "Seu acesso não inclui esta parte da operação.",
      );
    }
    return true;
  }
}
