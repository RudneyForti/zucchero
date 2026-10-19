import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import {
  ACCESS_REQUIREMENT,
  AccessGuard,
  type AccessRequirement,
} from "./access-control";
import type { TenantContext } from "./tenant-context";

function context(requirement: AccessRequirement, tenant: TenantContext) {
  const handler = () => undefined;
  Reflect.defineMetadata(ACCESS_REQUIREMENT, requirement, handler);
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ raw: { tenantContext: tenant } }),
    }),
  } as unknown as ExecutionContext;
}

const employee = (
  operationalAccess: boolean,
  financialAccess: boolean,
): TenantContext => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  subject: "local:test",
  role: "employee",
  operationalAccess,
  financialAccess,
  source: "local",
});

describe("AccessGuard", () => {
  const guard = new AccessGuard(new Reflector());

  it("permite Operacional na despensa e recusa Financeiro", () => {
    expect(
      guard.canActivate(context("operational", employee(true, false))),
    ).toBe(true);
    expect(() =>
      guard.canActivate(context("financial", employee(true, false))),
    ).toThrow(ForbiddenException);
  });

  it("permite Financeiro ler pedidos sem liberar a operação", () => {
    expect(
      guard.canActivate(context("orders-read", employee(false, true))),
    ).toBe(true);
    expect(() =>
      guard.canActivate(context("operational", employee(false, true))),
    ).toThrow(ForbiddenException);
  });

  it("mantém a gestão de pessoas exclusiva da proprietária", () => {
    expect(() =>
      guard.canActivate(context("owner", employee(true, true))),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        context("owner", { ...employee(true, true), role: "owner" }),
      ),
    ).toBe(true);
  });
});
