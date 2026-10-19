export type TenantContext = {
  tenantId: string;
  userId: string | null;
  subject: string;
  role: "owner" | "employee";
  operationalAccess: boolean;
  financialAccess: boolean;
  source: "development-demo" | "local" | "cognito";
};
